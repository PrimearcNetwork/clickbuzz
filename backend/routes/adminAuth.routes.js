const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuth.controller');

// Password gate for the /admin and /analytics dashboards — see
// middleware/adminSession.middleware.js.
router.post('/login', adminAuthController.login);
router.get('/session', adminAuthController.session);
router.post('/logout', adminAuthController.logout);

module.exports = router;
