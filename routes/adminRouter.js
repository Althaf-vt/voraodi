const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const {userAuth,adminAuth} = require('../middlewares/auth');

router.get('/signin',adminController.loadAdminLogin);
router.post('/signin',adminController.login);
router.get('/',adminAuth,adminController.loadDashboard);
router.get('/logout',adminController.logout);

router.get('/pageError',adminController.pageError);
module.exports = router;