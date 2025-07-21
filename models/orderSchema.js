const mongoose = require("mongoose");
const {Schema} = mongoose;
const { v4: uuidv4 } = require('uuid');



const orderSchema = new Schema({
    orderId: {
        type: String,
        default:()=>uuidv4(),
        unique: true,
    },
    userId:{
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        size: {
            type: String,
            required: true
        },
        sku: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            required: true,
            enum: ['Pending','Processing','Shipped','Delivered','Cancelled','Return Request','Returned','Payment Failed']
        },
        returnStatus: {
            type: String,
            enum: [null, 'Requested','Returned','Rejected'],
            default: null
        },
        returnReason: {
            type: String,
            default: null
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        name :{type: String, required: true},
        country :{type: String, required: true},
        state :{type: String, required: true},
        city :{type: String, required: true},
        street :{type: String, required: true},
        pincode :{type: Number, required: true},
        phone :{type: String, required: true},
        altPhone :{type: String, required: false},
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending','Processing','Shipped','Delivered','Cancelled','Return Request','Returned','Payment Failed']
    },
    returnStatus: {
        type: String,
        enum: [null, 'Requested','Returned','Rejected'],
        default: null
    },
    returnReason: {
        type: String,
        default: null
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'],
        default: 'Pending'
    },
    deliveryCharge: {
        type: Number,
        default: 50,
    }
})


const Order = mongoose.model('Order',orderSchema);
module.exports = Order;