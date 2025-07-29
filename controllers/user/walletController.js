const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const { router } = require('../../server');


const loadWallet = async(req,res)=>{
    try {
        const userId = req.session.user;

        const user = await User.findOne({_id:userId})

        const referralCode = user.referralCode;

        let wallet = await Wallet.findOne({userId: userId});

        if(!wallet){
             wallet = new Wallet({
                userId,
            });

            wallet.save();
        }

        const creditTxn = wallet.transactions.filter(txn => txn.type === 'credit');
        const debitTxn = wallet.transactions.filter(txn => txn.type === 'debit');

        const creditTotal = creditTxn.reduce((acc,txn)=> acc + txn.amount ,0);

        const debitTotal = debitTxn.reduce((acc,txn) => acc + txn.amount ,0);

        res.render('wallet',{
            user,
            wallet,
            creditTotal,
            debitTotal,
            referralCode,
            lastUpdated: wallet.transactions.length > 0 
                ? wallet.transactions[wallet.transactions.length - 1].createdAt : new Date(),
        });

    } catch (error) {
        console.log("Error in rendering waller", error);
        res.redirect('/pageNotFound');
    }
}

// check user has entered refer code
const userStatus = async(req,res)=>{
    try {
        const userId = req.session.user;

        if(!userId){
            return res.json({
                hasEnteredReferralCode: true, // Dont show refer code modal for guest
                isLoggedIn: false
            })
        }
        const user = await User.findById(userId);

        if(!user){
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            hasEnteredReferralCode: user.hasEnteredReferralCode || false,
            isLoggedIn: true,
            userId: user._id,
        })

    } catch (error) {
        console.error('Error fetching user status:', error);
        res.status(500).json({ 
            error: 'Server error',
            hasEnteredReferralCode: true // Don't show modal on error
        });
    }

}

const skipRefer = async(req,res)=>{
    try {
        const userId = req.session.user;

        if (userId) {
            await User.findByIdAndUpdate(userId, {
                hasEnteredReferralCode: true // Mark as completed so modal won't show again
            });
        }

        res.json({success:true});
    } catch (error) {
        console.error('Error skipping referral:', error);
        res.json({ success: false });
    }
}

const submitReferral = async(req,res)=>{
    try {
        const userId = req.session.user;

        const {code} = req.body;

        const user = await User.findOne({_id:userId})

        const referrer = await User.findOne({referralCode:code});

        if(!referrer){
            return res.status(400).json({success:false,message:'Invalid Refer Code'});
        }

        // Avoid self reffering 
        if(referrer._id.equals(userId)){
            return res.status(400).json({success:false,message:'You cannot refer yourself'})
        }

        if(referrer.referrals.includes(userId)){
            return res.status(400).json({success:false,message:'You already applies this refer code'});
        }

        const rewardToRefferer = 150
        const rewardToReferee = 100

        referrer.referrals.push(userId);

        const referrerWallet = await Wallet.findOne({userId: referrer._id});

        referrerWallet.balance += rewardToRefferer;

        referrerWallet.transactions.push({
            type:"credit",
            amount: rewardToRefferer,
            reason: 'Referral reward'
        })

        await referrerWallet.save();


        const refereeWallet = await Wallet.findOne({userId: userId});

        refereeWallet.balance = rewardToReferee;

        refereeWallet.transactions.push({
            type:"credit",
            amount: rewardToReferee,
            reason: "Referral reward"
        })

        await refereeWallet.save();

        user.hasEnteredReferralCode = true;

        user.save();
        

        return res.status(200).json({success:true,message:'Referral submitted successfully'})

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
module.exports = {
    loadWallet,
    submitReferral,
    userStatus,
    skipRefer
}