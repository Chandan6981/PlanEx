const express       = require('express');
const router        = express.Router();
const auth          = require('../middleware/auth');
const validateObjId = require('../middleware/validateObjectId');
const { upload, uploadAudio } = require('../services/s3Service');
const {
  getAllTasks, getTask, createTask, bulkUpdateTasks, updateTask, deleteTask,
  addComment, addVoiceComment, deleteComment,
  uploadAttachment, deleteAttachment, updateSubtask, addSubtask
} = require('../controllers/taskController');
const { validateCreateTask, validateUpdateTask } = require('../validators/taskValidator');

router.get ('/',                                    auth, getAllTasks);
router.post('/',                                    auth, validateCreateTask, createTask);
router.put ('/bulk/update',                         auth, bulkUpdateTasks);
router.get ('/:id',                                 auth, validateObjId, getTask);
router.put ('/:id',                                 auth, validateObjId, validateUpdateTask, updateTask);
router.delete('/:id',                               auth, validateObjId, deleteTask);

// Comments
router.post  ('/:id/comments',                      auth, validateObjId, addComment);
router.post  ('/:id/comments/voice',                auth, validateObjId, uploadAudio.single('audio'), addVoiceComment);
router.delete('/:id/comments/:commentId',           auth, validateObjId, deleteComment);

// Attachments
router.post  ('/:id/attachments',                   auth, validateObjId, upload.single('file'), uploadAttachment);
router.delete('/:id/attachments/:attachmentId',     auth, validateObjId, deleteAttachment);

// Subtasks
router.put ('/:id/subtasks/:subtaskId',             auth, validateObjId, updateSubtask);
router.post('/:id/subtasks',                        auth, validateObjId, addSubtask);

module.exports = router;