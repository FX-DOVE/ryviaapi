import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { tempDir, outputDir, audioDir } from '../config/constants.js';
import Job from '../models/Job.js';
import Project from '../models/Project.js';
import BrandKit from '../models/BrandKit.js';
import CreativeProfile from '../models/CreativeProfile.js';
import { getColorGradeFilter, getCinematicLetterboxFilter } from './styleService.js';
import {
  hasAudioStream,
  applyMixToVideo,
  isNativeAudioGenre,
} from './audioMixService.js';

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
 * Standardise a clip to target resolution/fps and ALWAYS keep or synthesise
 * a stereo AAC track so concat never drops audio (LTX native dialogue).
 */
async function standardizeClip(inputPath, outputPath, { scaleFilter, duration = null }) {
  const hasA = await hasAudioStream(inputPath);
  const tFlag = duration != null ? `-t ${Number(duration)}` : '';
  const loopFlag = duration != null ? '-stream_loop -1' : '';

  if (hasA) {
    await execAsync(
      `ffmpeg -y ${loopFlag} -i "${inputPath}" ${tFlag} ` +
        `-vf "${scaleFilter}" ` +
        `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
        `"${outputPath}"`,
      { timeout: 300000 },
    );
  } else {
    // Silent stereo track so every concat input has matching audio
    await execAsync(
      `ffmpeg -y ${loopFlag} -i "${inputPath}" ` +
        `-f lavfi -i anullsrc=r=44100:cl=stereo ` +
        `${tFlag} -vf "${scaleFilter}" ` +
        `-map 0:v:0 -map 1:a:0 -shortest ` +
        `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
        `"${outputPath}"`,
      { timeout: 300000 },
    );
  }
}

/**
 * Assemble scene video clips into a single final MP4.
 *
 * Audio rules:
 * 1. Never drop LTX native audio during loop/concat (re-encode AAC consistently;
 *    avoid `-c copy` concat which breaks mismatched streams).
 * 2. Accept mixPath / scorePath from audioMixService; duck score under dialogue.
 * 3. For drama/movie/anime: ignore narrationPath when native audio is present.
 */
