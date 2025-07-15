
function emailSession (purpose,req){
    try {
        if(purpose === 'create'){
            req.session.emailSession = true;
        }else{
            req.session.emailSession = false;
        }
    } catch (error) {
        console.log('Error in email session',error);
    }
}

// Otp Session
function otpSession (purpose,req,otp,email){
    try {
        if(purpose==='delete'){
            delete req.session.userOtp;
            delete req.session.OtpSession;
            delete req.session.email;

        }else if(purpose === 'create'){
            req.session.userOtp = otp;
            req.session.email = email;
            req.session.OtpSession = true;
        }
    } catch (error) {
        console.log("Error in HnadleSession function",error);
    } 
}

function newEmailSession(purpose,req){
    if(purpose === 'create'){
        req.session.newEmailSession = true;
    }else{
        req.session.newEmailSession = false;
    }
}

// Delete chache
function deleteCache(res){
    // Prevent back navigation again
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

// module.exports={
//     otpSession,
//     deleteCache,
// }

module.exports = {
  otpSession,
  deleteCache,
  newEmailSession,
  emailSession,
};