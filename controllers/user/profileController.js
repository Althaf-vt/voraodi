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



// Generate OTP

function generateOtp(){
    const digits = '1234567890';
    let otp = '';
    for (let i = 0; i < 6; i ++){
        otp += digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

// Verification Email

const sendVerificationEmail = async (email,otp)=>{
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
            html:`<b><h4>Your OTP : ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email Send : ${info.messageId}`);
        return true;
    } catch (error) {
        console.error("Error in Send Email",error);
        return false;
    }
}

// Secure Password 

const securePassword = async(password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        console.log("Error in Password Hash",error);
    }
}

// Handle Session
// async function handleSession(purpose,req,otp,email){
//     try {
//         if(purpose==='delete'){
//             delete req.session.userOtp;
//             delete req.session.OtpSession;
//             delete req.session.email;

//         }else if(purpose === 'create'){
//             req.session.userOtp = otp;
//             req.session.email = email;
//             req.session.OtpSession = true;
//         }
//     } catch (error) {
//         console.log("Error in HnadleSession function",error);
//     } 
// }

// async function handleCache(res){
//     // Prevent back navigation again
//     res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
//     res.setHeader('Pragma', 'no-cache');
//     res.setHeader('Expires', '0');
// }


const getForgotPassword = async (req,res) =>{
    try {
        
        res.render('forgot-password');
    } catch (error) {
        console.log(error)
        res.redirect('/pageNotFound');
    }
}


const forgotEmailValid = async (req,res) =>{
    try {
        
        const {email} = req.body;

        const findUser = await User.findOne({email:email});

        if(findUser){
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email,otp);
            
            if (emailSend){
                req.session.userOtp = otp;
                req.session.email = email;
                console.log('F-Pass-OTP : ',otp);
                return res.render('forgotPass-otp')
                
            }else{
                return res.json({success:false, message :"Falied to send OTP, Please try again"});
            }
        }else{
            return res.render('forgot-password',{
                message: "User with this email does not exist"
            });
        }

    } catch (error) {
        console.log(error);
        return res.redirect('/pageNotFound');
    }
}


const verifyForgotPassOtp = async(req,res) =>{
    try {
        const enteredOtp = req.body.otp;

        if(enteredOtp === req.session.userOtp){
           return res.json({success:true, redirectUrl:'/reset-password'});
        }else{
           return res.json({success:false, message:'OTP not matching'});
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({success:false, message:"An error occured. Please try again"});
    }
}


const getResetPassword = async (req,res) =>{
    try {
        return res.render('reset-password');
    } catch (error) {
        console.error("Error while rendering reset password page");
        return res.redirect('/pageNotFound');
    }
}


const resendOtp = async(req,res)=>{
    try {
        
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;

        console.log(`Resending OTP to email ${email}`);

        const emailSend = await sendVerificationEmail(email,otp);

        if(emailSend){
            console.log(`Resended OTP : ${otp}`);

           return res.status(200).json({success:true, message:"Resend OTP Successful"});
        }
    } catch (error) {
        console.error('Error in resend OTP',error);
        return res.status(500).json({success:false,message: "Internal Server Error"});
    }
}

const NewPassword = async(req,res)=>{
    try {
        const {newPass1,newPass2} = req.body;
        const email = req.session.email;

        if(newPass1 === newPass2){
            console.log(newPass1,",",newPass2)
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            )
            return res.render('reset-password', { success: true, message: null });
        }else{
            return res.render('reset-password',{message:'Password do not match'})
        }
    } catch (error) {
        console.log(error);
        return res.redirect('/pageNotFound');
    }
}

const userProfile = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        // const addressData = await Address.findOne({userId:userId})


        return res.render('profile',{
            user: userData,
            // userAddress: addressData,
        })
    } catch (error) {
        console.error('Error while loading Profile',error);
        return res.redirect('/pageNotFound')
    }
}

