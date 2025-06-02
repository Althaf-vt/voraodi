const User = require('../models/userSchema');



const userAuth = (req,res,next) =>{
    if(req.session.user){
        User.findById(req.session.user)
        .then (data =>{
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect('/signin');
                
            }
        })
        .catch(error =>{
            console.log('Error in user auth middleware',error);
            res.status(500).send('Internal Server Error');
        })
    }else{
        res.redirect('/signin');
       
    }
}


// const adminAuth = (req,res,next) =>{
//     if(req.session.admin){

//     }
//     User.findOne({isAdmin:true})
//     .then(data =>{
//         if(data){
//             next()
//         }else{
//             res.redirect('/admin/signin')
         
//         }
//     })
//     .catch(error =>{
//         console.log('Error in AdminAuth middleware',error);
//         res.status(500).send("Inter Server Error");
//     })
// }

const adminAuth = (req,res,next) =>{
    if(req.session.admin){
        User.findOne({isAdmin:true})
        .then(data=>{
            if(data){
                next()
            }else{
                res.redirect('/admin/signin')
            }

        })
        .catch(err=>{
        console.log('Error in AdminAuth middleware',error);
        res.status(500).send("Inter Server Error");
        })
    }else{
       res.redirect('/admin/signin');
    }
}

module.exports = {
    userAuth,
    adminAuth
}

