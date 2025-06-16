const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const {userAuth,adminAuth} = require('../middlewares/auth');
const Product = require('../models/ProductSchema');


router.get('/pageError',adminController.pageError);
//Login Managemant
router.get('/signin',adminController.loadAdminSignin);
router.post('/signin',adminController.signin);
router.get('/',adminAuth,adminController.loadDashboard);
router.get('/logout',adminController.logout);

// Customer Management
router.get('/users',adminAuth,customerController.customerInfo);
router.get('/blockCustomer',adminAuth,customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.customerUnblocked);

// Category Management
router.get('/category',adminAuth,categoryController.categoryInfo);
router.post('/addCategory',adminAuth,categoryController.addCategory);
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer);
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer);
router.get('/listCategory',adminAuth,categoryController.getListCategory);
router.get('/unlistCategory',adminAuth,categoryController.getUnlistCategory);
router.get('/editCategory',adminAuth,categoryController.getEditCategory);
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);

// Product Management
router.get('/products',adminAuth,productController.getAllProducts)
router.get('/addProduct',adminAuth,productController.getAddProduct)
router.post('/addProduct',adminAuth,upload.array('images',4),productController.addProduct)

module.exports = router;