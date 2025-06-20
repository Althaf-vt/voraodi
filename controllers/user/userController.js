const { generate } = require('mongoose/lib/types/objectid');
const env = require('dotenv').config();
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { search } = require('../../server');
const { find } = require('../../models/addressSchema');


// const loadHomepage = async (req,res) =>{
//     try {
//         const user = req.session.user;
//         if(user){
//             const userData = await User.findOne({_id:user._id});
//             return res.render("home",{user:userData})
//         }else{
//             return res.render('home');
//         }

//     } catch (error) {
//         console.log("Home page not found");
//         res.status(500).send('Server error');
//     }
// }




// Load HomePage
const loadHomepage = async (req, res) => {
    try {
        // Get the logged-in user ID from session (normal login) or from Passport (Google login)
        const user = req.session.user || (req.user && req.user._id);
        const categories = await Category.find({isListed:true});
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category=>category._id)},quantity:{$gt:0}
        });


        productData.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
        productData = productData.slice(0,4);

        if (user) {
            const userData = await User.findOne({ _id: user });
            return res.render("home", { user: userData ,products:productData});
        } else {
            return res.render('home',{products:productData});
        }
    } catch (error) {
        console.log("Home page not found",error);
        res.status(500).send('Server error');
    }
};

// Load Signup
const loadSignup = async (req,res) =>{
    try {
        return res.render('signup')
    } catch (error) {
        console.log("Signup page not loading",error);
        res.status(500).send('Server Error');
    }
}

// OTP Generation
function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

//Send OTP to user email
async function sendVerificationEmail(email,otp){
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
        console.error('Error sending Email',error);
        return false
    }
}

// Signup Checks
const signup = async (req,res) =>{
    try {
        const {name,phone,email,password,cPassword} = req.body;
        if(password !== cPassword){
            return res.render('signup',{message: "Password do not match"});
        }

        // checkig user exist or not
        const findUser = await User.findOne({email});
        if(findUser){
            return res.render('signup',{message: "User with this email already exists"})
        }

        const otp = generateOtp();// generate otp

        const emailSend = await sendVerificationEmail(email,otp);

        if(!emailSend){
            return res.json("email-error");
        }

        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password}

        res.render('otp-verification');
        console.log('OTP Sent',otp)
    } catch (error) {
        console.error('Signup error',error);
        res.redirect('/pageNotFound');
    }
}


// Hashing password using bcrypt
const securePassword = async (password) =>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10)

        return passwordHash

    } catch (error) {
        console.error('Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
}

// OTP Verification
const otpVerification = async (req,res) =>{
    try {
        
        const {otp} = req.body;
        const userOtp = req.session.userOtp;
        // console.log(otp);

        // console.log(`session otp ${userOtp}`)
        

        if(otp===userOtp){
            const user= req.session.userData;
            const passwordHash = await securePassword(user.password);

            if (!passwordHash) {
                throw new Error('Password hashing failed');
            }

            const saveUserData = new User ({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            })

            await saveUserData.save();

            // req.session.user = saveUserData._id;

            return res.json({success: true, redirectUrl: '/signin'})
        }else{
            return res.status(400).json({success:false,message:'Invalid OTP, Please try again'});
        }
    } catch (error) {
        console.error('Error verifiying OTP',error);
        return res.status(500).json({success:false,message:'An error occured'});
    }
}


//Resend OTP 
const resendOtp = async (req,res)=>{
    try {
        

        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"});

        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSend = await sendVerificationEmail(email,otp)
        if(emailSend){
            console.log("Resend OTP : ",otp);
            return res.status(200).json({success:true,message:"OTP Resend Successfully"})
        }else{
           return res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"});
        }

    } catch (error) {
        console.error("Error resending OTP",error);
       return res.status(500).json({success:false,message:'Internal Server Error. Please try again'})
    }
}

// Load Signing
const loadSignin = async (req, res) => {
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
        res.redirect('/pageNotFound');
        console.log("Signin page not loading", error);
        res.status(500).send('Server Error');
    }
};

// Signin Checks
const signin = async (req,res) =>{
    try {
        const {email,password} = req.body;

        if (!email || !password) {
            return res.render('signin', { message: 'Email and password are required' });
        }

        const findUser = await User.findOne({isAdmin:false,email:email});

        if(!findUser){
            return res.render('signin',{message:"User not found"});
        }
        if(findUser.isBlocked){
            return res.render("signin",{message:"User is blocked by admin"});
        }
        if (!findUser.password) {
            console.error('No password found for user:', email);
            return res.render('signin', { message: 'User account is corrupted. Please contact support.' });
        }
        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render('signin',{message:"Incorrect Password"});
        }
        req.session.user = findUser._id;

        res.redirect('/')
    } catch (error) {
        console.error("login error",error);
        res.render("signin",{message:"signin failed, please try again"})
    }
}

// Logout User
const logout = async (req,res)=>{
    try {
        
        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error",err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/signin')
        })

    } catch (error) {
        console.log('Logout error',error);
        res.redirect('/pageNotFound');
    }
}

