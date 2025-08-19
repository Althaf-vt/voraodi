const { generate } = require('mongoose/lib/types/objectid');
const env = require('dotenv').config();
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { search } = require('../../server');
const { find } = require('../../models/addressSchema');
const mongoose = require('mongoose');



// Load HomePage
const loadHomepage = async (req, res, next) => {
    try {
        // Get the logged-in user ID from session (normal login) or from Passport (Google login)
        const user = req.session.user || (req.user && req.user._id);
        const categories = await Category.find({ isListed: true });

        if (!categories || categories.length === 0) {
            const err = new Error('No categories found');
            err.statusCode = 404;
            throw err;
        }

        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            // variants: { $elemMatch: { quantity: { $gt: 0 } } }
        });


        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if (user) {
            const userData = await User.findOne({ _id: user });

            if (!userData) {
                const err = new Error('User not found');
                err.statusCode = 404;
                throw err;
            }
            return res.render("home", { user: userData, products: productData });
        } else {
            return res.render('home', { products: productData });
        }
    } catch (error) {
        console.log("Home page not found", error);
        next(error);
    }
};

// Load Signup
const loadSignup = async (req, res, next) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        return res.render('signup')
    } catch (error) {
        console.log("Signup page not loading", error)
        const err = new Error('Failed to load signup page')
        next(err)
    }
}

// OTP Generation
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

//Send OTP to user email
async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({

            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }

        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b> Your OTP: ${otp}</b>`,
        })

        return info.accepted.length > 0
    } catch (error) {
        console.error('Error sending Email', error);
        return false
    }
}


// Helper to generate a referral code
function createReferralCode(name) {
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '');
    const prefix = trimmed.slice(0, 4);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${random}`;
}

//referral code generator that ensures uniqueness
async function generateReferralCode(name) {
    let code;
    let isUnique = false;

    while (!isUnique) {
        code = createReferralCode(name);
        const existing = await User.findOne({ referralCode: code });
        if (!existing) isUnique = true;
    }

    return code;
}

// Signup Checks
const signup = async (req, res, next) => {
    try {
        const { name, phone, email, password, cPassword } = req.body;
        if (password !== cPassword) {
            return res.render('signup', { message: "Password do not match" });
        }

        // checkig user exist or not
        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: "User with this email already exists" })
        }

        const otp = generateOtp();// generate otp

        const emailSend = await sendVerificationEmail(email, otp);


        if (!emailSend) {
            const err = new Error('Failed to send verification email');
            err.statusCode = 500;
            err.email = email;
            throw err
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password }

        res.render('otp-verification');
        console.log('OTP Sent', otp)
    } catch (error) {
        console.error('Signup error', error);

        error.message = error.message || 'Signup process failed';
        error.statusCode = error.statusCode || 500;

        next(error);
    }
}


// Hashing password using bcrypt
const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10)

        return passwordHash

    } catch (error) {
        console.error('Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
}

// OTP Verification
const otpVerification = async (req, res, next) => {
    try {

        const { otp } = req.body;
        const userOtp = req.session.userOtp;
        // console.log(otp);

        // console.log(`session otp ${userOtp}`)


        if (otp === userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            if (!passwordHash) {
                const err = new Error('Failed to hash password');
                err.statusCode = 500;
                throw err;
            }

            const referralCode = await generateReferralCode(user.name);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referralCode
            })

            await saveUserData.save();

            const newWallet = new Wallet({
                userId: saveUserData._id,
            });

            newWallet.save();

            // req.session.user = saveUserData._id;

            return res.json({ success: true, redirectUrl: '/signin' })
        } else {
            return res.status(400).json({ success: false, message: 'Invalid OTP, Please try again' });
        }
    } catch (error) {
        console.error('Error verifiying OTP', error);
        error.statusCode = error.statusCode || 500;
        error.message = error.message || 'OTP verification failed';
        next(error);
    }
}


//Resend OTP 
const resendOtp = async (req, res) => {
    try {


        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });

        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSend = await sendVerificationEmail(email, otp)
        if (emailSend) {
            console.log("Resend OTP : ", otp);
            return res.status(200).json({ success: true, message: "OTP Resend Successfully" })
        } else {
            return res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }

    } catch (error) {
        console.error("Error resending OTP", error);
        return res.status(500).json({ success: false, message: 'Internal Server Error. Please try again' })
    }
}

// Load Signing
const loadSignin = async (req, res, next) => {
    try {
        if (!req.session.user) {
            // Get any failure messages from passport (Google OAuth)
            const messages = req.session.messages || [];
            req.session.messages = []; // clear messages after reading

            return res.render('signin', { message: messages[0] || '' });
        } else {
            res.redirect('/');
        }
    } catch (error) {

        console.log("Signin page not loading", error);
        error.statusCode = error.statusCode || 500;
        error.message = error.message || 'Failed to load signin page';
        next(error);
    }
};

