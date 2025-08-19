const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Order = require('../../models/orderSchema');
// const handleSession = require('../user/handleSession');
const handleSession = require('./handleSession');
// import handleSession from '../user/handleSession.js';
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs/promises');
const env = require('dotenv').config();
const session = require('express-session');
const { generate } = require('mongoose/lib/types/objectid');
const { response, link } = require('../../server');
const Product = require('../../models/productSchema');
const mongoose = require("mongoose");
const Coupon = require('../../models/couponSchema');
const messages = require('../../public/constants/messages');
const statusCodes = require('../../public/constants/statusCodes');


// Generate OTP
function generateOtp() {
    const digits = '1234567890';
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// Verification Email
const sendVerificationEmail = async (email, otp) => {
    try {

        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: "587",
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for Password reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP : ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email Send : ${info.messageId}`);
        return true;
    } catch (error) {
        console.error("Error in Send Email", error);
        return false;
    }
}

// Secure Password 
const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.log("Error in Password Hash", error);
    }
}

const getForgotPassword = async (req, res, next) => {
    try {

        if (req.session.user) {
            return res.redirect('/')
        }
        req.session.step = 'forgot-pass';
        res.render('forgot-password');
    } catch (error) {
        console.log(error)
        next(error);
    }
}

const forgotEmailValid = async (req, res, next) => {
    try {

        if (req.session.step !== 'forgot-pass') {
            return redirect('/singin');
        }

        const { email } = req.body;

        const findUser = await User.findOne({ email: email });

        if (findUser) {
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email, otp);

            if (emailSend) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.step = 'forgot-pass-otp';
                console.log('F-Pass-OTP : ', otp);
                return res.redirect('/forgot-pass-otp');

            } else {
                return res.json({ success: false, message: "Falied to send OTP, Please try again" });
            }
        } else {
            return res.render('forgot-password', {
                message: "User with this email does not exist"
            });
        }

    } catch (error) {
        console.log(error);
        next(error);
    }
}

const forgotPassOtp = async (req, res, next) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        if (req.session.step !== 'forgot-pass-otp') {
            return res.redirect('/signin');
        }

        return res.render('forgotPass-otp');
    } catch (error) {
        console.log('Error while rendering forgot password otp : ', error);
        next(error)
    }
}

const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        if (enteredOtp === req.session.userOtp) {
            req.session.step = 'reset-pass';
            return res.json({ success: true, redirectUrl: '/reset-password' });
        } else {
            return res.json({ success: false, message: 'OTP not matching' });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const getResetPassword = async (req, res, error) => {
    try {
        if (req.session.user) {
            return res.redirect('/')
        }
        if (req.session.step !== 'reset-pass') {
            return res.redirect('/signin');
        }
        return res.render('reset-password');
    } catch (error) {
        console.error("Error while rendering reset password page");
        next(error);
    }
}

const resendOtp = async (req, res) => {
    try {

        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;

        console.log(`Resending OTP to email ${email}`);

        const emailSend = await sendVerificationEmail(email, otp);

        if (emailSend) {
            console.log(`Resended OTP : ${otp}`);

            return res.status(200).json({ success: true, message: "Resend OTP Successful" });
        }
    } catch (error) {
        console.error('Error in resend OTP', error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const NewPassword = async (req, res, next) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        if (req.session.step !== 'reset-pass') {
            return res.redirect('/signin');
        }
        const { newPass1, newPass2 } = req.body;
        const email = req.session.email;

        if (newPass1 === newPass2) {
            console.log(newPass1, ",", newPass2)
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                { email: email },
                { $set: { password: passwordHash } }
            )

            //Clear session
            req.session.userOtp = null;
            req.session.email = null;
            req.session.step = null;

            return res.render('reset-password', { success: true, message: null });
        } else {
            return res.render('reset-password', { message: 'Password do not match' })
        }
    } catch (error) {
        console.log(error);
        next(error);
    }
}

const userProfile = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        if (!userData) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }
        return res.render('profile', {
            user: userData,
        })
    } catch (error) {
        console.error('Error while loading Profile', error);
        next(error);
    }
}

const userAccount = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        return res.render('userAccount', { user });
    } catch (error) {
        console.log("Error in loading user account", error);
        next(error);
    }
}

//Edit image
const editImage = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });
        const profileImage = req.file;
        console.log('Req.file ========> : ', req.file);

        if (!profileImage) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Build URL to store in Mongo
        const savedUrl = profileImage.path.replace(/^public[\\/]/, '').replace(/\\/g, '/');

        //Delete previous image
        if (user.image && user.image.startsWith('uploads/profile-images')) {
            await fs.unlink(path.join(__dirname, '../../public', user.image))
                .catch((error) => {
                    console.log('Error while deleting previous image', error)
                })
        }

        user.image = savedUrl
        await user.save();

        return res.status(200).json({ success: true, message: 'Profile photo updated', image: savedUrl });

    } catch (error) {
        console.error('Error in add image :', error);
        res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const changeEmail = async (req, res, next) => {
    try {

        req.session.step = 'change-email'; // session created 
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        return res.render('change-email', {
            userData: user,
        });
    } catch (error) {
        console.error('Error in loading change email page', error);
        next(error)
    }
}

const changeEmailValid = async (req, res, next) => {
    try {
        if (req.session.step !== 'change-email') {
            return res.redirect('/userProfile')
        }

        const userId = req.session.user;
        const { email } = req.body;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }
        const userExists = await User.findOne({ email: email, isAdmin: false });


        if (userExists) {
            if (user.email !== userExists.email) {
                return res.render('change-email', {
                    userData: user,
                    message: 'Please enter your own email id'
                })
            }
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email, otp);

            if (emailSend) {
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                req.session.step = 'otp-verify'; // session created 

                console.log('Change Email OTP :', otp);

                return res.redirect('/verify-email-otp');

            } else {
                const err = new Error("Failed to send OTP");
                err.statusCode = 500;
                throw err;
            }
        } else {
            console.log('user not exist')
            return res.render('change-email', {
                message: "User with this email not exist",
                userData: user
            });
        }
    } catch (error) {
        console.error('error in loading chnage email otp page', error);
        next(error);
    }
}

const emailOtpPage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        if (req.session.step !== 'otp-verify') {
            return res.redirect('/userProfile')
        }
        return res.render('change-email-otp', { userData: user });
    } catch (error) {
        console.log('Error in rendering otp page : ', error);
        next(error)
    }
}

const verifyOtp = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        const enteredOtp = req.body.otp;

        if (!req.session.userOtp || !req.session.email) {
            return res.redirect('/change-email');
        }

        if (enteredOtp === req.session.userOtp) {

            req.session.step = 'new-email'; // session created 
            // OTP verified, invalidate session
            req.session.userData = req.body.userData;

            return res.render('new-email', {
                userData: user
            })
        } else {
            return res.render('change-email-otp', {
                message: "OTP not mathcing",
                userData: user
            })
        }
    } catch (error) {
        console.log("Error in verify otp", error);
        next(error)
    }
}

const UpdateEmail = async (req, res, next) => {
    try {

        // check session
        if (req.session.step !== 'new-email') {
            return res.redirect('/userProfile');
        }

        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        if (user.email === newEmail) {
            res.render('new-email', { message: 'Please enter an email that different from the old one', userData: user })
        }
        await User.findByIdAndUpdate(userId, { email: newEmail });

        // remove all created sessions
        req.session.userOtp = null;
        req.session.userData = null;
        req.session.email = null;
        req.session.step = null;

        return res.redirect('/userProfile?success=' + encodeURIComponent('Email Updated Successfully'));

    } catch (error) {
        console.log("Error in update Email", error);
        next(error)
    }
}

const changePassword = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        req.session.step = 'change-pass';
        return res.render('change-password', { userData: user });
    } catch (error) {
        console.log('Error in loading change password');
        next(error)
    }
}

const changePasswordValid = async (req, res, next) => {
    try {
        const { email } = req.body;
        const userId = req.session.user;
        const userExists = await User.findOne({ email });
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        if (userExists) {
            if (userExists.email !== user.email) {
                return res.render('change-password', { message: 'Please enter your own email id', userData: user })
            }
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email, otp);
            if (emailSend) {
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                req.session.step = 'change-pass-otp';

                console.log("OTP : ", otp);
                return res.redirect('/verify-change-pass-otp');
            } else {
                return res.json({
                    success: false,
                    message: 'Failed to send OTP. Please try again'
                });
            }
        } else {
            return res.render('change-password', {
                message: "User with this Email does not exist",
                userData: user
            })
        }
    } catch (error) {
        console.log("Error in change pass valid");
        next(error);
    }
}

const passOtpPage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        if (req.session.step !== 'change-pass-otp') {
            return res.redirect('/userProfile')
        }
        return res.render('change-pass-otp', { userData: user });
    } catch (error) {
        console.log('Error when loading change pass otp page : ', error);
        next(error)
    }
}

const verifyChangePassOtp = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {

            req.session.step = 'new-pass';

            return res.render('new-password', {
                userData: user,
            })

        } else {
            return res.render('change-pass-otp', {
                message: "OTP not mathcing",
                userData: user
            })
        }
    } catch (error) {
        console.log("Error in verify change pass");
        next(error);
    }
}

const UpdatePassword = async (req, res, next) => {
    try {

        if (req.session.step !== 'new-pass') {
            return res.redirect('/pageNotFound');
        }
        const { newPass1, newPass2 } = req.body;
        const userId = req.session.user;

        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        if (newPass1 === newPass2) {
            console.log(newPass1, ",", newPass2)
            const passwordHash = await securePassword(newPass1);

            if (passwordHash === user.password) {
                return res.render('new-password', { message: 'Password must be different from you old password', userData: user });
            }

            await User.findByIdAndUpdate(userId, { password: passwordHash });

            // remove session
            req.session.userOtp = null;
            req.session.userData = null;
            req.session.email = null;
            req.session.step = null;
            return res.redirect('/userProfile?success=' + encodeURIComponent('Password Updated Successfully'));
        } else {
            return res.render('new-password', { message: 'Password do not match', userData: user })
        }
    } catch (error) {
        console.log('Error in Update password', error);
        next(error)
    }
}

const changeName = async (req, res) => {
    try {

        const { newName } = req.body;
        const userId = req.session.user;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(500).json({ success: false, message: 'User not found' });
        }
        const currentName = user.name;

        if (currentName === newName) {
            return res.status(500).json({ success: false, message: 'Please Enter a Different Name' });
        }

        user.name = newName

        await user.save();

        return res.status(200).json({ success: true, message: 'Name Updated Successfully' });

    } catch (error) {
        console.log('Error in Change name');
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }

}

const changePhone = async (req, res) => {
    try {
        const { newPhone } = req.body;
        const userId = req.session.user;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(500).json({ success: false, message: 'User not found' });
        }

        const currentPhone = user.phone;

        if (currentPhone === newPhone) {
            return res.status(500).json({ success: false, message: 'Please Enter a Different Number' });
        }

        user.phone = newPhone

        await user.save();

        return res.status(200).json({ success: true, message: 'Number Updated Successfully' });

    } catch (error) {
        console.log('Error in Change Phone');
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const addresses = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        if (!userData) {
            const err = new Error("User data not found");
            err.statusCode = 404;
            throw err;
        }
        const addressData = await Address.findOne({ userId: userId })


        return res.render('address', {
            user: userData,
            userAddress: addressData ? addressData.address : []
        })
    } catch (error) {
        console.error('Error while loading Profile', error);
        next(error)
    }
}

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({ _id: userId });

        const { name, country, state, city, street, pincode, phone, altPhone } = req.body;

        const userAddress = await Address.findOne({ userId: userData._id });

        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                address: [{ name, country, state, city, street, pincode, phone, altPhone }]
            });
            await newAddress.save();
        } else {
            userAddress.address.push({ name, country, state, city, street, pincode, phone, altPhone });
            await userAddress.save();
        }

        return res.status(200).json({ success: true, message: 'Address added successful' });

    } catch (error) {
        console.log("Error while adding address : ", error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const getEditAddress = async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.session.user;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log('ivalid address id')
            return res.status(400).json({ success: false, message: 'Invalid address id' });
        }

        const doc = await Address.findOne(
            { userId, 'address._id': id },
            { 'address.$': 1, _id: 0 }
        ).lean();


        if (!doc) {
            console.log('no user')
            return res.status(400).json({ success: false, message: 'Address not found' });
        }
        console.log('user here')

        return res.status(200).json({ success: true, address: doc.address[0] })

    } catch (error) {
        console.error('GET /address error:', err);
        res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const editAddress = async (req, res) => {
    try {

        const userId = req.session.user;
        const addressId = req.params.id;

        const {
            name,
            country,
            state,
            city,
            street,
            pincode,
            phone,
            altPhone = ''
        } = req.body;

        const address = await Address.findOne({ userId, 'address._id': addressId });
        if (!address) {
            console.log('address not found in db');
            return res.status(400).json({ success: false, message: 'Address not found' });
        }

        await Address.updateOne(
            { userId, 'address._id': addressId },
            {
                $set: {
                    'address.$.name': name,
                    'address.$.country': country,
                    'address.$.state': state,
                    'address.$.city': city,
                    'address.$.street': street,
                    'address.$.pincode': pincode,
                    'address.$.phone': phone,
                    'address.$.altPhone': altPhone
                }
            }
        )

        return res.status(200).json({ success: true, message: 'Address updated successfully' });

    } catch (error) {
        console.error("Errorn in edit address", error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const deleteAddress = async (req, res) => {
    try {
        const { id } = req.body;
        const userId = req.session.user

        if (!id) {
            console.log('no id')
            return res.status(400).json({ success: false });
        }

        const addrId = new mongoose.Types.ObjectId(id);

        console.log('id here')
        const result = await Address.updateOne(
            { userId, 'address._id': addrId },
            { $pull: { address: { _id: addrId } } }
        );


        if (!result.modifiedCount) {
            console.log('not modified')
            return res.status(400).json({ success: false, message: 'Address not found' })
        }

        return res.status(200).json({ success: true, message: 'Address deleted' });

    } catch (error) {
        console.error('Error in delete Address', error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR })
    }
}

const loadCart = async (req, res, next) => {
    try {
        req.session.orderSuccess = null;
        const userId = req.session.user;
        const userData = await User.findOne({ _id: userId });

        if (!userData) {
            const err = new Error("User Data not found");
            err.statusCode = 404;
            throw err;
        }

        const userCart = await Cart.findOne({ userId: userId }).populate('items.productId');

        if (!userCart) {
            const err = new Error("Cart not found");
            err.statusCode = 404;
            throw err;
        }

        return res.render('cart', {
            user: userData,
            cartItems: userCart?.items || [],
        })


    } catch (error) {
        console.error('Errorn while loading cart', error);
        next(error);
    }
}

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.query.id;
        const sku = req.query.sku;
        const quantity = parseInt(req.query.quantity, 10);

        if (quantity > 3) {
            return res.status(400).json({ success: false, message: 'Maximum 3 quantiy for each product' })
        }

        // isBlock? // Get product and find variant
        const findProduct = await Product.findById(productId);

        if (!findProduct) {
            return res.status(400).json({ success: false, message: 'Product not found.' });
        }

        if (findProduct.isBlock) {
            return res.status(400).json({ success: false, message: 'This product has been blocked by the admin.' });
        }

        const selectedVariant = findProduct.variants.find(v => v.sku === sku);

        if (!selectedVariant) {
            return res.status(400).json({ success: false, message: 'Invalid Variant selected' });
        }

        // checking quantity of that variant
        if (selectedVariant.quantity < quantity) {
            return res.status(400).json({ success: false, message: 'Requested quantity exceeds stock' });
        }

        let userCart = await Cart.findOne({ userId });

        if (!userCart) {
            // create new cart
            userCart = new Cart({
                userId,
                items: []
            });
        }

        //Check if same product and sku already in cart
        const itemIndex = userCart.items.findIndex(item => item.productId.equals(productId) && item.sku === sku);



        if (itemIndex > -1) {
            //  Product already in cart. update qty
            const item = userCart.items[itemIndex];
            if (item.quantity > 3 || item.quantity + quantity > 3) {
                return res.status(400).json({ success: false, message: 'Maximum 3 quantiy for each product' });
            }
            item.quantity += quantity;

            if (item.quantity > selectedVariant.quantity) {
                return res.status(400).json({ success: false, message: 'Exceeds available stock' });
            }

            item.totalPrice = item.quantity * item.price;

        } else {
            // Product not in cart → add to items
            userCart.items.push({
                productId,
                sku: selectedVariant.sku,
                size: selectedVariant.size,
                quantity,
                price: findProduct.salePrice,
                totalPrice: quantity * findProduct.salePrice
            });
        }
        await userCart.save();

        const totalItems = userCart.items.reduce((total, item) => total + item.quantity, 0);

        return res.status(200).json({
            success: true,
            message: 'Product added to cart',
            cartCount: totalItems,
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const updateQty = async (req, res) => {
    try {
        const userId = req.session.user;
        const itemId = req.query.id;
        const action = req.query.action;

        if (!userId || !itemId || !['increase', 'decrease'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }

        const userCart = await Cart.findOne({ userId });

        if (!userCart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const itemObjectId = new mongoose.Types.ObjectId(itemId);
        const itemIndex = userCart.items.findIndex(item => item._id.equals(itemObjectId));
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Product not found in cart' });
        }

        // const product = await Product.findOne({_id:});
        // console.log(product)

        const item = userCart.items[itemIndex];

        const product = await Product.findOne({ _id: item.productId });

        const variant = product.variants.find(v => v.sku === item.sku);


        if (action === 'increase') {
            if (item.quantity < variant.quantity) {
                item.quantity += 1;

            } else {
                console.log('stock exceed')
                return res.status(500).json({ success: false, message: 'Stcok exceed' })
            }


        } else if (action === 'decrease') {
            item.quantity -= 1;

            //Remove if quantity is 0
            // if(item.quantity <= 0){
            //     userCart.items.splice(itemIndex,1);
            // }
        }

        if (item.quantity > 3) {
            return res.status(400).json({ success: false, message: 'maximum 3 quantiy for each product' });
        }

        // Update total price only if item still exists
        if (item.quantity > 0) {
            item.totalPrice = item.quantity * item.price;
        }

        await userCart.save();

        return res.status(200).json({ success: true, message: 'Quantity updated successfully' })

    } catch (error) {
        console.error('Error updating cart quantity:', error);
        return res.status(500).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const removeItem = async (req, res) => {
    try {
        const userId = req.session.user;
        const itemId = req.query.id;

        const userCart = await Cart.findOne({ userId });

        if (!userCart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const itemIndex = userCart.items.findIndex((item) => item._id.equals(itemId));
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }


        userCart.items.splice(itemIndex, 1);
        await userCart.save();

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error in Delete item from cart', error);
        return res.status(404).json({ success: false, message: messages.SERVER_ERROR });
    }
}

const orderPage = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const userId = req.session.user;
        const user = await User.findOne({ _id: userId })

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        const orders = await Order.find({ userId: userId }).populate('orderedItems.product')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments({ userId: userId });
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('order', {
            orders: orders,
            user,
            currentPage: page,
            totalPages,

        });
    } catch (error) {
        console.log('Error while loading order page', error);
        next(error);
    }
}

const getCoupons = async (req, res, next) => {
    try {
        const userId = req.session.user;

        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        const [publicCoupons, privateCoupons] = await Promise.all([
            Coupon.find({
                isListed: true,
                isPublic: true,
                expireOn: { $gte: new Date() }
            }),
            Coupon.find({
                isListed: true,
                isPublic: false,
                givenTo: userId,
                expireOn: { $gte: new Date() }
            })
        ])

        const coupons = [...publicCoupons, ...privateCoupons];

        return res.render('user-coupons', {
            coupons,
            user
        })
    } catch (error) {
        console.log("Error while loading Coupon page", error);
        next(error);
    }
}

module.exports = {
    getForgotPassword,
    forgotEmailValid,
    forgotPassOtp,
    verifyForgotPassOtp,
    getResetPassword,
    resendOtp,
    NewPassword,
    userProfile,
    editImage,
    changeEmail,
    changeEmailValid,
    verifyOtp,
    UpdateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    UpdatePassword,
    changeName,
    changePhone,
    addresses,
    // addAddress,
    postAddAddress,
    getEditAddress,
    editAddress,
    deleteAddress,
    loadCart,
    addToCart,
    updateQty,
    removeItem,
    orderPage,
    getCoupons,
    emailOtpPage,
    passOtpPage,
    userAccount
}