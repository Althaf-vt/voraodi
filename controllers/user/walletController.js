const User = require('../../models/userSchema');
const { creditWallet } = require('../../utils/walletOps');
const { withTransaction } = require('../../utils/withTransaction');

const loadWallet = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId });
            await wallet.save();
        }

        const creditTxn = wallet.transactions.filter((txn) => txn.type === 'credit');
        const debitTxn = wallet.transactions.filter((txn) => txn.type === 'debit');
        const creditTotal = creditTxn.reduce((acc, txn) => acc + txn.amount, 0);
        const debitTotal = debitTxn.reduce((acc, txn) => acc + txn.amount, 0);

        res.render('wallet', {
            user,
            wallet,
            creditTotal,
            debitTotal,
            referralCode: user.referralCode,
            lastUpdated:
                wallet.transactions.length > 0
                    ? wallet.transactions[wallet.transactions.length - 1].createdAt
                    : new Date(),
        });
    } catch (error) {
        next(error);
    }
};

const userStatus = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ hasEnteredReferralCode: true, isLoggedIn: false });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            hasEnteredReferralCode: user.hasEnteredReferralCode || false,
            isLoggedIn: true,
            userId: user._id,
        });
    } catch (error) {
        console.error('Error fetching user status:', error);
        res.status(500).json({ error: 'Server error', hasEnteredReferralCode: true });
    }
};

const skipRefer = async (req, res) => {
    try {
        const userId = req.session.user;
        if (userId) {
            await User.findByIdAndUpdate(userId, { hasEnteredReferralCode: true });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error skipping referral:', error);
        res.json({ success: false });
    }
};

const submitReferral = async (req, res) => {
    try {
        const userId = req.session.user;
        const { code } = req.body;

        const rewardToRefferer = 150;
        const rewardToReferee = 100;

        await withTransaction(async (session) => {
            const user = await User.findOne({ _id: userId }).session(session);
            if (!user) {
                throw Object.assign(new Error('User not found'), { statusCode: 404 });
            }
            if (user.hasEnteredReferralCode) {
                throw Object.assign(new Error('Referral code already submitted'), { statusCode: 400 });
            }

            const referrer = await User.findOne({ referralCode: code }).session(session);
            if (!referrer) {
                throw Object.assign(new Error('Invalid Refer Code'), { statusCode: 400 });
            }
            if (referrer._id.equals(userId)) {
                throw Object.assign(new Error('You cannot refer yourself'), { statusCode: 400 });
            }
            if (referrer.referrals.some((id) => id.equals(userId))) {
                throw Object.assign(new Error('You already applies this refer code'), {
                    statusCode: 400,
                });
            }

            referrer.referrals.push(userId);
            await referrer.save({ session });

            const referrerCredit = await creditWallet(
                referrer._id,
                rewardToRefferer,
                {
                    type: 'credit',
                    amount: rewardToRefferer,
                    reason: 'Referral reward',
                },
                session
            );
            if (!referrerCredit.ok) {
                throw Object.assign(new Error('Failed to credit referrer wallet'), { statusCode: 500 });
            }

            const refereeCredit = await creditWallet(
                userId,
                rewardToReferee,
                {
                    type: 'credit',
                    amount: rewardToReferee,
                    reason: 'Referral reward',
                },
                session
            );
            if (!refereeCredit.ok) {
                throw Object.assign(new Error('Failed to credit referee wallet'), { statusCode: 500 });
            }

            user.hasEnteredReferralCode = true;
            await user.save({ session });
        });

        return res.status(200).json({ success: true, message: 'Referral submitted successfully' });
    } catch (error) {
        console.error(error);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};

module.exports = { loadWallet, submitReferral, userStatus, skipRefer };
