const PaymentEvent = require('../models/paymentEventSchema');
const { verifyCashfreeWebhookSignature } = require('../utils/cashfreeWebhook');
const { withTransaction } = require('../utils/withTransaction');
const { fulfillCapturedPayment } = require('../services/cashfreeFulfillment');

/**
 * Parse the raw webhook body (Buffer from express.raw()) into a JS object.
 */
function parseEventPayload(rawBody) {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    return JSON.parse(text);
}

/**
 * Extract a stable event ID from a Cashfree webhook payload.
 *
 * Cashfree webhook body shape (PAYMENT_SUCCESS):
 * {
 *   type:   'PAYMENT_SUCCESS',
 *   data: {
 *     payment: { cf_payment_id, payment_status, payment_amount, ... },
 *     order:   { order_id, order_amount, order_tags: { userId, addressId, couponCode, orderId } }
 *   }
 * }
 */
function extractEventId(event) {
    const cfPaymentId = event?.data?.payment?.cf_payment_id;
    const cfOrderId   = event?.data?.order?.order_id;
    // Build a deterministic ID; Cashfree doesn't send a top-level event.id
    return cfPaymentId
        ? `cf_${cfPaymentId}`
        : `cf_ord_${cfOrderId}_${event?.type || 'unknown'}_${Date.now()}`;
}

/**
 * Handle a PAYMENT_SUCCESS Cashfree webhook event.
 *
 * Called inside a Mongoose transaction by the main handler.
 */
async function handlePaymentSuccess(event, session) {
    const payment = event?.data?.payment || {};
    const order   = event?.data?.order   || {};
    const tags    = order?.order_tags    || {};

    const cashfreePaymentId = String(payment.cf_payment_id || '');
    const cashfreeOrderId   = String(order.order_id        || '');

    if (!cashfreePaymentId || !cashfreeOrderId) {
        throw Object.assign(
            new Error('Webhook payload missing cf_payment_id or order_id'),
            { statusCode: 400 }
        );
    }

    return fulfillCapturedPayment({
        cashfreePaymentId,
        cashfreeOrderId,
        userId:     tags.userId     || null,
        addressId:  tags.addressId  || null,
        couponCode: tags.couponCode || '',
        appOrderId: tags.orderId    || null,  // set for retry flow
        session,
    });
}

/**
 * POST /webhooks/cashfree
 *
 * server.js mounts the /webhooks router with express.raw(), so req.body
 * is a raw Buffer here — exactly what signature verification requires.
 */
const handleCashfreeWebhook = async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!verifyCashfreeWebhookSignature(req.body, signature, timestamp)) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    let event;
    try {
        event = parseEventPayload(req.body);
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    // Only process PAYMENT_SUCCESS; acknowledge everything else silently
    if (event?.type !== 'PAYMENT_SUCCESS') {
        return res.status(200).json({ success: true, status: 'ignored' });
    }

    const eventId = extractEventId(event);

    // Idempotency: insert before processing — unique index on eventId prevents duplicates
    try {
        await PaymentEvent.create({
            eventId,
            eventType: event.type,
            status: 'processed',
            payload: event,
        });
    } catch (createError) {
        if (createError.code === 11000) {
            return res.status(200).json({ success: true, status: 'duplicate_event' });
        }
        throw createError;
    }

    const cfPaymentId = event?.data?.payment?.cf_payment_id;
    const cfOrderId   = event?.data?.order?.order_id;

    try {
        const result = await withTransaction((session) => handlePaymentSuccess(event, session));

        await PaymentEvent.updateOne(
            { eventId },
            {
                cashfreePaymentId: String(cfPaymentId || ''),
                cashfreeOrderId:   String(cfOrderId   || ''),
                status: 'processed',
            }
        );

        return res.status(200).json({
            success: true,
            orderId: result.orderId,
            alreadyFulfilled: result.alreadyFulfilled,
        });
    } catch (error) {
        await PaymentEvent.updateOne(
            { eventId },
            { status: 'failed', errorMessage: error.message }
        );
        console.error('Cashfree webhook fulfillment error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { handleCashfreeWebhook };
