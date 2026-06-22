const Crypto = require('crypto');

function verifyWebhookSignature(rawBody, signature, secret) {
    if (!secret || !signature || !rawBody) {
        return false;
    }
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const expected = Crypto.createHmac('sha256', secret).update(body).digest('hex');
    try {
        return Crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}

function verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, signature) {
    const generated = Crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
    try {
        return Crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(signature));
    } catch {
        return false;
    }
}

module.exports = { verifyWebhookSignature, verifyCheckoutSignature };
