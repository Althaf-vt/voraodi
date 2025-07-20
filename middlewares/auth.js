const User = require('../models/userSchema');



const userAuth = async (req, res, next) => {
    try {
        const userId = req.session.user || (req.user && req.user._id);

        if (!userId) {
            if (req.headers.accept.includes('application/json')) {
                // from fetch
                return res.status(401).json({ success: false, message: 'Please login to continue.' });
            } else {
                // Normal 
                return res.redirect('/signin');
            }
        }

        const userData = await User.findById(userId);

        if (userData && !userData.isBlocked) {
            // Optionally attach to req for easy access later
            req.currentUser = userData;
            next();
        } else {
            if (req.headers.accept.includes('application/json')) {
                return res.status(403).json({ success: false, message: 'Your account is blocked.' });
            } else {
                return res.redirect('/signin');
            }
        }

    } catch (error) {
        console.log('Error in user auth middleware:', error);
         if (req.headers.accept.includes('application/json')) {
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        } else {
            res.status(500).send('Internal Server Error');
        }
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
        console.log('Error in AdminAuth middleware',err);
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

