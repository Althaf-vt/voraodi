const Wallet = require('../models/walletSchema');

function sessionOpts(session) {
    return session ? { session } : {};
}

async function debitWallet(userId, amount, transaction, session = null) {
    if (amount <= 0) {
        return { ok: false, message: 'Invalid debit amount' };
    }

    const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        {
            $inc: { balance: -amount },
            $push: { transactions: transaction },
        },
        { new: true, ...sessionOpts(session) }
    );

    if (!wallet) {
        return { ok: false, message: 'Insufficient wallet balance' };
    }

    return { ok: true, wallet };
}

async function creditWallet(userId, amount, transaction, session = null) {
    if (amount <= 0) {
        return { ok: true, wallet: null, skipped: true };
    }

    const wallet = await Wallet.findOneAndUpdate(
        { userId },
        {
            $inc: { balance: amount },
            $push: { transactions: transaction },
        },
        { new: true, upsert: true, ...sessionOpts(session) }
    );

    return { ok: true, wallet };
}

module.exports = { debitWallet, creditWallet };