export async function assembleVideo({
  jobId,
  scenes,
  narrationPath,
  srtPath,
  subtitleBurnIn,
  mixPath = null,
  scorePath = null,
  genre = null,
}) {
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

  const genreKey = String(
    genre || job?.genre || job?.animationStyle || job?.input?.style || '',
  ).toLowerCase();
  const preferNative = isNativeAudioGenre(genreKey);

  // Resolve mix/score from args, job.audioMix, or conventional audioDir paths
  const audioRoot = audioDir(jobId);
  const resolvedMix =
    mixPath ||
    job?.audioMix?.mixPath ||
    path.join(audioRoot, 'final_mix.m4a');
  const resolvedScore =
    scorePath ||
    job?.audioMix?.scorePath ||
    path.join(audioRoot, 'score_bed.m4a');
  const useMix = resolvedMix && fs.existsSync(resolvedMix) ? resolvedMix : null;
  const useScore = !useMix && resolvedScore && fs.existsSync(resolvedScore) ? resolvedScore : null;

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
      await standardizeClip(localIntro, standardizedIntro, {
        scaleFilter: standardizedScaleFilter,
      });
      loopedPaths.push(standardizedIntro);
    } catch (e) {
      console.warn(`[VideoAssembler] Brand intro processing failed: ${e.message}`);
    }
  }

  // 3. Loop/pad each scene — PRESERVE native audio (do not strip)
  let scenesWithNative = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.videoPath || !fs.existsSync(s.videoPath)) continue;

    const duration = s.duration || 5;
    const loopedPath = path.join(tmp, `looped_scene_${i}.mp4`);

    if (await hasAudioStream(s.videoPath)) scenesWithNative += 1;

    await standardizeClip(s.videoPath, loopedPath, {
      scaleFilter: standardizedScaleFilter,
      duration,
    });
    loopedPaths.push(loopedPath);
  }

  // 4. Append Brand Outro if present
  if (brandKit?.outroUrl) {
    console.log(`[VideoAssembler] Downloading brand outro: ${brandKit.outroUrl}`);
    const localOutro = path.join(tmp, 'brand_outro.mp4');
    const standardizedOutro = path.join(tmp, 'standard_outro.mp4');
    try {
      await downloadAsset(brandKit.outroUrl, localOutro);
      await standardizeClip(localOutro, standardizedOutro, {
        scaleFilter: standardizedScaleFilter,
      });
      loopedPaths.push(standardizedOutro);
    } catch (e) {
      console.warn(`[VideoAssembler] Brand outro processing failed: ${e.message}`);
    }
  }

  if (loopedPaths.length === 0) {
    throw new Error('No valid scene videos found for assembly');
  }

  // 5. Concatenate with re-encode (never `-c copy` — mismatched AAC breaks)
  const concatPath = path.join(tmp, 'concat.txt');
  const concatContent = loopedPaths
    .map((p) => `file '${p.replace(/\\/g, '/')}'`)
    .join('\n');
  await fs.promises.writeFile(concatPath, concatContent, 'utf8');

  const mergedPath = path.join(tmp, 'merged_video.mp4');
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatPath}" ` +
      `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
      `"${mergedPath}"`,
    { timeout: 600000 },
  );

  // 6. Apply audio mix / score duck / narration policy
  // Drama/movie/anime: ignore narration when native audio present
  const allowNarration =
    !preferNative || scenesWithNative === 0;
  if (preferNative && narrationPath && scenesWithNative > 0) {
    console.log(
      `[VideoAssembler] Ignoring narrationPath for ${genreKey || 'native-audio genre'} — ` +
        `${scenesWithNative} scene(s) carry LTX native audio`,
    );
  }

  let withAudioPath = path.join(tmp, 'with_audio.mp4');
  const mixResult = await applyMixToVideo({
    videoPath: mergedPath,
    outPath: withAudioPath,
    mixPath: useMix,
    scorePath: useScore,
    narrationPath: allowNarration ? narrationPath : null,
    genre: genreKey,
    allowNarrationOverlay: allowNarration,
  });
  console.log(`[VideoAssembler] Audio apply mode: ${mixResult.applied}`);

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

      let overlayFilter = 'overlay=main_w-overlay_w-10:10'; // top_right (default)
      const pos = brandKit.watermark.position;
      if (pos === 'top_left') overlayFilter = 'overlay=10:10';
      else if (pos === 'bottom_left') overlayFilter = 'overlay=10:main_h-overlay_h-10';
      else if (pos === 'bottom_right') overlayFilter = 'overlay=main_w-overlay_w-10:main_h-overlay_h-10';

      await execAsync(
        `ffmpeg -y -i "${subtitledPath}" -i "${localLogo}" -filter_complex "[0:v][1:v]${overlayFilter}[v]" -map "[v]" -map 0:a? -c:v libx264 -preset veryfast -pix_fmt yuv420p -crf 23 -c:a aac -b:a 192k "${watermarkedPath}"`,
        { timeout: 600000 }
      );
    } catch (e) {
      console.warn(`[VideoAssembler] Watermark rendering failed: ${e.message}`);
      watermarkedPath = subtitledPath;
    }
  }

  // 10. Apply styling presets and color grading filters
  let styledPath = watermarkedPath;
  const styleConfig = job?.styleConfig || {};
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
      `ffmpeg -y -i "${watermarkedPath}" -vf "${filters}" -c:v libx264 -preset veryfast -pix_fmt yuv420p -crf 23 -c:a aac -b:a 192k "${styledPath}"`,
      { timeout: 600000 }
    );
  }

  // 11. Final encode: H.264 + AAC, web-optimised with faststart
  const finalPath = path.join(outDir, 'final.mp4');
  await execAsync(
    `ffmpeg -y -i "${styledPath}" ` +
    `-c:v libx264 -crf 23 -preset veryfast -pix_fmt yuv420p ` +
    `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
    `-movflags +faststart ` +
    `"${finalPath}"`,
    { timeout: 600000 },
  );

  if (!fs.existsSync(finalPath)) {
    throw new Error(`Final video not produced at ${finalPath}`);
  }

  // 12. Get duration
  const duration = await getVideoDuration(finalPath);

  // 13. Cleanup intermediate files (keep final)
  const tempFiles = [concatPath, mergedPath, withAudioPath, subtitledPath, watermarkedPath, styledPath];
  for (const f of tempFiles) {
    if (f && f !== finalPath && fs.existsSync(f)) {
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
