const User = require('../../models/userSchema');
const Coupon = require('../../models/couponSchema');


const getAllCoupons = async(req,res)=>{
    try {
        const coupons = await Coupon.find();
        return res.render('coupon-list',{coupons});
    } catch (error) {
        console.log("Error in loading Coupon list page",error);
        return res.redirect('/admin/pageError');
    }
}

const getAddCoupon = async(req,res)=>{
    try {
        return res.render('add-coupon');
    } catch (error) {
        console.log("Error in loading add Coupon",error);
        return res.redirect('/admin/pageError');
    }
}

const addCoupon = async(req,res)=>{
    try {
        const {
            name,
            code,
            amount,
            expireOn,
            minimumPrice,
            maxUsage,
            isPublic,
            hasRewardThreshold,
            rewardThreshold
        } = req.body;

        const existName = await Coupon.findOne({name:name.trim()});
        if(existName) return res.status(400).json({success:false,message:"Coupon with this already exist"});

        const existCode = await Coupon.findOne({code:code.trim().toUpperCase()});
        if(existCode) return res.status(400).json({success:false,message:'Coupon already exist'});
        
        if(amount < 0) return res.status(400).json({success:false,message:'Discount amount cannot be negative'});
        if(maxUsage<1) return res.status(400).json({success:false,message:'max Usage should be greater than zero'});

        if(minimumPrice < 100) return res.status(400).json({success:false,message:'Minimum price should be greater than 100'})

        const newCoupon = new Coupon({
            name,
            code,
            expireOn,
            amount,
            minimumPrice,
            isPublic,
            rewardThreshold,
            maxUsage,
        });

        await newCoupon.save();

        return res.status(200).json({success:true,message:'Coupon created successful'});
    } catch (error) {
        console.log("Error in Adding coupon",error);
        return res.status(500).json({success:false,message:"Internal Server Error"});
    }
}

const getEditCoupon = async(req,res)=>{
    try {
        const {id} = req.params;

        const coupon = await Coupon.findOne({_id:id});

        if(!coupon){
            return res.status(400).json({success:false,message:'Coupon not found'})
        }

        return res.status(200).json({success:true,coupon:coupon});

    } catch (error) {
        console.log("Error in getting edit coupon",error);
        return res.status(500).json({success:false,message:"Internal Server Error"});
    }
}

/*
Body :  {
  couponId: '687b7b4cccbd8e2c8d814a49',
  name: 'Hey Newbie',
  code: 'NEW500',
  expireOn: '2025-07-31',
  amount: '500',
  minimumPrice: '1000',
  maxUsage: '100',
  isPublic: true,
  rewardThreshold: '',
  hasRewardThreshold: false
}
*/

const editCoupon = async(req,res)=>{
    try {
        const {couponId, ...updates} = req.body;

        const coupon = await Coupon.findOne({_id:couponId});

        if(!coupon) return res.status(400).json({success:false,message:"Coupon not found"});

        let updated = false;

        for(let key in updates){

            // skip if field is not part of schema
            if(!(key in coupon.toObject())) continue;

            // take value from db
            const oldValue = coupon[key]?.toString();
            // take new value from updated
            const newValue = updates[key]?.toString();

            if(newValue !== undefined && oldValue !== newValue){
                coupon[key] = updates[key];
                updated = true;
            }
        }

        if(!updated) return res.status(400).json({success:false, message:'No changed detected'});

        await coupon.save();

        return res.status(200).json({success:true,message:'Coupon updated successful'});
    
    } catch (error) {
        console.log("Error in Update coupon",error);
        return res.status(500).json({success:false,message:'Internal Server Error'});
    }
}



module.exports = {
    getAllCoupons,
    getAddCoupon,
    addCoupon,
    getEditCoupon,
    editCoupon,
}