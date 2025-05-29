const { generate } = require('mongoose/lib/types/objectid');
const env = require('dotenv').config();
const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const pageNotFound = async (req,res) =>{
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}


const loadHomepage = async (req,res) =>{
    try {
        return res.render("home")
    } catch (error) {
        console.log("Home page not found");
        res.status(500).send('Server error');
    }
}

const loadSignup = async (req,res) =>{
    try {
        return res.render('signup')
    } catch (error) {
        console.log("Signup page not loading",error);
        res.status(500).send('Server Error');
    }
}

// OTP generation
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


const signup = async (req,res) =>{
    try {
        const {name,phone,email,password,cPassword} = req.body;
        if(password !== cPassword){
            return res.render('signup',{message: "Password do not match"});
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render('signup',{message: "User with this email already exists"})
        }

        const otp = generateOtp();

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
        
    }
}

const otpVerification = async (req,res) =>{
    try {
        
        const {otp} = req.body;
        const userOtp = req.session.userOtp;
        console.log(otp);

        console.log(`session otp ${userOtp}`)
        

        if(otp===userOtp){
            const user= req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User ({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            })

            await saveUserData.save();

            req.session.user = saveUserData._id;

            return res.json({success: true, redirectUrl: '/'})
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

const loadSignin = async (req,res) =>{
    try {
        return res.render('signin')
    } catch (error) {
        console.log("Signin page not loading",error);
        res.status(500).send('Server Error');
    }
}

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadSignin,
    signup,
    otpVerification,
    resendOtp
    // loadOtp
}