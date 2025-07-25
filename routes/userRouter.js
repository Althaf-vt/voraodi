const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const wishlistController = require('../controllers/user/wishlistController');
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const multer = require('../middlewares/profileMulter');
const { userAuth } = require('../middlewares/auth');


// Home Page & Shopping page
router.get('/',userController.loadHomepage);
router.get('/shop',userController.loadShoppingPage);
router.get('/quickView',productController.quickView);

// Signup
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post('/otp-verification',userController.otpVerification)
router.post('/resend-otp',userController.resendOtp);

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
router.post('/forgot-email-valid',profileController.forgotEmailValid);
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp);
router.post('/resend-forgot-otp',profileController.resendOtp);
router.get('/reset-password',profileController.getResetPassword);
router.post('/reset-password',profileController.NewPassword);
router.get('/userProfile',userAuth,profileController.userProfile);
router.get('/change-email',userAuth,profileController.changeEmail);
router.post('/change-email',userAuth,profileController.changeEmailValid);
router.post('/verify-email-otp',userAuth,profileController.verifyOtp);
router.post('/update-email',userAuth,profileController.UpdateEmail)
router.get('/change-password',userAuth,profileController.changePassword)
router.post('/change-password',userAuth,profileController.changePasswordValid);
router.post('/verify-change-pass-otp',userAuth,profileController.verifyChangePassOtp);
router.post('/update-password',userAuth,profileController.UpdatePassword);
router.patch('/edit-profile/name',userAuth,profileController.changeName);
router.patch('/edit-profile/phone',userAuth,profileController.changePhone);
router.patch('/edit-profile/image',userAuth,multer.single('avatar'),profileController.editImage)


// Address Management
router.get('/userAddress',userAuth,profileController.addresses)
// router.get('/add-address',userAuth,profileController.addAddress);
router.post('/add-address',userAuth,profileController.postAddAddress);
router.get('/get-address/:id',userAuth,profileController.getEditAddress);
router.patch('/edit-address/:id',userAuth,profileController.editAddress);
router.delete('/delete-address',userAuth,profileController.deleteAddress);

//Cart
router.get('/cart',userAuth,profileController.loadCart);
router.get('/addToCart',userAuth,profileController.addToCart);
router.post('/cart/update-quantity',userAuth,profileController.updateQty);
router.post('/cart/remove-item',userAuth,profileController.removeItem);

// Wishlist
router.post('/addToWishlist',userAuth,productController.addToWishlist);
router.get('/wishlist',userAuth,wishlistController.loadWishlist);
router.post('/check-qty',userAuth,wishlistController.checkStock);
router.post('/wishlist/addTocart',userAuth,wishlistController.addToCart);
router.patch('/wishlist-remove-item',userAuth,wishlistController.removeItem)

// Orders
router.get('/orders',userAuth,profileController.orderPage);
router.get('/order-details/:id',userAuth,orderController.orderDetailpage);
router.post('/cancel-item',userAuth,orderController.cancelItem);
router.post('/cancel-order',userAuth,orderController.cancelOrder);
router.post('/return-item',userAuth,orderController.returnItem);
router.post('/return-order',userAuth,orderController.returnOrder);
router.get('/invoice',userAuth,orderController.invoice);


// Checkout
router.get('/checkout',userAuth,checkoutController.loadCheckout);
router.post('/apply-coupon',userAuth,checkoutController.applyCoupon)
router.post('/cart/check-stock',userAuth,checkoutController.checkStock);
router.post('/verify-razorpay-payment',userAuth,checkoutController.verifyRazorpayPayment);
router.post('/place-order',userAuth,checkoutController.placeOrder);
router.get('/order-success/:id',userAuth,checkoutController.orderSuccess);
router.get('/payment-failed',userAuth,checkoutController.paymentFailed)
router.post('/create-razorpay-order',userAuth,checkoutController.createRazorpayOrder);



// Product Management 
router.get('/productDetails/:id',productController.productDetails);

// Coupons
router.get('/coupons',userAuth,profileController.getCoupons)

router.get('/logout',userController.logout);
router.get('/pageNotFound',userController.pageNotFound);



module.exports = router;