const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
     passReqToCallback: true   //  This makes `req` available in callback
},
async (req, accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {

            if (user.isBlocked) {
                return done(null, false, { message: 'User is blocked by admin' });
             }             
            return done(null, user);
        } else {
            // If state is "signin", but user not found → failure
            if (req.query.state === 'signin') {//use of passReq
                return done(null, false, { message: 'User not found. Please sign up first.' });
             }

            // Else it's signup
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
            });
            await user.save();
            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));

// serialize is for assigning user details to session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
   User.findById(id)
   .then(user =>{
    done(null,user)
   })
   .catch(err =>{
    done(err,null)
   })
});

module.exports = passport;