// Page Not Found
const pageNotFound = async (req,res) =>{
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

// Shopping Page
const loadShoppingPage = async (req,res)=>{
    try {

        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const categories = await Category.find({isListed:true});
        const categoryIds = categories.map((category)=>category._id.toString());

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page-1)*limit;
        const products = await Product.find({
            isBlocked:false,
            category:{$in:categoryIds},
            quantity:{$gt:0},
        }).sort({createdOn:-1}).skip(skip).limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: {$in:categoryIds},
            quantity:{$gt:0},
        });
        const totalPages = Math.ceil(totalProducts/limit);
        const categoriesWithIds = categories.map(category => ({_id:category._id,name:category.name}));

        res.render('shop',{
            user: userData,
            products: products,
            category: categoriesWithIds,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
        });
    } catch (error) {
        console.log('Error while rendering shop',error);
        res.redirect('/pageNotFound');
    }
}


// Fileter Product

const filterProduct = async (req,res)=>{
    try {
        
        const user = req.session.user;
        const category = req.query.category;

        const findCategory = category ?  await Category.findOne({_id:category}) : null;
        //Query instance
        const query = {
            isBlocked: false,
            quantity: {$gt:0}
        }

        if(findCategory){
            query.category = findCategory._id;
        }

        let findProducts = await Product.find(query).lean();

        findProducts.sort((a,b)=> new Date(b.createdOn)- new Date(a.createdOn));

        const categories = await Category.find({isListed:true});

        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);
        //
        let userData = null;
        if(user){
            userData = await User.findOne({_id:user});
            if(userData){
                const searchEntry = {
                    category: findCategory ? findCategory._id : null,
                    searchedOn: new Date(),
                }
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;

        res.render('shop',{
            user: userData,
            products: currentProduct,
            category: categories,
            totalPages,
            currentPage,
            selectedCategory: category || null,
        })

    } catch (error) {
        console.log('Error in filter product',error);
        res.redirect('/pageNotFound');
    }
}


const searchProducts = async(req,res)=>{
    try {
        
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        let search = req.body.query;

        const categories = await Category.find({isListed:true}).lean();
        const categoryIds = categories.map(category=>category._id.toString());

        let searchResult = [];

        if(req.session.filteredProducts && req.session.filteredProducts.length > 0){
            searchResult = req.session.filteredProducts.filter((Product) =>{
               return Product.productName.toLowerCase().includes(search.toLowerCase())
            })
        }else{
            searchResult = await Product.find({
                productName: {$regex:".*"+search+".*",$options:"i"},
                isBlocked: false,
                quantity: {$gt:0},
                category: {$in:categoryIds}
            })
        }
        searchResult.sort((a,b)=> new Date(b.createdOn) - new Date(a.createdOn));
        
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);
        
        res.render('shop',{
            user: userData,
            products: currentProduct,
            category: categories,
            totalPages,
            currentPage,
            count: searchResult.length,
            searchQuery: search
        })

    } catch (error) {
        console.log('Error in Search',error);
        res.redirect('/pageNotFound');
    }
}

// Filter by Price

const filterByPrice = async(req,res)=>{
    try {

        const minPrice = parseInt(req.query.gt) || 0;
        const maxPrice = parseInt(req.query.lt) || 1000000;

        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const categories = await Category.find({isListed:true}).lean();

        let findProducts = await Product.find({
            salePrice: { $gt: minPrice, $lt: maxPrice},
            isBlocked: false,
            quantity: {$gt:0}
        }).lean();

        findProducts.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
        //
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);

        req.session.filteredProducts = findProducts;

        res.render('shop',{
            user: userData,
            products: currentProduct,
            category: categories,
            totalPages,
            currentPage,

        })

    } catch (error) {
        console.log("Error in Filter by price",error);
        res.redirect('/pageNotFound');
    }
}


const sortProducts = async(req,res)=>{
    try {

        const sort = req.query.sort;

        const user= req.session.user;
        const userData = await User.findOne({_id:user});
        const categories = await Category.find({isListed:true}).lean();
        let findProducts = await Product.find({
            isBlocked: false,
            quantity: {$gt:0}
        }).lean();

        if(sort === "Low-High"){
            findProducts.sort((a,b)=>a.salePrice - b.salePrice);
        }else if(sort === "High-Low"){
            findProducts.sort((a,b)=>b.salePrice - a.salePrice);
        }else if(sort === "A-Z"){
            findProducts.sort((a,b)=>a.productName.localeCompare(b.productName));
        }else{
            findProducts.sort((a,b)=>b.productName.localeCompare(a.productName));
        }

        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);


        res.render('shop',{
            user: userData,
            products: currentProduct,
            category: categories,
            totalPages,
            currentPage,
        })
    } catch (error) {
        console.log("Error in Sort",error);
        res.redirect('/pageNotFound');
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
    filterProduct,
    filterByPrice,
    searchProducts,
    sortProducts,
}