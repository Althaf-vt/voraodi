const mongoose = require('mongoose');
const {Schema} = mongoose;

const walletSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    balance: {
        type: Number,
        default: 0
    },
    transactions: [{
            type: {
                type: String,
                enum: ['credit', 'debit'],
                required: true
            },
            amount: {
                type: Number,
                required: true,
            },
            reason: {
                type: String,
                default: "Wallet transaction"
            },
            orderId: {
                type: String,
                ref: "Order",
                default: null
            },
            productId: {
                type: Schema.Types.ObjectId,
                ref: 'Product',
                default: null // used only for return
            },
            quantity: {
                type: Number,
                default: null // used only for return
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});


const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;