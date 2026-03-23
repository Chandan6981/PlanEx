const express       = require('express');
const router        = express.Router();
const auth          = require('../middleware/auth');
const validateObjId = require('../middleware/validateObjectId');
const {
  getAllProjects, createProject, getProject,
  updateProject, deleteProject, addMember,
  getProjectStats, updateColumns, getAssignedProjects
} = require('../controllers/projectController');
const { validateCreateProject, validateUpdateProject } = require('../validators/projectValidator');

router.get ('/',                  auth, getAllProjects);
router.post('/',                  auth, validateCreateProject, createProject);
// IMPORTANT: /assigned must be before /:id to avoid conflict
router.get ('/assigned',          auth, getAssignedProjects);
router.get ('/:id',               auth, validateObjId, getProject);
router.put ('/:id',               auth, validateObjId, validateUpdateProject, updateProject);
router.delete('/:id',             auth, validateObjId, deleteProject);
router.post('/:id/members',       auth, validateObjId, addMember);
router.get ('/:id/stats',         auth, validateObjId, getProjectStats);
router.put ('/:id/columns',       auth, validateObjId, updateColumns);

module.exports = router;