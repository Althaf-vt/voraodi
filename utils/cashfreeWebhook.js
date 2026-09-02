const Crypto = require('crypto');

/**
 * Verifies a Cashfree webhook signature.
 *
 * Cashfree signs webhooks as:
 *   HMAC-SHA256( timestamp + rawBody, clientSecret ) → base64
 *
 * Headers sent by Cashfree:
 *   x-webhook-signature   — the base64-encoded HMAC
 *   x-webhook-timestamp   — Unix epoch seconds (string)
 *
 * @param {Buffer|string} rawBody      - Unmodified request body
 * @param {string}        signature    - Value of x-webhook-signature header
 * @param {string}        timestamp    - Value of x-webhook-timestamp header
 * @returns {boolean}
 */
function verifyCashfreeWebhookSignature(rawBody, signature, timestamp) {
    if (!signature || !timestamp || !rawBody) {
        return false;
    }

    const secret = process.env.CASHFREE_CLIENT_SECRET;
    if (!secret) {
        console.error('CASHFREE_CLIENT_SECRET is not set — cannot verify webhook');
        return false;
    }

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const signatureData = timestamp + body;

    const expected = Crypto
        .createHmac('sha256', secret)
        .update(signatureData)
        .digest('base64');

    try {
        // timingSafeEqual requires equal-length Buffers
        return Crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(signature)
        );
    } catch {
        return false;
    }
}

module.exports = { verifyCashfreeWebhookSignature };
