import fs from 'fs';
import path from 'path';
import {
  jobDir, inputDir, sceneImgDir, sceneVidDir,
  audioDir, subtitleDir, tempDir, outputDir,
  JOB_STORAGE_QUOTA,
} from '../config/constants.js';
import { S3StorageProvider } from '../providers/storage/S3StorageProvider.js';

const s3Storage = new S3StorageProvider();


/**
 * Create all required sub-directories for a job.
 */
export async function createJobDirs(jobId) {
  const dirs = [
    inputDir(jobId),
    sceneImgDir(jobId),
    sceneVidDir(jobId),
    audioDir(jobId),
    subtitleDir(jobId),
    tempDir(jobId),
    outputDir(jobId),
  ];
  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

/**
 * Delete a job's entire directory tree and output directory.
 */
export async function deleteJobFiles(jobId) {
  const dirs = [jobDir(jobId), outputDir(jobId)];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
      console.log(`[Storage] Deleted: ${dir}`);
    }
  }
}

/**
 * Delete only the temp directory (called after each batch).
 */
export async function deleteTempFiles(jobId) {
  const dir = tempDir(jobId);
  if (fs.existsSync(dir)) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.mkdir(dir, { recursive: true });   // recreate empty
  }
}

/**
 * Compute the total disk usage of a job's storage in bytes.
 */
export async function getJobStorageSize(jobId) {
  let total = 0;
  for (const dir of [jobDir(jobId), outputDir(jobId)]) {
    total += await getDirSize(dir);
  }
  return total;
}

async function getDirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stat = await fs.promises.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}

/**
 * Check if a job has exceeded its storage quota.
 * Returns true if quota is exceeded.
 */
export async function isQuotaExceeded(jobId) {
  const size = await getJobStorageSize(jobId);
  return size > JOB_STORAGE_QUOTA;
}

/**
 * Get file size in bytes, returns 0 if file doesn't exist.
 */
export async function getFileSize(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Upload a local file to cloud storage.
 */
export async function uploadToCloud(localPath, destKey, contentType) {
  return s3Storage.uploadFile(localPath, destKey, contentType);
}

/**
 * Get cloud download URL.
 */
export async function getCloudUrl(destKey) {
  return s3Storage.getDownloadUrl(destKey);
}

/**
 * Delete a file from cloud storage.
 */
export async function deleteFromCloud(destKey) {
  return s3Storage.deleteFile(destKey);
}

export default {
  createJobDirs, deleteJobFiles, deleteTempFiles,
  getJobStorageSize, isQuotaExceeded, getFileSize,
  uploadToCloud, getCloudUrl, deleteFromCloud,
};

