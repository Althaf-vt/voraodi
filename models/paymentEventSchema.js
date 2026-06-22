const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentEventSchema = new Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
    },
    eventType: {
        type: String,
        required: true,
    },
    razorpayPaymentId: {
        type: String,
        default: null,
        index: true,
    },
    razorpayOrderId: {
        type: String,
        default: null,
        index: true,
    },
    status: {
        type: String,
        enum: ['processed', 'ignored', 'failed', 'duplicate'],
        default: 'processed',
    },
    errorMessage: {
        type: String,
        default: null,
    },
    payload: {
        type: Schema.Types.Mixed,
    },
    processedAt: {
        type: Date,
        default: Date.now,
    },
});

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);

module.exports = PaymentEvent;
