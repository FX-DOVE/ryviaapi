import Job from '../models/Job.js';
import Scene from '../models/Scene.js';
import Screenplay from '../models/Screenplay.js';
import { JOB_STATUS, SCENE_STATUS } from '../config/constants.js';
import { emitJobEvent } from '../config/socket.js';
import { logInfo } from './logService.js';
import { assembleVideo } from './videoAssembler.js';
import { uploadToCloud } from './storageService.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { tempDir } from '../config/constants.js';

const execAsync = promisify(exec);

const SCENES_PER_CHAPTER = 15; // 15 scenes × ~20s conceptual = ~5 minutes per chapter

/**
 * FEATURE FILM ORCHESTRATOR
 *
 * Manages the production of feature-length films (90+ minutes, 540+ scenes).
 * Splits the job into chapters of 30 scenes each, processes them in parallel
 * batches, assembles chapter videos, then joins everything into the final film.
 *
 * Architecture:
 *   Job (540 scenes) → 18 chapters × 30 scenes
 *                    → process chapters in parallel (up to 4 at once)
 *                    → assemble each chapter → chapter video
 *                    → join all chapters → final 90-min film
 */

/**
 * Get all chapter numbers for a job.
 */
export async function getJobChapters(jobId) {
  const scenes = await Scene.distinct('chapter', { jobId });
  return scenes.sort((a, b) => a - b);
}

/**
 * Check if all scenes in a chapter are completed.
 */
export async function isChapterComplete(jobId, chapterNumber) {
  const total = await Scene.countDocuments({ jobId, chapter: chapterNumber });
  const done = await Scene.countDocuments({ jobId, chapter: chapterNumber, status: SCENE_STATUS.DONE });
  return total > 0 && total === done;
}

/**
 * Assemble a single chapter's scenes into one video file.
 * Called automatically when all scenes in a chapter complete.
 *
 * @param {string} jobId
 * @param {number} chapterNumber
 * @returns {Promise<string>} Cloud URL of assembled chapter video
 */
export async function assembleChapter(jobId, chapterNumber) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await logInfo(jobId, `Assembling Chapter ${chapterNumber}...`);
  emitJobEvent(jobId, 'chapter_assembling', { chapterNumber });

  const chapterScenes = await Scene.find({
    jobId,
    chapter: chapterNumber,
    status: SCENE_STATUS.DONE,
  }).sort({ sceneNumber: 1 });

  if (chapterScenes.length === 0) {
    throw new Error(`No completed scenes in chapter ${chapterNumber}`);
  }

  const chapterTempDir = path.join(tempDir(jobId), `chapter_${chapterNumber}`);
  fs.mkdirSync(chapterTempDir, { recursive: true });

  // Download scene videos locally for assembly
  const axios = (await import('axios')).default;
  const localScenes = [];

  for (const scene of chapterScenes) {
    if (!scene.videoPath) continue;
    const filename = `scene_${String(scene.sceneNumber).padStart(4, '0')}.mp4`;
    const localPath = path.join(chapterTempDir, filename);

    if (!fs.existsSync(localPath)) {
      const res = await axios({ method: 'GET', url: scene.videoPath, responseType: 'stream' });
      const writer = fs.createWriteStream(localPath);
      res.data.pipe(writer);
      await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
    }

    localScenes.push({ ...scene.toObject(), videoPath: localPath });
  }

  // Write chapter concat list with scene transitions
  const concatPath = path.join(chapterTempDir, 'concat.txt');
  const loopedPaths = [];

  for (let i = 0; i < localScenes.length; i++) {
    const s = localScenes[i];
    if (!fs.existsSync(s.videoPath)) continue;

    const duration = s.duration || 10;
    const loopedPath = path.join(chapterTempDir, `looped_${i}.mp4`);

    await execAsync(
      `ffmpeg -y -stream_loop -1 -i "${s.videoPath}" -t ${duration} -vf "scale=1920:1080,fps=25" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${loopedPath}"`,
      { timeout: 300000 }
    );

    // Add crossfade transition between scenes (except the last)
    if (i < localScenes.length - 1 && s.transitionOut === 'dissolve') {
      loopedPaths.push({ path: loopedPath, transition: 'dissolve' });
    } else {
      loopedPaths.push({ path: loopedPath, transition: 'cut' });
    }
  }

  // Simple concat (transitions via filter_complex are added in final assembly)
  const concatContent = loopedPaths.map(p => `file '${p.path.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatPath, concatContent, 'utf8');

  const chapterVideoPath = path.join(chapterTempDir, `chapter_${chapterNumber}.mp4`);
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${chapterVideoPath}"`,
    { timeout: 600000 }
  );

  // Upload chapter video to cloud
  const cloudKey = `jobs/${jobId}/chapters/chapter_${String(chapterNumber).padStart(2, '0')}.mp4`;
  const cloudUrl = await uploadToCloud(chapterVideoPath, cloudKey, 'video/mp4');

  // Save to job's chapter paths
  await Job.findByIdAndUpdate(jobId, {
    $push: { chapterVideoPaths: cloudUrl },
    $inc: { completedChapters: 1 },
  });

  await logInfo(jobId, `Chapter ${chapterNumber} assembled and uploaded.`);
  emitJobEvent(jobId, 'chapter_complete', { chapterNumber, cloudUrl });

  return cloudUrl;
}

