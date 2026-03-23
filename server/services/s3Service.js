const { S3Client, DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer   = require('multer');
const multerS3 = require('multer-s3');
const path     = require('path');

const s3 = new S3Client({
  region:      process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// ── Allowed types for file attachments ────────────────────────────────────────
const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

// ── Allowed types for voice comments ─────────────────────────────────────────
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
];

const MAX_FILE_SIZE  = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE =  5 * 1024 * 1024; //  5MB (voice clips are small)

// ── File attachment upload (tasks/:id/attachments) ────────────────────────────
const upload = multer({
  storage: multerS3({
    s3,
    bucket:      process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext      = path.extname(file.originalname) || '.bin';
      const filename = `taskflow/tasks/${req.params.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, filename);
    }
  }),
  limits:     { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed: images, PDF, Word, text'), false);
    }
  }
});

// ── Voice comment upload (tasks/:id/comments/voice) ───────────────────────────
const uploadAudio = multer({
  storage: multerS3({
    s3,
    bucket:      process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      // Determine extension from mimetype
      const extMap = {
        'audio/webm':            '.webm',
        'audio/webm;codecs=opus':'.webm',
        'audio/ogg':             '.ogg',
        'audio/ogg;codecs=opus': '.ogg',
        'audio/mp4':             '.mp4',
        'audio/mpeg':            '.mp3',
        'audio/wav':             '.wav',
      };
      const ext      = extMap[file.mimetype] || '.webm';
      const filename = `taskflow/voice-comments/${req.params.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, filename);
    }
  }),
  limits:     { fileSize: MAX_AUDIO_SIZE },
  fileFilter: (req, file, cb) => {
    // Accept if mimetype starts with audio/ even if not in list (browser variations)
    const isAudio = file.mimetype.startsWith('audio/') ||
                    ALLOWED_AUDIO_TYPES.includes(file.mimetype);
    if (isAudio) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed for voice comments'), false);
    }
  }
});

// ── Delete a file from S3 by URL ──────────────────────────────────────────────
const deleteFile = async (fileUrl) => {
  if (!fileUrl || !process.env.AWS_S3_BUCKET) return;
  try {
    const url = new URL(fileUrl);
    const key = decodeURIComponent(url.pathname.slice(1)); // remove leading /
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key:    key
    }));
  } catch (err) {
    // Never crash if S3 delete fails — log and continue
    console.error('S3 delete error:', err.message);
  }
};

module.exports = { upload, uploadAudio, deleteFile };