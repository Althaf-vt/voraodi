const PaymentEvent = require('../models/paymentEventSchema');
const { verifyWebhookSignature } = require('../utils/razorpayWebhook');
const { withTransaction } = require('../utils/withTransaction');
const { fulfillCapturedPayment } = require('../services/razorpayFulfillment');

function parseEventPayload(rawBody) {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    return JSON.parse(text);
}

function extractPaymentEntity(event) {
    const payment = event?.payload?.payment?.entity;
    if (!payment?.id) {
        return null;
    }
    return payment;
}

async function handlePaymentCaptured(payment, session) {
    const razorpayPaymentId = payment.id;
    const razorpayOrderId = payment.order_id;
    const notes = payment.notes || {};

    const result = await fulfillCapturedPayment({
        razorpayPaymentId,
        razorpayOrderId,
        userId: notes.userId || null,
        addressId: notes.addressId || null,
        couponCode: notes.couponCode || '',
        appOrderId: notes.orderId || null,
        session,
    });

    return result;
}

const handleRazorpayWebhook = async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
        return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    let event;
    try {
        event = parseEventPayload(req.body);
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    const eventId = event.id || `${event.event}_${extractPaymentEntity(event)?.id || Date.now()}`;

    try {
        await PaymentEvent.create({
            eventId,
            eventType: event.event,
            status: 'processed',
            payload: event,
        });
    } catch (createError) {
        if (createError.code === 11000) {
            return res.status(200).json({ success: true, status: 'duplicate_event' });
        }
        throw createError;
    }

    const payment = extractPaymentEntity(event);

    if (event.event === 'payment.captured' && payment) {
        try {
            const result = await withTransaction((session) => handlePaymentCaptured(payment, session));
            await PaymentEvent.updateOne(
                { eventId },
                {
                    razorpayPaymentId: payment.id,
                    razorpayOrderId: payment.order_id,
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
            console.error('Webhook fulfillment error:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    await PaymentEvent.updateOne({ eventId }, { status: 'ignored' });
    return res.status(200).json({ success: true, status: 'ignored' });
};

module.exports = { handleRazorpayWebhook };
