import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { inputDir } from '../config/constants.js';

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'audio/mp3',
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.pdf', '.docx', '.mp3', '.wav', 
  '.png', '.jpg', '.jpeg', '.webp', 
  '.mp4', '.mov', '.avi', '.webm'
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * Multer storage engine that saves to the job's input directory.
 * The jobId is set on req.body by the time multer runs (from a text field).
 * If no jobId yet, files go to a temp dir and move later.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.body?.jobId || req.params?.id;
    const dir   = jobId ? inputDir(jobId) : path.join(process.cwd(), 'storage', 'temp-upload');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
});

export default upload;
