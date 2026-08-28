import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { tempDir, outputDir } from '../config/constants.js';
import Job from '../models/Job.js';
import Project from '../models/Project.js';
import BrandKit from '../models/BrandKit.js';
import CreativeProfile from '../models/CreativeProfile.js';
import { getColorGradeFilter, getCinematicLetterboxFilter } from './styleService.js';

const execAsync = promisify(exec);

async function downloadAsset(url, destPath) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 30000
  });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((res, rej) => {
    writer.on('finish', res);
    writer.on('error', rej);
  });
}

/**
 * Assemble scene video clips into a single final MP4.
 *
 * Pipeline:
 * 1. Load snapshots of Project & BrandKit settings
 * 2. Download and standardise brand intro/outro clips
 * 3. Loop and pad scene video clips to match scene durations
 * 4. Concatenate intro + scenes + outro using concat demuxer
 * 5. Overlay narration audio track
 * 6. Burn in subtitles if requested
 * 7. Apply watermark logo overlay
 * 8. Apply color grading and cinematic letterbox filters
 * 9. Final encode with fast-start web optimization
 */
export async function assembleVideo({ jobId, scenes, narrationPath, srtPath, subtitleBurnIn }) {
  const tmp    = tempDir(jobId);
  const outDir = outputDir(jobId);
  await fs.promises.mkdir(tmp, { recursive: true });
  await fs.promises.mkdir(outDir, { recursive: true });

  // 1. Fetch metadata context
  const job = await Job.findById(jobId);
  let brandKit = null;
  let creativeProfile = null;
  
  if (job?.projectId) {
    const project = await Project.findById(job.projectId);
    if (project) {
      if (project.brandKitId) {
        brandKit = await BrandKit.findById(project.brandKitId);
      }
      if (project.creativeProfileId) {
        creativeProfile = await CreativeProfile.findById(project.creativeProfileId);
      }
    }
  }

  // Define standardization filters (Resolution & Frame Rate)
  const resolution = creativeProfile?.renderSettings?.resolution || '1920x1080';
  const fps = creativeProfile?.renderSettings?.fps || 25;
  const [resW, resH] = resolution.split('x');

  const standardizedScaleFilter = `scale=${resW}:${resH},fps=${fps}`;

  const loopedPaths = [];

  // 2. Prepend Brand Intro if present
  if (brandKit?.introUrl) {
    console.log(`[VideoAssembler] Downloading brand intro: ${brandKit.introUrl}`);
    const localIntro = path.join(tmp, 'brand_intro.mp4');
    const standardizedIntro = path.join(tmp, 'standard_intro.mp4');
    try {
      await downloadAsset(brandKit.introUrl, localIntro);
      // Re-encode to match targets
      await execAsync(
        `ffmpeg -y -i "${localIntro}" -vf "${standardizedScaleFilter}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "${standardizedIntro}"`,
        { timeout: 300000 }
      );
      loopedPaths.push(standardizedIntro);
    } catch (e) {
      console.warn(`[VideoAssembler] Brand intro processing failed: ${e.message}`);
    }
  }

  // 3. Loop and pad each scene to match its exact audio duration
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.videoPath || !fs.existsSync(s.videoPath)) continue;

    const duration = s.duration || 5;
    const loopedPath = path.join(tmp, `looped_scene_${i}.mp4`);

    await execAsync(
      `ffmpeg -y -stream_loop -1 -i "${s.videoPath}" -t ${duration} -vf "${standardizedScaleFilter}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "${loopedPath}"`,
      { timeout: 300000 }
    );
    loopedPaths.push(loopedPath);
  }

  // 4. Append Brand Outro if present
  if (brandKit?.outroUrl) {
    console.log(`[VideoAssembler] Downloading brand outro: ${brandKit.outroUrl}`);
    const localOutro = path.join(tmp, 'brand_outro.mp4');
    const standardizedOutro = path.join(tmp, 'standard_outro.mp4');
    try {
      await downloadAsset(brandKit.outroUrl, localOutro);
      await execAsync(
        `ffmpeg -y -i "${localOutro}" -vf "${standardizedScaleFilter}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "${standardizedOutro}"`,
        { timeout: 300000 }
      );
      loopedPaths.push(standardizedOutro);
    } catch (e) {
      console.warn(`[VideoAssembler] Brand outro processing failed: ${e.message}`);
    }
  }

  if (loopedPaths.length === 0) {
    throw new Error('No valid scene videos found for assembly');
  }

  // 5. Write concat list
  const concatPath = path.join(tmp, 'concat.txt');
  const concatContent = loopedPaths
    .map((p) => `file '${p.replace(/\\/g, '/')}'`)
    .join('\n');
  await fs.promises.writeFile(concatPath, concatContent, 'utf8');

  // 6. Concatenate scene clips
  const mergedPath = path.join(tmp, 'merged_video.mp4');
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${mergedPath}"`,
    { timeout: 300000 },
  );

  // 7. Mix audio if narration exists
  let withAudioPath = mergedPath;
  if (narrationPath && fs.existsSync(narrationPath)) {
    withAudioPath = path.join(tmp, 'with_audio.mp4');
    await execAsync(
      `ffmpeg -y -i "${mergedPath}" -i "${narrationPath}" ` +
      `-filter_complex "[1:a]volume=1.0[a]" -map 0:v -map "[a]" ` +
      `-c:v copy -c:a aac -shortest "${withAudioPath}"`,
      { timeout: 300000 },
    );
  }

  // 8. Subtitle burn-in
  let subtitledPath = withAudioPath;
  if (subtitleBurnIn && srtPath && fs.existsSync(srtPath)) {
    const { burnSubtitles } = await import('./subtitleService.js');
    subtitledPath = path.join(tmp, 'subtitled.mp4');
    await burnSubtitles(withAudioPath, srtPath, subtitledPath);
  }

  // 9. Watermark overlay logic
  let watermarkedPath = subtitledPath;
  if (brandKit?.logoUrl && brandKit?.watermark?.enabled) {
    console.log(`[VideoAssembler] Applying watermark overlay from logo: ${brandKit.logoUrl}`);
    const localLogo = path.join(tmp, 'watermark_logo.png');
    watermarkedPath = path.join(tmp, 'watermarked.mp4');
    try {
      await downloadAsset(brandKit.logoUrl, localLogo);
      
      // Map positions
      let overlayFilter = 'overlay=main_w-overlay_w-10:10'; // top_right (default)
      const pos = brandKit.watermark.position;
      if (pos === 'top_left') overlayFilter = 'overlay=10:10';
      else if (pos === 'bottom_left') overlayFilter = 'overlay=10:main_h-overlay_h-10';
      else if (pos === 'bottom_right') overlayFilter = 'overlay=main_w-overlay_w-10:main_h-overlay_h-10';

      await execAsync(
        `ffmpeg -y -i "${subtitledPath}" -i "${localLogo}" -filter_complex "[0:v][1:v]${overlayFilter}[v]" -map "[v]" -map 0:a? -c:v libx264 -preset veryfast -pix_fmt yuv420p -crf 23 -c:a copy "${watermarkedPath}"`,
        { timeout: 600000 }
      );
    } catch (e) {
      console.warn(`[VideoAssembler] Watermark rendering failed: ${e.message}`);
    }
  }

  // 10. Apply styling presets and color grading filters
  let styledPath = watermarkedPath;
  const styleConfig = job.styleConfig || {};
  const filterList = [];

  if (styleConfig.colorGrade) {
    const colorFilter = getColorGradeFilter(styleConfig.colorGrade);
    if (colorFilter) filterList.push(colorFilter);
  }

  if (['cinematic', 'movie_trailer'].includes(styleConfig.preset)) {
    const letterboxFilter = getCinematicLetterboxFilter();
    if (letterboxFilter) filterList.push(letterboxFilter);
  }

  if (filterList.length > 0) {
    styledPath = path.join(tmp, 'styled.mp4');
    const filters = filterList.join(',');
    await execAsync(
      `ffmpeg -y -i "${watermarkedPath}" -vf "${filters}" -c:v libx264 -preset veryfast -pix_fmt yuv420p -crf 23 -c:a copy "${styledPath}"`,
      { timeout: 600000 }
    );
  }

  // 11. Final encode: H.264 + AAC, web-optimised with faststart
  const finalPath = path.join(outDir, 'final.mp4');
  await execAsync(
    `ffmpeg -y -i "${styledPath}" ` +
    `-c:v libx264 -crf 23 -preset veryfast -pix_fmt yuv420p ` +
    `-c:a aac -b:a 128k ` +
    `-movflags +faststart ` +
    `"${finalPath}"`,
    { timeout: 600000 },
  );

  if (!fs.existsSync(finalPath)) {
    throw new Error(`Final video not produced at ${finalPath}`);
  }

  // 12. Get duration
  const duration = await getVideoDuration(finalPath);

  // 13. Cleanup intermediate files
  const tempFiles = [concatPath, mergedPath, withAudioPath, subtitledPath, watermarkedPath, styledPath];
  for (const f of tempFiles) {
    if (f !== finalPath && fs.existsSync(f)) {
      await fs.promises.unlink(f).catch(() => {});
    }
  }

  console.log(`[VideoAssembler] Final video: ${finalPath} (${duration}s)`);
  return { finalVideoPath: finalPath, duration };
}

async function getVideoDuration(videoPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    );
    return Math.round(parseFloat(stdout.trim())) || 0;
  } catch {
    return 0;
  }
}

export default { assembleVideo };
