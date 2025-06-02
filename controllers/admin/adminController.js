const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');




const loadAdminLogin = async (req, res) => {
console.log("hello")
    if (req.session.admin) {
        return res.redirect('/admin/');
    }
    res.render('adminSignin', { message: null })
}

const login = async(req,res)=>{
    try {
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
        if(admin){
            const passwordMatch = bcrypt.compare(password,admin.password);
            if(passwordMatch){
                req.session.admin = true;
                return res.redirect('/admin')
            }else{
                return res.redirect('/login');
            }
        }else{
            return res.redirect('/login');
        }
    } catch (error) {
        console.log('login error',error);
        return res.redirect('/pageError');
        
    }
}

const loadDashboard = async (req,res) =>{
    if(req.session.admin){
        try {
            return res.render('dashboard');
        } catch (error) {
            return res.redirect('/pageError');
        }
    }
}

const logout = async (req,res) =>{
    try {
        req.session.destroy(err =>{
            if(err){
                console.log('Error destroying session',err);
                return res.redirect('/pageError'); 
            }
            res.redirect('/admin/signin');
        })
    } catch (error) {
        console.log('unexpected error during logout', error);
        res.redirect('/pageError')
    }
}


const pageError = async (req,res) =>{
    res.render ('admin-error')
}
module.exports = {
    loadAdminLogin,
    login,
    loadDashboard,
    pageError,
    logout
}
