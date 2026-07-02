import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { exec } from 'child_process';
import util from 'util';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);

// Resolve the backend root directory (works with ESM __dirname equivalent)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class TranscriptionResultShapeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TranscriptionResultShapeError';
  }
}

async function transcribeWithOpenAI(audioPath) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  console.log('[Transcription] Attempting OpenAI Whisper API...');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });
  return transcription.segments || [];
}

async function transcribeWithGemini(audioPath) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  console.log('[Transcription] Attempting Gemini 2.5 Flash...');
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const mimeType = audioPath.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav';
  const audioData = {
    inlineData: {
      data: Buffer.from(fs.readFileSync(audioPath)).toString("base64"),
      mimeType: mimeType
    }
  };

  const prompt = `Listen to this ENTIRE audio file and provide a highly accurate transcription from the very first second to the very last second. 
You MUST transcribe 100% of the audio. Do not summarize. Do not skip any parts. 
Return the result strictly as a JSON array of segment objects.
Do not wrap it in markdown block quotes. Just the raw JSON.
Each object must have:
- "start": start time in seconds (float)
- "end": end time in seconds (float)
- "text": the spoken text
Example:
[
  {"start": 0.0, "end": 2.5, "text": "Hello world."},
  {"start": 2.5, "end": 5.0, "text": "This is a test."}
]`;

  const result = await model.generateContent([
    { inlineData: audioData.inlineData }, 
    prompt
  ]);
  
  let text = result.response.text();
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const segments = JSON.parse(text);
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Gemini returned empty or invalid segments');
  }
  return segments;
}

/**
 * Resolve the Python executable inside the project-scoped venv.
 * Priority: LOCAL_WHISPER_PYTHON env var → OS-specific venv path relative to backend root.
 */
function resolveWhisperPython() {
  if (process.env.LOCAL_WHISPER_PYTHON) {
    return process.env.LOCAL_WHISPER_PYTHON;
  }
  // Windows: whisper-env\Scripts\python.exe
  // Linux/macOS: whisper-env/bin/python
  const relPath =
    process.platform === 'win32'
      ? path.join('whisper-env', 'Scripts', 'python.exe')
      : path.join('whisper-env', 'bin', 'python');
  return path.join(BACKEND_ROOT, relPath);
}

/**
 * Resolve the path to transcribe.py.
 * Priority: LOCAL_WHISPER_SCRIPT env var → scripts/transcribe.py relative to backend root.
 */
function resolveWhisperScript() {
  if (process.env.LOCAL_WHISPER_SCRIPT) {
    return process.env.LOCAL_WHISPER_SCRIPT;
  }
  return path.join(BACKEND_ROOT, 'scripts', 'transcribe.py');
}

async function transcribeWithLocalWhisper(audioPath) {
  console.log('[Transcription] Attempting Local Whisper (faster-whisper, CPU)...');

  const pythonExe = resolveWhisperPython();
  const scriptPath = resolveWhisperScript();

  // Sanity-check that the venv python exists before trying to spawn it,
  // so we give a clear diagnostic rather than a cryptic ENOENT.
  if (!fs.existsSync(pythonExe)) {
    throw new Error(
      `Local Whisper venv not found at: ${pythonExe}\n` +
      `Run the setup steps in SETUP.md to create the venv and install faster-whisper.\n` +
      `Or set LOCAL_WHISPER_PYTHON in .env to override the default path.`
    );
  }

  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `transcribe.py not found at: ${scriptPath}\n` +
      `Set LOCAL_WHISPER_SCRIPT in .env to override the default path.`
    );
  }

  let stdout, stderr;
  try {
    // execFile avoids shell-injection: args are passed as an array,
    // so spaces in paths (e.g. "apivideo pipline") are handled safely.
    ({ stdout, stderr } = await execFilePromise(
      pythonExe,
      [scriptPath, audioPath],
      {
        maxBuffer: 50 * 1024 * 1024, // 50 MB — handles very long audio transcripts
        env: {
          ...process.env,
          // Pass model size from env if configured; transcribe.py defaults to 'small'
          LOCAL_WHISPER_MODEL: process.env.LOCAL_WHISPER_MODEL || 'small',
        },
      }
    ));
  } catch (spawnErr) {
    // spawnErr.stderr contains Python's error output when it exits non-zero
    const detail = spawnErr.stderr ? spawnErr.stderr.trim() : spawnErr.message;
    throw new Error(`Local Whisper process failed:\n${detail}`);
  }

  // Log Python's stderr (model loading progress, language detection, etc.) at debug level
  if (stderr && stderr.trim()) {
    console.log(`[Transcription] [local-whisper] ${stderr.trim().replace(/\n/g, '\n[Transcription] [local-whisper] ')}`);
  }

  let segments;
  try {
    segments = JSON.parse(stdout.trim());
  } catch (parseErr) {
    throw new Error(
      `Local Whisper returned non-JSON output: ${stdout.slice(0, 200)}\n` +
      `Parse error: ${parseErr.message}`
    );
  }

  if (!Array.isArray(segments)) {
    throw new Error(`Local Whisper returned unexpected JSON shape (expected array): ${stdout.slice(0, 200)}`);
  }

  return segments;
}