//Edit image
 const editImage = async(req,res)=>{
    try {
        const userId = req.session.user;
        const user = await User.findOne({_id:userId});
        const profileImage = req.file;
        console.log('Req.file ========> : ',req.file);

        if(!profileImage){
            return res.status(400).json({success: false , message: 'No file uploaded'});
        }

        // Build URL to store in Mongo
        const savedUrl = profileImage.path.replace(/^public[\\/]/, '').replace(/\\/g, '/');

        //Delete previous image
        if(user.image && user.image.startsWith('uploads/profile-images')){
            await fs.unlink(path.join(__dirname,'../../public',user.image))
            .catch((error)=>{
                console.log('Error while deleting previous image',error)
            })
        }

        user.image = savedUrl
        await user.save();

        return res.status(200).json({ success: true, message: 'Profile photo updated', image: savedUrl });
       
    } catch (error) {
        console.error('Error in add image :', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
 }

const changeEmail = async(req,res)=>{
    try {

        const userId = req.session.user;
        const user = await User.findOne({_id:userId});
        return res.render('change-email',{
            userData:user,
        });
    } catch (error) {
        console.error('Error in loading change email page',error);
        return res.redirect('/pageNotFound');
    }
}

const changeEmailValid = async(req,res)=>{
    try {
        const userId = req.session.user;
        const {email} = req.body;
        const user = await User.findOne({_id:userId});
        const userExists = await User.findOne({email:email,isAdmin:false});
        

        if(userExists){
            console.log('userExits=========>')
            if(user.email !== userExists.email){
                return res.render('change-email',{
                    userData:user,
                    message:'Please enter your own email id'
                })
            }
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email,otp);

            if(emailSend){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;

                console.log('Change Email OTP :',otp);

                return res.render('change-email-otp');
                
            }else{
                return res.json('email-error');
            }
        }else{
            console.log('user not exist')
            return res.render('change-email',{
                message: "User with this email not exist",
                userData:user
            });
        }
    } catch (error) {
        console.error('error in loading chnage email otp page', error);
        return res.redirect('/pageNotFound');
    }
}


const verifyOtp = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;

        if (!req.session.userOtp || !req.session.email) {
            return res.redirect('/change-email');
        }
        
        if(enteredOtp === req.session.userOtp){
            // OTP verified, invalidate session
             req.session.userData = req.body.userData;
            
            return res.render('new-email',{
                userData: req.session.userData,
            })
        }else{
            return res.render('change-email-otp',{
                message: "OTP not mathcing",
                userData: req.session.userData
            })
        }
    } catch (error) {
        console.log("Error in verify otp",error);
        return res.redirect('/pageNotFound');
    }
}

const UpdateEmail = async(req,res)=>{
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        const user = await User.findOne({_id:userId});

        if(user.email === newEmail){
            res.render('new-email',{message:'Please enter an email that different from the old one'})
        }
        await User.findByIdAndUpdate(userId,{email:newEmail});
        
        return res.redirect('/userProfile?success='+encodeURIComponent('Email Updated Successfully'));

    } catch (error) {
        console.log("Error in update Email",error);
        return res.redirect('/pageNotFound');
    }
}


const changePassword = async(req,res)=>{
    try {
        return res.render('change-password');
    } catch (error) {
        console.log('Error in loading change password');
        return res.redirect('/pageNotFound');
    }
}

const changePasswordValid = async(req,res)=>{
    try {
        const {email}=req.body;
        const userId = req.session.user;
        const userExists = await User.findOne({email});
        const user = await User.findOne({_id:userId});

        if(userExists){
            if(userExists.email !== user.email){
                return res.render('change-password',{message:'Please enter your own email id'})
            }
            const otp = generateOtp();
            const emailSend = await sendVerificationEmail(email,otp);
            if(emailSend){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;

                console.log("OTP : ",otp);
                return res.render('change-pass-otp'); 
            }else{
                return res.json({
                    success:false,
                    message:'Failed to send OTP. Please try again'
                });
            }
        }else{
            return res.render('change-password',{
                message:"User with this Email does not exist"
            })
        }
    } catch (error) {
        console.log("Error in change pass valid");
        return res.redirect('/pageNotFound');
    }
}

