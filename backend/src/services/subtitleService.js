import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Generate an SRT subtitle file from transcript chunks.
 *
 * @param {object[]} chunks   Array of { text, startTime, endTime } from Whisper
 * @param {string}   outputPath  Path to write the .srt file
 * @returns {Promise<string>} outputPath
 */
export async function generateSRT(chunks, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  let srt = '';

  chunks.forEach((chunk, idx) => {
    if (!chunk.text?.trim()) return;

    const startMs = Math.round(chunk.startTime * 1000);
    const endMs   = Math.round(chunk.endTime * 1000);

    srt += `${idx + 1}\n`;
    srt += `${msToSRTTime(startMs)} --> ${msToSRTTime(endMs)}\n`;
    srt += `${chunk.text.trim()}\n\n`;
  });

  await fs.promises.writeFile(outputPath, srt, 'utf8');
  console.log(`[Subtitle] SRT written: ${outputPath}`);
  return outputPath;
}

/**
 * Burn subtitles into a video using FFmpeg's subtitles filter.
 *
 * @param {string} videoPath   Source video (no subtitles)
 * @param {string} srtPath     SRT subtitle file
 * @param {string} outputPath  Destination video with burned subtitles
 * @returns {Promise<string>} outputPath
 */
export async function burnSubtitles(videoPath, srtPath, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // FFmpeg subtitles filter requires forward slashes and escaped colons on Windows
  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${videoPath}"`,
    '-vf', `"subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2'"`,
    '-c:a', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  await execAsync(cmd, { timeout: 600000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Subtitle burn failed — output not found: ${outputPath}`);
  }

  console.log(`[Subtitle] Burned subtitles into: ${outputPath}`);
  return outputPath;
}

/** Convert milliseconds to SRT timestamp format: HH:MM:SS,mmm */
function msToSRTTime(ms) {
  const h   = Math.floor(ms / 3600000);
  const m   = Math.floor((ms % 3600000) / 60000);
  const s   = Math.floor((ms % 60000) / 1000);
  const ms_ = ms % 1000;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':') + `,${String(ms_).padStart(3, '0')}`;
}

export default { generateSRT, burnSubtitles };
