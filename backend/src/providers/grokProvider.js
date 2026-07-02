/**
 * grokProvider.js
 *
 * Spawns the `grok` CLI in headless / single-turn mode so we never have to
 * drive an interactive TUI from Node.js.  All previous bugs are fixed here:
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ROOT CAUSE SUMMARY (old code)                                          ║
 * ║                                                                         ║
 * ║  1. `spawn(GROK_CMD, args)` with stdio pipes launched grok normally     ║
 * ║     (interactive TUI mode). grok detects it has no real TTY and may     ║
 * ║     behave unexpectedly — but more importantly it NEVER exits cleanly   ║
 * ║     on its own.  Node's `child_process.spawn` `timeout` option kills    ║
 * ║     the process with SIGTERM after the deadline.  When a process is     ║
 * ║     killed by a signal, Node fires `close(null, 'SIGTERM')` — `code`   ║
 * ║     is literally `null`.  The old code checked `if (code !== 0)` which  ║
 * ║     treats null as failure, so every successful generation still        ║
 * ║     reported "exited with code null".                                   ║
 * ║                                                                         ║
 * ║  2. grok's TUI writes raw ANSI escape codes (cursor moves, spinner      ║
 * ║     frames ⠋⠙⠹, colour sequences).  Piped stdout is full of them.       ║
 * ║     The regex that looked for an output file path in stdout could never ║
 * ║     match because the lines were contaminated.                          ║
 * ║                                                                         ║
 * ║  3. `spawn`'s `timeout` option kills via SIGTERM but does NOT give      ║
 * ║     Node control of when/how to clean up — there's no way to attach     ║
 * ║     context to it.  We replace it with a manual AbortController so      ║
 * ║     we know exactly who fired the kill.                                 ║
 * ║                                                                         ║
 * ║  FIX: Use `grok --single "<prompt>"` (or `grok -p "<prompt>"`) which   ║
 * ║       runs headlessly, prints its response to stdout, and exits with    ║
 * ║       code 0 on success.  No TUI, no ANSI noise, clean exit code.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { spawn }     from 'child_process';
import fs            from 'fs';
import path          from 'path';
import os            from 'os';
import { BaseProvider }  from './BaseProvider.js';
import {
  GROK_CMD,
  GROK_TIMEOUT_IMAGE,
  GROK_TIMEOUT_VIDEO,
  GROK_TIMEOUT_PER_SCENE,
} from '../config/constants.js';

// ─── ANSI strip ──────────────────────────────────────────────────────────────
// grok may still emit some escape sequences even in headless mode.
// This regex removes all CSI / OSC / ESC sequences so our path-matching regex
// works reliably on clean text.
// (Inline — avoids adding a dependency just for this)
const ANSI_RE = /[\u001b\u009b](?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

// Match absolute Windows or Unix paths that end in media extensions.
// Uses a non-greedy match that stops at the extension without breaking on spaces.
const FILE_PATH_RE = /([A-Za-z]:[\\/]|\/)[^\r\n"']+?\.(png|jpg|jpeg|mp4|webm)/gi;

function cleanExtractedPath(rawPath) {
  let p = rawPath.trim();
  
  // 1. URL decode if it contains % codes
  try {
    if (p.includes('%')) {
      p = decodeURIComponent(p);
    }
  } catch (e) {
    // Ignore malformed URI sequences
  }
  return p;
}

function extractAllCandidatePaths(rawStdout) {
  const clean = stripAnsi(rawStdout);
  const candidates = new Set();
  
  const matches = clean.match(FILE_PATH_RE);
  if (matches) {
    for (const match of matches) {
      const rawTrimmed = match.trim();
      candidates.add(rawTrimmed); // In case it's a literal folder name with % chars
      
      const p = cleanExtractedPath(rawTrimmed);
      candidates.add(p);
      
      // 2. Detect nested drive letters (e.g. C:\...\sessions\C:\Users\...)
      // This collapses the path to just the inner absolute path.
      const driveMatch = p.match(/.*?[\\/]([A-Za-z]:[\\/].*)/);
      if (driveMatch) {
         candidates.add(driveMatch[1]);
         try {
           if (driveMatch[1].includes('%')) {
             candidates.add(decodeURIComponent(driveMatch[1]));
           }
         } catch(e) {}
      }
    }
  }

  // Reverse so the last matched path is preferred
  return Array.from(candidates).reverse();
}

/**
 * Fallback: Scans ~/.grok/sessions for recently created image/video files.
 */