/**
 * Check if all chapters are complete, and if so, join them into the final film.
 */
export async function checkAllChaptersComplete(jobId) {
  const job = await Job.findById(jobId);
  if (!job?.filmMode) return;

  const chapters = await getJobChapters(jobId);
  const allDone = await Promise.all(chapters.map(c => isChapterComplete(jobId, c)));

  if (allDone.every(Boolean) && job.completedChapters >= job.totalChapters) {
    await joinChaptersIntoFilm(jobId);
  }
}

/**
 * Join all chapter videos into the final feature-length film.
 * Adds chapter title cards, credits, and final color grading.
 */
export async function joinChaptersIntoFilm(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.ASSEMBLING, progress: 88 });
  await logInfo(jobId, 'Joining all chapters into final feature film...');

  const screenplay = job.screenplayId ? await Screenplay.findById(job.screenplayId) : null;
  const joinTempDir = path.join(tempDir(jobId), 'final_join');
  fs.mkdirSync(joinTempDir, { recursive: true });

  const axios = (await import('axios')).default;

  // Sort chapter paths by chapter number
  const chapterPaths = [...(job.chapterVideoPaths || [])].sort();
  const localChapters = [];

  for (let i = 0; i < chapterPaths.length; i++) {
    const localPath = path.join(joinTempDir, `chapter_${String(i + 1).padStart(2, '0')}.mp4`);
    if (!fs.existsSync(localPath)) {
      const res = await axios({ method: 'GET', url: chapterPaths[i], responseType: 'stream' });
      const writer = fs.createWriteStream(localPath);
      res.data.pipe(writer);
      await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
    }
    localChapters.push(localPath);
  }

  // Generate chapter title card videos if screenplay has act titles
  const finalParts = [];
  if (screenplay?.acts?.length > 0) {
    for (let i = 0; i < localChapters.length; i++) {
      // Every N chapters = new act → insert title card
      const scenesPerChapter = SCENES_PER_CHAPTER;
      const scenesPerAct = Math.ceil(screenplay.totalScenes / screenplay.acts.length);
      const chaptersPerAct = Math.ceil(scenesPerAct / scenesPerChapter);

      if (i % chaptersPerAct === 0) {
        const actIndex = Math.floor(i / chaptersPerAct);
        const act = screenplay.acts[actIndex];
        if (act) {
          const titleCardPath = await generateChapterTitleCard(joinTempDir, act.title || `Act ${act.actNumber}`, actIndex + 1);
          if (titleCardPath) finalParts.push(titleCardPath);
        }
      }

      finalParts.push(localChapters[i]);
    }
  } else {
    finalParts.push(...localChapters);
  }

  // Final concat
  const finalConcatPath = path.join(joinTempDir, 'final_concat.txt');
  const finalConcatContent = finalParts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(finalConcatPath, finalConcatContent, 'utf8');

  const rawFinalPath = path.join(joinTempDir, 'raw_final.mp4');
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${finalConcatPath}" -c copy "${rawFinalPath}"`,
    { timeout: 3600000 } // 1 hour for long films
  );

  // Apply final color grade and Background Music
  const { styleConfig } = job;
  const finalPath = path.join(joinTempDir, 'final.mp4');
  const colorFilter = getColorGradeForAnimation(job.animationStyle, styleConfig?.colorGrade);
  const letterbox = ['3d_cgi_hollywood', 'cinematic'].includes(job.animationStyle)
    ? ',drawbox=y=0:h=ih*0.12:color=black:t=fill,drawbox=y=ih-ih*0.12:h=ih*0.12:color=black:t=fill'
    : '';

  // Get raw final duration
  const { stdout: rawDurOut } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawFinalPath}"`);
  const rawFinalDuration = Math.round(parseFloat(rawDurOut.trim())) || 10;

  // Generate Music
  const { generateBackgroundMusic } = await import('./musicService.js');
  const musicPrompt = screenplay?.acts?.[0]?.musicStyle || 'epic cinematic orchestral score, emotional';
  const musicPath = path.join(joinTempDir, 'bgm.mp3');
  await generateBackgroundMusic(musicPrompt, rawFinalDuration, musicPath);

  // Mix audio and apply video filters
  if (fs.existsSync(musicPath)) {
    await execAsync(
      `ffmpeg -y -i "${rawFinalPath}" -i "${musicPath}" -filter_complex "[0:v]${colorFilter}${letterbox}[v];[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.4:dropout_transition=3[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 22 -preset medium -c:a aac -movflags +faststart "${finalPath}"`,
      { timeout: 3600000 }
    );
  } else {
    await execAsync(
      `ffmpeg -y -i "${rawFinalPath}" -vf "${colorFilter}${letterbox}" -c:v libx264 -crf 22 -preset medium -c:a copy -movflags +faststart "${finalPath}"`,
      { timeout: 3600000 }
    );
  }

  // Upload final film
  const finalKey = `jobs/${jobId}/outputs/final.mp4`;
  const finalUrl = await uploadToCloud(finalPath, finalKey, 'video/mp4');

  // Get duration
  const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalPath}"`);
  const duration = Math.round(parseFloat(stdout.trim())) || 0;

  await Job.findByIdAndUpdate(jobId, {
    status: JOB_STATUS.COMPLETED,
    progress: 100,
    finalVideoPath: finalUrl,
    duration,
    completedAt: new Date(),
  });

  emitJobEvent(jobId, 'job_completed', { finalVideoPath: finalUrl, duration });
  await logInfo(jobId, `🎬 Feature film complete! Duration: ${Math.round(duration / 60)} minutes.`);
  return finalUrl;
}

