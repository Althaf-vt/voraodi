const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const { userAuth } = require('../middlewares/auth');


// Home Page & Shopping page
router.get('/',userController.loadHomepage);
router.get('/shop',userAuth,userController.loadShoppingPage);
router.get('/filter',userAuth,userController.filterProduct)
router.get('/filterPrice',userAuth,userController.filterByPrice);
router.post('/searchProducts',userAuth,userController.searchProducts);
router.get('/sortProducts',userAuth,userController.sortProducts)



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
    const authState = req.query.state;

    if(authState === 'signin'){
      req.session.user = req.user._id;
      res.redirect('/');
    }else{
      res.redirect('/signin');
    }
    
  });

// Handle Google OAuth failure and redirect accordingly
router.get('/handle-auth-failure', (req, res) => {
  const messages = req.session.messages || [];
  req.session.messages = [];

  const state = req.query.state || 'signin'; // Fallback to signin
  const message = messages[0] || 'Authentication failed';

  return res.render(state === 'signup' ? 'signup' : 'signin', { message });

});


// Profile Management
router.get('/forgot-password',profileController.getForgotPassword);
// router.post('/forgot-password',profileController.forgotEmailValid);
router.post('/forgot-email-valid',profileController.forgotEmailValid);
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp);
router.post('/resend-forgot-otp',profileController.resendOtp);
router.get('/reset-password',profileController.getResetPassword);
router.post('/reset-password',profileController.NewPassword);

// Product Management 
router.get('/productDetails',userAuth,productController.productDetails);

router.get('/logout',userController.logout);
router.get('/pageNotFound',userController.pageNotFound)

module.exports = router;