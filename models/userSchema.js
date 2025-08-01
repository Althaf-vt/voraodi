const mongoose = require('mongoose');
const {Schema} = mongoose;


const userSchema = new Schema({
    image: {
        type: String,
        required: false
    },
    name: {
        type:String,
        required : true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null
    },
    googleId: {
       type: String,
       unique: true,
       sparse: true
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart",
    }],
    wallet: {
        type: Number,
        default: 0,
    },
    wishlist: [{
        type: Schema.Types.ObjectId,
        ref: "Wishlist"
    }],
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {
        type: Date,
        default: Date.now,
    },
    referralCode: {
        type: String,
        default: false
    },
    referrals:[{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    hasEnteredReferralCode: {
        type : Boolean,
        default: false
    },
    redeemed: {
        type: Boolean,
        // required: true
    },
    redeemedUsers: [{
         type: Schema.Types.ObjectId,
         ref: "User",
         // required: true
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category",
        },
        brand: {
            Type: String
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
})




const User = mongoose.model("User",userSchema);
module.exports = User;