/**
 * Generate a 3-second title card for an act using FFmpeg drawtext.
 */
async function generateChapterTitleCard(dir, actTitle, actNumber) {
  const outputPath = path.join(dir, `title_act_${actNumber}.mp4`);
  try {
    const safeTitle = actTitle.replace(/'/g, "\\'").replace(/:/g, '\\:');
    await execAsync(
      `ffmpeg -y -f lavfi -i "color=c=black:size=1920x1080:duration=3:rate=25" ` +
      `-vf "drawtext=text='${safeTitle}':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.5),t/0.5,if(lt(t,2.5),1,max(0,(3-t)/0.5)))'" ` +
      `-c:v libx264 -preset fast -crf 23 "${outputPath}"`,
      { timeout: 30000 }
    );
    return fs.existsSync(outputPath) ? outputPath : null;
  } catch (err) {
    console.warn(`[FeatureFilmOrchestrator] Title card generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Get FFmpeg color grade filter appropriate for the animation style.
 */
function getColorGradeForAnimation(animationStyle, colorGrade) {
  const gradeMap = {
    '3d_cgi_hollywood': "curves=r='0/0 0.5/0.6 1/1':b='0/0 1/0.85'",
    '2d_anime':         "hue=s=1.2,eq=contrast=1.1:brightness=0.02",
    'pixar':            "eq=contrast=1.05:saturation=1.15:brightness=0.03",
    'nollywood_drama':  "curves=r='0/0 0.5/0.55 1/1':g='0/0 0.5/0.52 1/0.98'",
    'realistic':        "eq=contrast=1.02:saturation=0.95",
    'cinematic':        "curves=r='0/0 0.5/0.55 1/1':g='0/0 0.5/0.5 1/0.95':b='0/0 1/0.9'",
  };
  return gradeMap[animationStyle] || gradeMap['cinematic'];
}

export default {
  getJobChapters,
  isChapterComplete,
  assembleChapter,
  checkAllChaptersComplete,
  joinChaptersIntoFilm,
};
