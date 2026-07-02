import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Generate a thumbnail from a video file using FFmpeg.
 * Extracts frame at 2 seconds (or first frame if video is shorter).
 *
 * @param {string} videoPath   Source .mp4 file
 * @param {string} outputPath  Destination .jpg file
 * @returns {Promise<string>}  outputPath
 */
export async function generateThumbnailFromVideo(videoPath, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const cmd = [
    'ffmpeg',
    '-y',                         // overwrite output
    '-ss', '00:00:02',            // seek to 2s
    '-i', `"${videoPath}"`,
    '-vframes', '1',              // extract exactly 1 frame
    '-q:v', '2',                  // high quality JPEG
    '-vf', 'scale=640:-1',        // scale to 640px wide
    `"${outputPath}"`,
  ].join(' ');

  await execAsync(cmd);

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Thumbnail generation failed — output not found: ${outputPath}`);
  }

  console.log(`[Thumbnail] Generated: ${outputPath}`);
  return outputPath;
}

export default { generateThumbnailFromVideo };
