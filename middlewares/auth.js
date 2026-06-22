const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
    try {
        const userId = req.session.user || (req.user && req.user._id);

        if (!userId) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(401).json({ success: false, message: 'Please login to continue.' });
            }
            return res.redirect('/signin');
        }

        const userData = await User.findById(userId);

        if (userData && !userData.isBlocked) {
            req.currentUser = userData;
            next();
        } else {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(403).json({ success: false, message: 'Your account is blocked.' });
            }
            return res.redirect('/signin');
        }
    } catch (error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        } else {
            res.status(500).send('Internal Server Error');
        }
    }
};

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/signin');
        }

        const admin = await User.findOne({ _id: req.session.admin, isAdmin: true });

        if (!admin) {
            req.session.admin = null;
            return res.redirect('/admin/signin');
        }

        req.adminUser = admin;
        next();
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
};

module.exports = { userAuth, adminAuth };
