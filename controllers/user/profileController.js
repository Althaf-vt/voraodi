const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session');
const { generate } = require('mongoose/lib/types/objectid');



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
        
    }
}


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
                res.render('forgotPass-otp')
                console.log('OTP : ',otp);
            }else{
                res.json({success:false, message :"Falied to send OTP, Please try again"});
            }
        }else{
            res.render('forgot-password',{
                message: "User with this email does not exist"
            });
        }

    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound');
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

        if(email){
            console.log(`Resended OTP : ${otp}`);

            res.status(200).json({success:true, message:"Resend OTP Successful"});
        }
    } catch (error) {
        console.error('Error in resend OTP',error);
        res.status(500).json({success:false,message: "Internal Server Error"});
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
            res.render('reset-password',{message:'Password do not match'})
        }
    } catch (error) {
        console.log(error);
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
}