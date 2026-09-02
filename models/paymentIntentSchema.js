const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentIntentSchema = new Schema({
    // Cashfree gateway
    cashfreeOrderId: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
    },
    cashfreePaymentId: {
        type: String,
        default: null,
        sparse: true,
    },

    // Common fields
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
    fulfilledOrderId: {
        type: String,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Validate that the gateway order ID is set
paymentIntentSchema.pre('save', function (next) {
    if (!this.cashfreeOrderId) {
        return next(new Error('PaymentIntent requires a cashfreeOrderId'));
    }
    next();
});

const PaymentIntent = mongoose.model('PaymentIntent', paymentIntentSchema);

module.exports = PaymentIntent;
