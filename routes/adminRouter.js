const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const { userAuth, adminAuth } = require('../middlewares/auth');
const Product = require('../models/productSchema');



//Login Managemant
router.get('/signin', adminController.loadAdminSignin);
router.post('/signin', adminController.signin);
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);

// Customer Management
router.get('/users', adminAuth, customerController.customerInfo);
router.get('/blockCustomer', adminAuth, customerController.customerBlocked);
router.get('/unblockCustomer', adminAuth, customerController.customerUnblocked);
router.get('/searchCustomer', adminAuth, customerController.seachCustomer)
// router.get('/customer-action',adminAuth,(req,res)=>{
//     const {action,id} = req.query;

//     if(action === 'block'){
//        return customerController.customerBlocked(req,res);   
//     }else{
//        return customerController.customerUnblocked(req,res);
//     }
// })

// Category Management
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/addCategoryOffer', adminAuth, categoryController.addCategoryOffer);
router.post('/removeCategoryOffer', adminAuth, categoryController.removeCategoryOffer);
router.get('/listCategory', adminAuth, categoryController.getListCategory);
router.get('/unlistCategory', adminAuth, categoryController.getUnlistCategory);
router.get('/editCategory', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);
router.get('/deleteCategory', adminAuth, categoryController.deleteCategory);
router.get('/searchCategory', adminAuth, categoryController.searchCategory);

// Product Management
router.get('/products', adminAuth, productController.getAllProducts);
router.get('/addProduct', adminAuth, productController.getAddProduct);
router.post('/addProduct', adminAuth, upload.array('images', 4), productController.addProduct);
router.post('/addProductOffer', adminAuth, productController.addProductOffer);
router.post('/removeProductOffer', adminAuth, productController.removeProductOffer);
router.get('/blockProduct', adminAuth, productController.blockProduct);
router.get('/unblockProduct', adminAuth, productController.unblockProduct);
router.get('/editProduct', adminAuth, productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, upload.array('productImages', 4), productController.editProduct)
router.post('/deleteImage', adminAuth, productController.deleteSingleImage);
router.get('/deleteProduct', adminAuth, productController.deleteProduct)
router.get('/searchProduct', adminAuth, productController.searchProduct);


//Order management 
router.get('/orders', adminAuth, orderController.loadOrders);
router.get('/orderDetails', adminAuth, orderController.orderDetails);
router.post('/updateOrderStatus', adminAuth, orderController.updateOrderStatus);
router.post('/approveReturnOrder', adminAuth, orderController.approveReturnOrder)
router.post('/rejectReturnOrder', adminAuth, orderController.rejectReturnOrder);

router.patch('/approve-return-item',adminAuth,orderController.approveReturnItem)
router.patch('/reject-return-item',adminAuth,orderController.rejectReturnItem)

// Coupon management
router.get('/coupons', adminAuth, couponController.getAllCoupons);
router.get('/add-coupon', adminAuth, couponController.getAddCoupon);
router.post('/add-coupon', adminAuth, couponController.addCoupon);
router.get('/getCoupon/:id', adminAuth, couponController.getEditCoupon);
router.patch('/edit-coupon', adminAuth, couponController.editCoupon)
router.delete('/delete-coupon',adminAuth,couponController.deleteCoupon);
router.patch('/coupon-list-unlist',adminAuth,couponController.listUnlist);

router.get('/pageError', adminController.pageError);


module.exports = router;