async function getAudioDuration(audioPath) {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Transcribes an audio file with a 3-tier fallback chain,
 * and groups the transcript into scene windows of approximately the given target duration.
 *
 * @param {string} audioPath - Path to the audio file
 * @param {number} targetDurationSecs - Target duration for each scene window (e.g. 10s)
 * @returns {Promise<{ chunks: Array, providerUsed: string }>} 
 */
export async function transcribeAndChunkAudio(audioPath, targetDurationSecs = 10, cleanScript = '') {
  let segments = [];
  let providerUsed = '';

  // 1. Try OpenAI
  try {
    segments = await transcribeWithOpenAI(audioPath);
    providerUsed = 'openai-whisper';
  } catch (err) {
    console.warn(`[Transcription] OpenAI failed: ${err.message}. Falling back to Gemini...`);
    
    // 2. Try Gemini
    try {
      segments = await transcribeWithGemini(audioPath);
      providerUsed = 'gemini-2.5-flash';
    } catch (geminiErr) {
      console.warn(`[Transcription] Gemini failed: ${geminiErr.message}. Falling back to Local Whisper...`);
      
      // 3. Try Local Whisper
      try {
        segments = await transcribeWithLocalWhisper(audioPath);
        providerUsed = 'local-whisper';
      } catch (localErr) {
        throw new ConfigurationError(`All transcription providers failed. Local Whisper error: ${localErr.message}`);
      }
    }
  }

  // LOG RAW SEGMENTS for debugging
  console.log(`[Transcription] Raw segments from ${providerUsed}:`, JSON.stringify(segments, null, 2));

  if (!segments || segments.length === 0) {
    throw new Error('No speech detected in audio file across any provider.');
  }

  // NORMALIZE SEGMENTS
  segments = segments.map((seg, idx) => {
    const start = typeof seg.start === 'number' ? seg.start : (typeof seg.startTime === 'number' ? seg.startTime : 0);
    const end = typeof seg.end === 'number' ? seg.end : (typeof seg.endTime === 'number' ? seg.endTime : start + 1.0);
    
    let text = seg.text;
    if (text === undefined && seg.transcript !== undefined) text = seg.transcript;
    if (text === undefined && seg.text_content !== undefined) text = seg.text_content;

    if (typeof text !== 'string') {
      throw new TranscriptionResultShapeError(
        `missing or invalid .text from provider "${providerUsed}" at segment ${idx}. ` +
        `Segment: ${JSON.stringify(seg)}`
      );
    }

    return {
      start,
      end,
      text: text.trim()
    };
  });

  const totalAudioDuration = await getAudioDuration(audioPath);

  let chunks = [];

  let sentences = [];
  if (cleanScript && cleanScript.trim()) {
    sentences = cleanScript
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  if (sentences.length > 0) {
    console.log(`[Transcription] Aligning ${sentences.length} script sentences to ${segments.length} transcription segments...`);
    
    // Extract words with timestamps from normalized segments
    const transcriptWords = [];
    for (const seg of segments) {
      const segWords = seg.text.split(/\s+/).filter(Boolean);
      if (segWords.length === 0) continue;
      
      const start = seg.start;
      const end = seg.end;
      const duration = end - start;
      const wordDuration = duration / segWords.length;
      
      for (let i = 0; i < segWords.length; i++) {
        const cleanWord = segWords[i].toLowerCase().replace(/[^\w]/g, '');
        transcriptWords.push({
          word: cleanWord,
          original: segWords[i],
          startTime: start + i * wordDuration,
          endTime: start + (i + 1) * wordDuration
        });
      }
    }

    if (transcriptWords.length === 0) {
      console.warn('[Transcription] No words transcribed. Falling back to proportional chunking.');
      const durationPerSentence = totalAudioDuration > 0 ? (totalAudioDuration / sentences.length) : 5.0;
      chunks = sentences.map((text, idx) => ({
        id: idx + 1,
        startTime: idx * durationPerSentence,
        endTime: (idx + 1) * durationPerSentence,
        text: text
      }));
    } else {
      let wordCursor = 0;

      for (let i = 0; i < sentences.length; i++) {
        const sentenceText = sentences[i];
        const sentenceWords = sentenceText
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(Boolean);

        const chunkId = i + 1;
        let startTime = transcriptWords[Math.min(wordCursor, transcriptWords.length - 1)].startTime;

        if (i === 0) {
          startTime = 0;
        }

        let currentTransIdx = wordCursor;
        for (const word of sentenceWords) {
          let foundIdx = -1;
          const searchEnd = Math.min(transcriptWords.length, currentTransIdx + 25);
          for (let j = currentTransIdx; j < searchEnd; j++) {
            if (transcriptWords[j].word === word) {
              foundIdx = j;
              break;
            }
          }
          if (foundIdx !== -1) {
            currentTransIdx = foundIdx + 1;
          } else {
            currentTransIdx = Math.min(transcriptWords.length, currentTransIdx + 1);
          }
        }

        let endTime;
        if (i === sentences.length - 1) {
          endTime = totalAudioDuration > 0 ? totalAudioDuration : transcriptWords[transcriptWords.length - 1].endTime;
        } else {
          const endWordIdx = Math.min(currentTransIdx - 1, transcriptWords.length - 1);
          endTime = transcriptWords[Math.max(0, endWordIdx)].endTime;
          
          if (endTime <= startTime) {
            endTime = startTime + 1.0;
          }
        }

        chunks.push({
          id: chunkId,
          startTime: parseFloat(startTime.toFixed(3)),
          endTime: parseFloat(endTime.toFixed(3)),
          text: sentenceText
        });

        wordCursor = Math.min(transcriptWords.length, currentTransIdx);
      }
    }
  } else {
    // FALLBACK: Group segments into ~10s windows
    let currentChunk = {
      id: 1,
      startTime: segments[0].start,
      endTime: segments[0].end,
      text: segments[0].text
    };

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const chunkDuration = seg.end - currentChunk.startTime;

      if (chunkDuration <= targetDurationSecs + 3) { 
        currentChunk.endTime = seg.end;
        currentChunk.text += ' ' + seg.text;
      } else {
        chunks.push({ ...currentChunk });
        currentChunk = {
          id: chunks.length + 1,
          startTime: seg.start,
          endTime: seg.end,
          text: seg.text
        };
      }
    }
    chunks.push(currentChunk);

    // Stretch the last chunk to audio duration
    if (totalAudioDuration > 0 && chunks.length > 0) {
      if (totalAudioDuration > chunks[chunks.length - 1].endTime) {
        chunks[chunks.length - 1].endTime = totalAudioDuration;
      }
    }
  }

  // Print summary/sanity check log line
  const mCount = sentences.length;
  const nCount = chunks.length;
  if (mCount > 0 && nCount !== mCount) {
    console.warn(`[Transcription] Mismatch: Scenes generated (${nCount}) vs narration sentences (${mCount}).`);
  } else if (mCount > 0) {
    console.log(`[Transcription] Alignment complete: generated ${nCount} scenes matching the ${mCount} narration sentences.`);
  } else {
    console.log(`[Transcription] Chunking complete: generated ${nCount} scene windows of ~${targetDurationSecs}s.`);
  }

  return { chunks, providerUsed };
}

export default { transcribeAndChunkAudio, ConfigurationError, TranscriptionResultShapeError };