// Signin Checks
const signin = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('signin', { message: 'Email and password are required' });
        }

        const findUser = await User.findOne({ isAdmin: false, email: email });

        if (!findUser) {
            return res.render('signin', { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render("signin", { message: "User is blocked by admin" });
        }
        if (!findUser.password) {
            console.error('No password found for user:', email);
            return res.render('signin', { message: 'User account is corrupted. Please contact support.' });
        }
        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render('signin', { message: "Incorrect Password" });
        }
        req.session.user = findUser._id;

        res.redirect('/')
    } catch (error) {
        console.error("login error", error);
        error.statusCode = error.statusCode || 500;
        error.message = error.message || 'Signin failed';
        next(error);
    }
}

// Logout User
const logout = async (req, res, next) => {
    try {

        req.session.destroy((err) => {
            if (err) {
                console.log("Session destruction error", err.message);
                const error = new Error("Failed to log out user");
                error.statusCode = 500;
                return next(error);
            }
            return res.redirect('/signin')
        })

    } catch (error) {
        console.log('Logout error', error);
        error.statusCode = 500;
        error.message = 'Unexpected error during logout';
        next(error);
    }
}

// Page Not Found
const pageNotFound = async (req, res) => {
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

// Shopping Page
const loadShoppingPage = async (req, res, next) => {
    try {
        req.session.filteredProducts = null;
        // const searchQuery = req.query.search;


        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map((category) => category._id.toString());

        if (!categories || categories.length === 0) {
            const err = new Error("No categories found");
            err.statusCode = 404;
            throw err;
        }

        const {
            category: categoryQuery,
            sort,
            priceFilter,
            query: searchQuery,
            page = 1,
        } = req.query

        const filter = { isBlocked: false, }

        if (categoryQuery) {
            const selectedCategoryIds = categoryQuery.split(',');
            filter.category = { $in: selectedCategoryIds };
        } else {
            filter.category = { $in: categoryIds };
        }

        if (searchQuery) {
            filter.productName = { $regex: searchQuery, $options: 'i' };
        }

        if (priceFilter === 'under500') {
            filter.salePrice = { $lt: 500 };
        } else if (priceFilter === '500to1000') {
            filter.salePrice = { $gte: 500, $lte: 1000 };
        } else if (priceFilter === '1000to1500') {
            filter.salePrice = { $gt: 1000, $lt: 1500 };
        } else if (priceFilter === 'above1500') {
            filter.salePrice = { $gt: 1500 };
        }

        let sortOption = { createOn: -1 };
        if (sort === 'priceLowHigh') sortOption = { salePrice: 1 };
        else if (sort === 'priceHighLow') sortOption = { salePrice: -1 };
        else if (sort === 'nameAZ') sortOption = { productName: 1 };
        else if (sort === 'nameZA') sortOption = { productName: -1 };



        const limit = 8;
        const skip = (parseInt(page) - 1) * limit;

        const products = await Product.find(filter)
            .populate('category')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const categoriesWithIds = categories.map(cat => ({
            _id: cat._id,
            name: cat.name
        }))

        const selectedCategories = categoryQuery ? categoryQuery.split(',') : [];
        const sortBy = sort || '';
        const selectedPriceFilters = priceFilter ? [priceFilter] : [];


        //         const cart = await Cart.find({userId:user});
        //         console.log(cart)

        //         let totalItems = 0
        //         if(cart && cart.items.length > 1){


        //           for(let item of cart.items){
        //             totalItems += item.quantity
        //           }


        //         }
        //  console.log(totalItems)

        res.render('shop', {
            user: userData,
            products,
            category: categoriesWithIds,
            totalProducts,
            currentPage: parseInt(page),
            totalPages,
            searchQuery: searchQuery || "",
            paginationBaseRoute: `/shop?`,
            selectedCategories,
            sortBy,
            selectedPriceFilters

        });
    } catch (error) {
        console.log('Error while rendering shop', error);
        error.statusCode = error.statusCode || 500;
        error.message = error.message || 'Failed to load shopping page';
        next(error);
    }
}

const cartCount = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ count: 0 });
        }

        const cart = await Cart.findOne({ userId: req.session.user });
        let count = 0;

        if (cart && cart.items.length > 0) {
            count = cart.items.reduce((total, item) => total + item.quantity, 0);
        }

        res.json({ count });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({ error: 'Failed to fetch cart count' });
    }
}

const aboutPage = async (req, res, next) => {
    try {
        return res.render('about');
    } catch (error) {
        console.log('Error in loading about page : ', error);
        error.statusCode = 500;
        error.message = 'Failed to load About page';
        next(error);
    }
}

const contactPage = async (req, res, next) => {
    try {
        return res.render('contact');
    } catch (error) {
        console.log('Error in loading contact page : ', error);
        error.statusCode = 500;
        error.message = 'Failed to load Contact page';
        next(error);
    }
}


module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadSignin,
    signup,
    otpVerification,
    resendOtp,
    signin,
    logout,
    loadShoppingPage,
    aboutPage,
    contactPage,
    cartCount
    // filterProduct,
    // filterByPrice,
    // searchProducts,
    // sortProducts,
    // getFilteredProducts
}