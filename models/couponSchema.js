const mongoose = require('mongoose');
const {Schema} = mongoose;

const couponSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    code:{
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    expireOn: {
        type: Date,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    minimumPrice: { // cart value
        type: Number,
        required: true
    },
    isPublic: {
    type: Boolean,
    default: false  // if true, show to all users
    },
    rewardThreshold: {  //Does user need to shop above X to get it
    type: Number,
    default: 0  // 0 means no condition
    },
    usedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    givenTo: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
    }],
    isListed: {
        type: Boolean,
        default: true
    },
    maxUsage:{
        type: Number,
        required: true
    }
})

const Coupon = mongoose.model('Coupon',couponSchema);
module.exports = Coupon;