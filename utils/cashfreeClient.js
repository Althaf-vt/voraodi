const { Cashfree } = require('cashfree-pg');

/**
 * Returns a configured Cashfree SDK instance (cashfree-pg v6).
 *
 * cashfree-pg v6 uses an instance-based API:
 *   new Cashfree(env, clientId, clientSecret)
 * Instance methods: PGCreateOrder, PGFetchOrder,
 *   PGVerifyWebhookSignature, PGSimulatePayment, etc.
 *
 * CASHFREE_ENV in .env should be 'SANDBOX' or 'PRODUCTION'.
 * For this project it is always 'SANDBOX'.
 *
 * The returned instance is safe to share across requests.
 * Call getCashfreeInstance() once and cache the result, or
 * call it per-request — both are fine (constructor is cheap).
 */
function getCashfreeInstance() {
    const env = process.env.CASHFREE_ENV === 'PRODUCTION'
        ? Cashfree.PRODUCTION
        : Cashfree.SANDBOX;

    return new Cashfree(
        env,
        process.env.CASHFREE_CLIENT_ID,
        process.env.CASHFREE_CLIENT_SECRET
    );
}

module.exports = { getCashfreeInstance };
