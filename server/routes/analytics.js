const router          = require('express').Router();
const auth            = require('../middleware/auth');
const validateObjectId = require('../middleware/validateObjectId');
const { getPersonalAnalytics, getProjectAnalytics } = require('../controllers/analyticsController');

router.use(auth);
router.get('/personal',    getPersonalAnalytics);
router.get('/project/:id', validateObjectId, getProjectAnalytics);

module.exports = router;