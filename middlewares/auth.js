const User = require('../models/userSchema');



const userAuth = async (req, res, next) => {
    try {
        const userId = req.session.user || (req.user && req.user._id);

        if (!userId) {
            return res.redirect('/signin');
        }

        const userData = await User.findById(userId);

        if (userData && !userData.isBlocked) {
            // Optionally attach to req for easy access later
            req.currentUser = userData;
            next();
        } else {
            return res.redirect('/signin');
        }

    } catch (error) {
        console.log('Error in user auth middleware:', error);
        res.status(500).send('Internal Server Error');
    }
};



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

