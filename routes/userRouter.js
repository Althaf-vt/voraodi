const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('../config/passport');


router.get('/',userController.loadHomepage);

// Signup
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post('/otp-verification',userController.otpVerification)
router.post('/resend-otp',userController.resendOtp)

// Signin
router.get('/signin',userController.loadSignin);
router.post('/signin',userController.signin)

// For Google Sign In
router.get('/auth/google/signin',passport.authenticate('google', {scope: ['profile', 'email'],state: 'signin'}));

// For Google Sign Up
router.get('/auth/google/signup',passport.authenticate('google', {scope: ['profile', 'email'],state: 'signup'}));

// Google OAuth callback handler
router.get('/auth/google/callback',passport.authenticate('google', {failureRedirect: '/handle-auth-failure',
failureMessage: true
}),
  (req, res) => {
    req.session.user = req.user._id;
    res.redirect('/');
  });

// Handle Google OAuth failure and redirect accordingly
router.get('/handle-auth-failure', (req, res) => {
  const messages = req.session.messages || [];
  req.session.messages = [];

  const state = req.query.state || 'signin'; // Fallback to signin
  const message = messages[0] || 'Authentication failed';

  return res.render(state === 'signup' ? 'signup' : 'signin', { message });

});


router.get('/logout',userController.logout);
router.get('/pageNotFound',userController.pageNotFound)

module.exports = router;