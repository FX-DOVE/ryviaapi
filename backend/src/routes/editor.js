import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import {
  getEditor,
  putEditor,
  bootstrapEditor,
  exportEditor,
  streamEditorExport,
  uploadEditorAudio,
} from '../controllers/editorController.js';

const router = Router({ mergeParams: true });

router.get('/', getEditor);
router.put('/', putEditor);
router.post('/bootstrap', bootstrapEditor);
router.post('/export', exportEditor);
router.get('/stream', streamEditorExport);
router.post('/audio', upload.single('audio'), uploadEditorAudio);

export default router;