const verifyChangePassOtp = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            
            return res.render('new-password',{
                userData: req.session.userData,
            })

        }else{
            return res.render('change-pass-otp',{
                message: "OTP not mathcing",
                userData: req.session.userData
            })
        }
    } catch (error) {
        console.log("Error in verify change pass");
        return res.redirect('/pageNotFound');
    }
}

const UpdatePassword = async(req,res)=>{
    try {
        const {newPass1,newPass2} = req.body;
        const userId = req.session.user;

        const user = await User.findOne({_id:userId});

        if(newPass1 === newPass2){
            console.log(newPass1,",",newPass2)
            const passwordHash = await securePassword(newPass1);

            if(passwordHash === user.password){
                return res.render('new-password',{message:'Password must be different from you old password'});
            }
            
            await User.findByIdAndUpdate(userId,{password:passwordHash});
            return res.redirect('/userProfile?success='+encodeURIComponent('Password Updated Successfully'));
        }else{
            return res.render('new-password',{message:'Password do not match'})
        }
    } catch (error) {
        console.log('Error in Update password',error);
        return res.redirect('/pageNotFound');
    }
}

const changeName = async(req,res)=>{
    try {

        const {newName} = req.body;
        const userId = req.session.user;

        const user = await User.findById(userId);

        if(!user){
            return res.status(500).json({success: false, message: 'User not found'});
        }
        const currentName = user.name;

        if(currentName === newName){
            return res.status(500).json({success: false, message: 'Please Enter a Different Name'});
        }

        user.name = newName

        await user.save();

        return res.status(200).json({success:true, message:'Name Updated Successfully'});

    } catch (error) {
        console.log('Error in Change name');
        return res.status(500).json({success:false, message:'Internal Server Error'});
    }

}

const changePhone = async(req,res)=>{
    try {
        const {newPhone} = req.body;
        const userId = req.session.user;

        const user = await User.findById(userId);

        if(!user){
            return res.status(500).json({success:false, message:'User not found'});
        }

        const currentPhone = user.phone;

        if(currentPhone === newPhone){
            return res.status(500).json({success: false, message: 'Please Enter a Different Number'});
        }

        user.phone = newPhone

        await user.save();

        return res.status(200).json({success:true, message:'Number Updated Successfully'});

    } catch (error) {
        console.log('Error in Change Phone');
        return res.status(500).json({success:false, message:'Internal Server Error'});
    }
}

const addresses = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId:userId})


        return res.render('address',{
            user: userData,
            userAddress: addressData.address,
        })
    } catch (error) {
        console.error('Error while loading Profile',error);
        return res.redirect('/pageNotFound')
    }
}

const addAddress = async(req,res)=>{
    try {
        
        const user = req.session.user;
        return res.render('add-address',{user:user});
    } catch (error) {
        console.log("Error in loading add address",error);
        return res.redirect('/pageNotFound');
    }
}

const postAddAddress = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id: userId});

        const {name,country,state,city,street,pincode,phone,altPhone} = req.body;

        const userAddress = await Address.findOne({userId:userData._id});

        if(!userAddress){
            const newAddress = new Address({
                userId: userData._id,
                address: [{name,country,state,city,street,pincode,phone,altPhone}]
                });
            await newAddress.save();
        }else{
            userAddress.address.push({name,country,state,city,street,pincode,phone,altPhone});
            await userAddress.save();
        }

        res.redirect('/userAddress');

    } catch (error) {
        console.log("Error while adding address",error);
        res.redirect('/pageNotFound');
    }
}

// const getEditAddress = async(req,res)=>{
//     try {
//         const addressId = req.query.id;
//         const user = req.session.user;

//         const currentAddress = await Address.findOne({
//             "address._id" : addressId
//         });

