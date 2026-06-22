const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentIntentSchema = new Schema({
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    addressId: {
        type: String,
        required: true,
    },
    couponCode: {
        type: String,
        default: '',
    },
    amountPaise: {
        type: Number,
        required: true,
    },
    flow: {
        type: String,
        enum: ['new_cart', 'retry'],
        default: 'new_cart',
    },
    appOrderId: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['pending', 'fulfilled', 'failed'],
        default: 'pending',
        index: true,
    },
    razorpayPaymentId: {
        type: String,
        default: null,
        sparse: true,
    },
    fulfilledOrderId: {
        type: String,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const PaymentIntent = mongoose.model('PaymentIntent', paymentIntentSchema);

module.exports = PaymentIntent;
