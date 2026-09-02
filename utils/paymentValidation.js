const ALLOWED_PAYMENT_METHODS = new Set(['cod', 'wallet', 'cashfree']);

function assertValidPaymentMethod(paymentMethod) {
    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
        throw Object.assign(new Error('Invalid payment method'), { statusCode: 400 });
    }
}

function assertCashfreeCredentials(paymentMethod, cashfreePaymentId, cashfreeOrderId) {
    if (paymentMethod === 'cashfree' && (!cashfreePaymentId || !cashfreeOrderId)) {
        throw Object.assign(new Error('Cashfree payment verification required'), {
            statusCode: 400,
        });
    }
}

module.exports = {
    ALLOWED_PAYMENT_METHODS,
    assertValidPaymentMethod,
    assertCashfreeCredentials,
};