//         if(!currentAddress){
//             console.warn('Address not found');
//             return res.status(400).json({success:false,message:'Address not found'});
//         }

//         const addressData = currentAddress.address.find((item)=>{
//             return item._id.toString() === addressId.toString();
//         });

//         if(!addressData){
//             console.warn('No Address Data');
//             return res.status(400).json({success:false, message: 'Address data not found'});
//         }

//         return res.status(200).json({success:true,address:addressData});
//     } catch (error) {
//         console.error('Error in loading edit address',error);
//         return res.status(500).json({success:false,message:'Internal Server Error'});
//     }
// }

const getEditAddress = async(req,res)=>{
    try {
        console.log('backend')
        const id = req.query.id;
        const userId = req.session.user;

        if(!mongoose.Types.ObjectId.isValid(id)){
            console.log('ivalid address id')
            return res.status(400).json({ success: false, message: 'Invalid address id' });
        }

        const doc = await Address.findOne(
            { userId, 'address._id': id },
            { 'address.$': 1, _id: 0 }
        ).lean();

        
        if(!doc){
            console.log('no user')
            return res.status(400).json({success:false,message:'Address not found'});
        }
        console.log('user here')

        return res.status(200).json({success:true, address: doc.address[0] })

    } catch (error) {
        console.error('GET /address error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const editAddress = async(req,res)=>{
    try {

        const userId = req.session.user;
        const addressId = req.query.id;

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

        const address = await Address.findOne({userId,'address._id':addressId});
        if(!address){
            console.log('address not found in db');
            return res.status(400).json({success:false, message:'Address not found'});
        }

        await Address.updateOne(
            {userId,'address._id':addressId},
            {
                $set:{
                    'address.$.name':name,
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

        return res.status(200).json({success:true,message:'Address updated successfully'});

    } catch (error) {
        console.error("Errorn in edit address",error);
        return res.status(500).json({success:false,message:'Internal Server Error'});
    }
}

const deleteAddress = async(req,res)=>{
    try {
        const {id} = req.body;
        const userId = req.session.user
        
        if(!id){
            console.log('no id')
            return res.status(400).json({success:false});
        }

        const addrId = new mongoose.Types.ObjectId(id); 

        console.log('id here')
        const result = await Address.updateOne(
            {userId, 'address._id':addrId},
            {$pull:{address:{_id:addrId}}}
        );


        if(!result.modifiedCount){
            console.log('not modified')
            return res.status(400).json({success:false, message:'Address not found'})
        }

        return res.status(200).json({success:true,message:'Address deleted'});

    } catch (error) {
        console.error('Error in delete Address',error);
        return res.redirect('/pageNotFound');
    }
}

const loadCart = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});

        const userCart = await Cart.findOne({userId:userId}).populate('items.productId');

        console.log('===== ',userCart)

        
            return res.render('cart',{
                user:userData,
                cartItems: userCart?.items || [],
            })
        

    } catch (error) {
        console.error('Errorn while loading cart',error);
        res.redirect('/pageNotFound');
    }
}

const addToCart = async(req,res)=>{
    try {
        const userId = req.session.user;
        const productId = req.query.id;
        const sku = req.query.sku;
        const quantity = parseInt(req.query.quantity, 10);

        // console.log('Product Id : ',productId)
        console.log('SKU : ',sku)
        // console.log('quantity : ',quantity);
        

        // isBlock? // Get product and find variant
        const findProduct = await Product.findById(productId);

        if (!findProduct) {
        return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        if (findProduct.isBlock) {
        return res.status(403).json({ success: false, message: 'This product has been blocked by the admin.' });
        }

        const selectedVariant = findProduct.variants.find(v => v.sku === sku);
        console.log('selectedVariant:',selectedVariant)

        if(!selectedVariant){
            return res.status(400).json({success: false, message: 'Invalid Variant selected'});
        }

        // checking quantity of that variant
        if(selectedVariant.quantity < quantity){
            return res.status(400).json({success: false, message: 'Requested quantity exceeds stock'});
        }

        

        let userCart = await Cart.findOne({userId});
        console.log('userCart:',userCart)

        if(!userCart){
            // create new cart
            userCart = new Cart({
                userId,
                items:[]
            });
            
        }

        //Check if same product + sku already in cart
        const itemIndex = userCart.items.findIndex(item => item.productId.equals(productId) && item.sku === sku);
        console.log('itemIndex:',itemIndex)
  
        if(itemIndex > -1){
             //  Product already exists in cart → update quantity

             const item = userCart.items[itemIndex];
             item.quantity += quantity;

             if(item.quantity > selectedVariant.quantity){
                return res.status(400).json({success: false, message:'Exceeds available stock'});
             }

             item.totalPrice = item.quantity * item.price;

        }else{
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

        // res.redirect()
        return res.status(200).json({ success: true, message: 'Product added to cart' });


    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
}

const updateQty = async(req,res)=>{
    try {
        const userId = req.session.user;
        const itemId = req.query.id;
        const action = req.query.action;

        console.log('in qty fn');

        if(!userId || !itemId || !['increase','decrease'].includes(action)){
            return res.status(400).json({success: false, message: 'Invalid request'});
        }

        const userCart = await Cart.findOne({userId});

        if(!userCart){
            return res.status(404).json({success: false, message: 'Cart not found'});
        }
        console.log(itemId)

        const itemObjectId = new mongoose.Types.ObjectId(itemId);
        console.log(itemObjectId)
        const itemIndex = userCart.items.findIndex(item => item._id.equals(itemObjectId));
        if(itemIndex === -1){
            return res.status(404).json({success: false, message: 'Product not found in cart'});
        }

        // const product = await Product.findOne({_id:});
        // console.log(product)

        const item = userCart.items[itemIndex];
        
        const product = await Product.findOne({_id: item.productId});
        
        const variant = product.variants.find(v => v.sku === item.sku);


        if(action === 'increase'){
            if(item.quantity < variant.quantity){
                item.quantity += 1;
                
            } else{
                console.log('stock exceed')
                return res.status(500).json({success: false, message:'Stcok exceed'})
            }
            
                      
        }else if (action === 'decrease'){
            item.quantity -= 1;

            //Remove if quantity is 0
            if(item.quantity <= 0){
                userCart.items.splice(itemIndex,1);
            }
        }

        // Update total price only if item still exists
        if(item.quantity > 0){
            item.totalPrice = item.quantity * item.price;
        }

        await userCart.save();

        return res.status(200).json({success: true, message: 'Quantity updated successfully'})

    } catch (error) {
        console.error('Error updating cart quantity:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

const removeItem = async(req,res)=>{
    try {
        const userId = req.session.user;
        const itemId = req.query.id;

        const userCart = await Cart.findOne({userId});
        

        if(!userCart){
            return res.status(404).json({success: false, message:"Cart not found"});
        }

        const itemIndex = userCart.items.findIndex((item)=> item._id.equals(itemId));
        if(itemIndex === -1){
            return res.status(404).json({success: false, message: "Product not found in cart"});
        }


        userCart.items.splice(itemIndex,1);
        await userCart.save();

        return res.status(200).json({success: true});

    } catch (error) {
        console.error('Error in Delete item from cart',error);
        return res.status(404).json({success: false, message: "Something went wrong"});
    }
}

const orderPage = async(req,res)=>{
    try {

        const orders = await Order.find()
        
        res.render('order',{
            orders: orders
        });
    } catch (error) {
        console.log('Error while loading order page',error);
        res.redirect('/pageNotFound');
    }
}

module.exports ={
    getForgotPassword,
    forgotEmailValid,
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
    addAddress,
    postAddAddress,
    getEditAddress,
    editAddress,
    deleteAddress,
    loadCart,
    addToCart,
    updateQty,
    removeItem,
    orderPage
}