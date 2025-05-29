const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('../config/passport');


router.get('/',userController.loadHomepage);
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post('/otp-verification',userController.otpVerification)
router.post('/resend-otp',userController.resendOtp)
router.get('/signin',userController.loadSignin);

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res) =>{
    res.redirect('/')
});


router.get('/pageNotFound',userController.pageNotFound)

module.exports = router;