function findRecentGrokMedia(exts, startTimeMs) {
  const sessionsDir = path.join(os.homedir(), '.grok', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  
  try {
    // Get all session directories sorted by modified time (newest first)
    const sessions = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const fullPath = path.join(sessionsDir, d.name);
        return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
      
    // Scan only the top 3 most recent session directories
    for (const session of sessions.slice(0, 3)) {
      for (const sub of ['images', 'videos', '']) {
        const targetDir = path.join(session.path, sub);
        if (!fs.existsSync(targetDir)) continue;
        
        const files = fs.readdirSync(targetDir, { withFileTypes: true })
          .filter(f => f.isFile());
          
        for (const file of files) {
          const ext = path.extname(file.name).toLowerCase().replace('.', '');
          if (exts.includes(ext)) {
            const filePath = path.join(targetDir, file.name);
            const stat = fs.statSync(filePath);
            // Must have been modified after our grok process started
            if (stat.mtimeMs >= startTimeMs) {
              return filePath;
            }
          }
        }
      }
    }
  } catch(e) {
    console.error('[GrokProvider] Fallback directory scan failed:', e.message);
  }
  return null;
}

// ─── Core runner ─────────────────────────────────────────────────────────────

export class GrokProvider extends BaseProvider {
  /**
   * Run a grok single-turn (headless) command and return the output file path
   * that grok prints to stdout.
   *
   * @param {string[]} args       Additional CLI arguments inserted BEFORE --single
   * @param {string}   prompt     The prompt text passed to --single
   * @param {number}   timeoutMs  Hard wall-clock timeout in milliseconds
   * @param {string}   label      Human-readable label for log messages
   * @param {number}   retryCount
   * @param {boolean}  isBatch    If true, resolves successfully on code 0 without finding an output file.
   * @returns {Promise<string|boolean>}   Absolute path of the file grok saved, or true if isBatch
   */
  _runGrok(args, prompt, timeoutMs, label = 'grok', retryCount = 0, isBatch = false) {
    const startTimeMs = Date.now();
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // ── AbortController gives us a named kill rather than the opaque
      //    `spawn({ timeout })` behaviour.  When abort fires we know it was
      //    OUR timeout, not grok crashing.
      const ac = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        console.warn(`[GrokProvider][${label}] Timeout after ${timeoutMs}ms — aborting`);
        ac.abort();
      }, timeoutMs);

      const proc = spawn(
        GROK_CMD,
        [
          ...args,
          // ── KEY FIX: --single runs headlessly.  grok prints its response
          //    to stdout and exits with code 0.  No TUI, no ANSI spinner,
          //    no hanging process.
          '--single', prompt,
          // Ask for plain text output (not JSON streaming) so stdout is
          // easy to parse for file paths.
          '--output-format', 'plain',
          // Auto-approve any tool calls grok wants to make (e.g. file writes)
          // so it doesn't pause waiting for human confirmation.
          '--always-approve',
        ],
        {
          // Pass our abort signal — Node will send SIGTERM then SIGKILL.
          signal: ac.signal,
          // Inherit env so grok finds its auth tokens / config.
          env: { ...process.env },
          // Do NOT set `timeout` here — we manage it via AbortController
          // so we can distinguish our timeout from grok's own crash.
        },
      );

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        // Log cleaned output so worker logs are readable (no escape-code noise)
        process.stdout.write(`[GrokProvider][${label}] ${stripAnsi(text)}`);
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(`[GrokProvider][${label}] STDERR: ${stripAnsi(text)}`);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        // AbortError is ours — surface it as a timeout message.
        if (err.code === 'ABORT_ERR' || err.name === 'AbortError') {
          return reject(new Error(
            `[${label}] Timed out after ${timeoutMs / 1000}s — grok did not finish`,
          ));
        }
        reject(new Error(`[${label}] Failed to spawn grok: ${err.message}`));
      });

      proc.on('close', (code, signal) => {
        clearTimeout(timer);

        let extractionLog = [];

        const tryResolveOutput = () => {
          // 1. Try stdout parsing
          const candidates = extractAllCandidatePaths(stdout);
          for (const p of candidates) {
            if (fs.existsSync(p)) return p;
            extractionLog.push(`Parsed "${p}" but file does not exist.`);
          }
          
          // 2. Try fallback
          const targetExts = label === 'img' ? ['jpg', 'jpeg', 'png'] : ['mp4', 'webm'];
          // Buffer start time by 5 seconds just in case
          const fallbackPath = findRecentGrokMedia(targetExts, startTimeMs - 5000);
          if (fallbackPath) {
             console.warn(`[GrokProvider][${label}] Fallback: Found recent file at "${fallbackPath}" instead of stdout matching`);
             return fallbackPath;
          }
          return null;
        };

        const stderrClean = stripAnsi(stderr).trim();
        const stdoutClean = stripAnsi(stdout).trim();
        const isRateLimit = /resource-exhausted|too many requests|rate limit/i.test(stderrClean) ||
                            /resource-exhausted|too many requests|rate limit/i.test(stdoutClean);

        // ── KEY FIX: code is null when the process was killed by a signal
        if (timedOut || signal) {
          const reason = timedOut
            ? `timed out after ${timeoutMs / 1000}s`
            : `killed by signal ${signal}`;

          const resolvedPath = tryResolveOutput();
          if (resolvedPath) {
            console.warn(`[GrokProvider][${label}] Process ${reason}, but output file exists — treating as success: ${resolvedPath}`);
            return resolve(resolvedPath);
          }

          // Retry on timeout for non-batch runs
          if (!isBatch && retryCount < 1) {
            console.warn(`[GrokProvider][${label}] Process ${reason}. Retrying command once (attempt ${retryCount + 2}/2)...`);
            return resolve(this._runGrok(args, prompt, timeoutMs, label, retryCount + 1, isBatch));
          }

          return reject(new Error(`[${label}] Process ${reason} and no output file found`));
        }

        // Normal/Non-normal exit
        if (code !== 0) {
          // Check for rate limit error
          if (isRateLimit && retryCount < 5) {
            const waitSec = Math.min(Math.pow(2, retryCount) * 10, 120);
            console.warn(`[GrokProvider][${label}] Rate limit detected (resource-exhausted). Waiting ${waitSec}s before retry (attempt ${retryCount + 2}/6)...`);
            
            return setTimeout(() => {
              resolve(this._runGrok(args, prompt, timeoutMs, label, retryCount + 1, isBatch));
            }, waitSec * 1000);
          }

          console.error(`[GrokProvider][${label}] grok exited with code ${code}\nSTDERR: ${stderrClean}`);
          return reject(new Error(`[${label}] grok exited with code ${code}\n${stderrClean}`));
        }
        
        if (isBatch) {
          return resolve(true);
        }

        // ── Success path: resolve the output file
        const resolvedPath = tryResolveOutput();

        if (!resolvedPath) {
          const logMsg = extractionLog.length > 0 
            ? `Found paths but none exist:\n  - ` + extractionLog.join('\n  - ')
            : `No path-like strings found in stdout.`;
            
          console.error(`[GrokProvider][${label}] Resolution failed. ${logMsg}\nRaw stdout:\n${stdoutClean}`);
          
          // Retry logic: If Grok successfully exited (code 0) but we still can't find the file,
          // retry once. It's likely a weird CLI formatting error.
          if (retryCount < 1) {
            console.warn(`[GrokProvider][${label}] Retrying command (attempt ${retryCount + 2}/2)...`);
            return resolve(this._runGrok(args, prompt, timeoutMs, label, retryCount + 1));
          }
          
          return reject(new Error(`[${label}] grok completed (exit 0) but output file could not be resolved.\n${logMsg}`));
        }

        resolve(resolvedPath);
      });
    });
  }

  /**
   * Copy src → dest then delete src (best-effort).
   */
  async _moveFile(src, dest) {
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src).catch(() => {});
    return dest;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** @override */
  async generateImage(prompt, outputPath) {
    console.log(`[GrokProvider] Generating image: "${prompt.slice(0, 80)}..."`);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    // Ask grok to generate an image and save it, then tell us the path.
    // The prompt instructs grok to use whatever image-gen tool it has and
    // print the saved file path on the last line of its response.
    const imagePrompt =
      `Generate an image matching this description and save it to a file. ` +
      `Print ONLY the absolute file path of the saved image on the last line. ` +
      `Description: ${prompt}`;

    const grokOutputPath = await this._runGrok(
      [],
      imagePrompt,
      GROK_TIMEOUT_IMAGE,
      `img`,
    );

    await this._moveFile(grokOutputPath, outputPath);
    console.log(`[GrokProvider] ✅ Image saved: ${outputPath}`);
    return outputPath;
  }

  /** @override */
  async generateVideo(imagePath, outputPath) {
    console.log(`[GrokProvider] Animating image → video: ${path.basename(imagePath)}`);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const videoPrompt =
      `Animate the image at "${imagePath}" into a short video clip and save it as an MP4 file. ` +
      `Print ONLY the absolute file path of the saved video on the last line.`;

    const grokOutputPath = await this._runGrok(
      [],
      videoPrompt,
      GROK_TIMEOUT_VIDEO,
      `vid`,
    );

    await this._moveFile(grokOutputPath, outputPath);
    console.log(`[GrokProvider] ✅ Video saved: ${outputPath}`);
    return outputPath;
  }

  /** @override */
  async generateThumbnail(videoPath, outputPath) {
    const { generateThumbnailFromVideo } = await import('../services/thumbnailService.js');
    return generateThumbnailFromVideo(videoPath, outputPath);
  }

  /**
   * Generates a batch of media using a JSON manifest passed to Grok CLI.
   */
  async generateMediaBatch(jobId, batch, outputDir) {
    console.log(`[GrokProvider] Generating media batch of ${batch.length} scenes...`);
    const imgDir = path.join(outputDir, 'img');
    const vidDir = path.join(outputDir, 'vid');
    await fs.promises.mkdir(imgDir, { recursive: true });
    await fs.promises.mkdir(vidDir, { recursive: true });

    // 1. Create a batch manifest JSON file
    const manifestPath = path.join(outputDir, `batch_manifest_${Date.now()}.json`);
    const manifestData = {
      job_id: jobId,
      output_directory: outputDir,
      tasks: batch.map(scene => {
        const padded = String(scene.sceneNumber).padStart(3, '0');
        return {
          scene_id: scene.sceneNumber,
          image_prompt: scene.imagePrompt || scene.videoPrompt,
          video_prompt: scene.videoPrompt || scene.imagePrompt,
          target_image: path.join(imgDir, `scene_${padded}.jpg`),
          target_video: path.join(vidDir, `scene_${padded}.mp4`),
        };
      })
    };
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');

    // 2. Invoke Grok CLI to process the batch
    const batchPrompt = `Please process the batch of media generation tasks defined in this JSON file: "${manifestPath}". For each task, generate the image using the image_prompt and save it to the target_image path, then animate that image using the video_prompt and save the video to the target_video path. It is CRITICAL that you save the files exactly to the absolute paths specified in the JSON. You do not need to print the output paths. Just exit when finished.`;

    // Timeout is scaled by the number of scenes in the batch, minimum 30 minutes
    const timeoutMs = Math.max(1800000, batch.length * GROK_TIMEOUT_PER_SCENE); 

    await this._runGrok(
      [],
      batchPrompt,
      timeoutMs,
      `batch`,
      0,
      true // isBatch
    );

    console.log(`[GrokProvider] ✅ Media batch execution completed.`);
    return manifestData;
  }

  get name() { return 'grok'; }
}

export default GrokProvider;
