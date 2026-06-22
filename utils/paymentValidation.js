const ALLOWED_PAYMENT_METHODS = new Set(['cod', 'wallet', 'razorpay']);

function assertValidPaymentMethod(paymentMethod) {
    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
        throw Object.assign(new Error('Invalid payment method'), { statusCode: 400 });
    }
}

function assertRazorpayCredentials(paymentMethod, razorpayPaymentId, razorpayOrderId) {
    if (paymentMethod === 'razorpay' && (!razorpayPaymentId || !razorpayOrderId)) {
        throw Object.assign(new Error('Razorpay payment verification required'), {
            statusCode: 400,
        });
    }
}

module.exports = {
    ALLOWED_PAYMENT_METHODS,
    assertValidPaymentMethod,
    assertRazorpayCredentials,
};
