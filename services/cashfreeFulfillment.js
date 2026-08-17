const Order = require('../models/orderSchema');
const PaymentIntent = require('../models/paymentIntentSchema');
const Address = require('../models/addressSchema');
const {
    fulfillNewOrderFromCart,
    fulfillCashfreeRetryOrder,
} = require('./orderFulfillment');

/**
 * Look up a specific address subdocument from a user's Address record.
 * Shared by new-cart and retry fulfillment flows.
 */
async function resolveAddress(userId, addressId, session) {
    const addressDoc = await Address.findOne({ userId }).session(session);
    if (!addressDoc) {
        throw Object.assign(new Error('Address not found'), { statusCode: 400 });
    }
    const selectedAddress = addressDoc.address.id(addressId);
    if (!selectedAddress) {
        throw Object.assign(new Error('Invalid address'), { statusCode: 400 });
    }
    return structuredClone(selectedAddress.toObject());
}

/**
 * Idempotent fulfillment after a Cashfree payment is confirmed PAID.
 * Safe to call from the return-URL verify endpoint AND from webhooks.
 *
 * @param {object} opts
 * @param {string} opts.cashfreePaymentId - cf_payment_id from Cashfree
 * @param {string} opts.cashfreeOrderId   - cf_order_id from Cashfree
 * @param {string} opts.userId            - App user ID (from order_tags or session)
 * @param {string} opts.addressId         - Address subdoc ID (from order_tags or session)
 * @param {string} opts.couponCode        - Coupon code (from order_tags, may be '')
 * @param {string|null} opts.appOrderId   - App orderId for retry flow, null for new cart
 * @param {object} opts.session           - Mongoose session (from withTransaction)
 */
async function fulfillCapturedPayment({
    cashfreePaymentId,
    cashfreeOrderId,
    userId,
    addressId,
    couponCode,
    appOrderId,
    session,
}) {
    if (!cashfreePaymentId || !cashfreeOrderId) {
        throw Object.assign(new Error('Missing Cashfree payment identifiers'), { statusCode: 400 });
    }

    // Guard 1: payment already fulfilled by this exact payment ID
    const existingByPayment = await Order.findOne({ cashfreePaymentId }).session(session);
    if (existingByPayment?.paymentStatus === 'Completed') {
        return {
            ok: true,
            orderId: existingByPayment.orderId,
            alreadyFulfilled: true,
        };
    }

    // Guard 2: a completed order already exists for this Cashfree order ID
    // (payment captured by webhook before return-URL hit, or vice-versa)
    const existingByCfOrder = await Order.findOne({
        cashfreeOrderId,
        paymentStatus: 'Completed',
    }).session(session);

    if (existingByCfOrder) {
        if (!existingByCfOrder.cashfreePaymentId) {
            existingByCfOrder.cashfreePaymentId = cashfreePaymentId;
            existingByCfOrder.paymentCapturedAt = existingByCfOrder.paymentCapturedAt || new Date();
            await existingByCfOrder.save({ session });
        }
        return {
            ok: true,
            orderId: existingByCfOrder.orderId,
            alreadyFulfilled: true,
        };
    }

    // Resolve the PaymentIntent for this Cashfree order
    const intent = await PaymentIntent.findOne({ cashfreeOrderId }).session(session);
    const retryOrderId = appOrderId || intent?.appOrderId;

    // --- Retry flow (payment was for an existing failed order) ---
    if (retryOrderId) {
        const orderQuery = { orderId: retryOrderId };
        if (userId) {
            orderQuery.userId = userId;
        }
        const order = await Order.findOne(orderQuery).session(session);
        if (!order) {
            throw Object.assign(new Error('Order not found for retry payment'), { statusCode: 404 });
        }

        const resolvedAddressId = addressId || intent?.addressId;
        let clonedAddress;

        // For retry, the order already has the snapshotted shipping address embedded.
        // resolvedAddressId is String(order._id) (a sentinel), not an address subdoc ID.
        if (order.address?.name) {
            clonedAddress = order.address.toObject
                ? order.address.toObject()
                : structuredClone(order.address);
        } else if (resolvedAddressId) {
            clonedAddress = await resolveAddress(
                order.userId.toString(),
                resolvedAddressId,
                session
            );
        } else {
            throw Object.assign(new Error('Order address missing for retry fulfillment'), {
                statusCode: 400,
            });
        }

        await fulfillCashfreeRetryOrder({
            order,
            couponCode: couponCode || intent?.couponCode || '',
            clonedAddress,
            cashfreePaymentId,
            cashfreeOrderId,
            session,
        });

        if (intent) {
            intent.status = 'fulfilled';
            intent.cashfreePaymentId = cashfreePaymentId;
            intent.fulfilledOrderId = order.orderId;
            await intent.save({ session });
        }

        return { ok: true, orderId: order.orderId, alreadyFulfilled: false };
    }

    // --- New cart flow ---
    const resolvedUserId = userId || intent?.userId;
    const resolvedAddressId = addressId || intent?.addressId;

    if (!resolvedUserId || !resolvedAddressId) {
        // If we have no context but intent says already fulfilled, return that
        if (intent?.status === 'fulfilled' && intent.fulfilledOrderId) {
            return {
                ok: true,
                orderId: intent.fulfilledOrderId,
                alreadyFulfilled: true,
            };
        }
        throw Object.assign(
            new Error('Missing checkout context for new order fulfillment'),
            { statusCode: 400 }
        );
    }

    const clonedAddress = await resolveAddress(resolvedUserId, resolvedAddressId, session);

    const orderId = await fulfillNewOrderFromCart({
        userId: resolvedUserId,
        paymentMethod: 'cashfree',
        couponCode: couponCode || intent?.couponCode || '',
        clonedAddress,
        cashfreePaymentId,
        cashfreeOrderId,
        session,
    });

    if (intent) {
        intent.status = 'fulfilled';
        intent.cashfreePaymentId = cashfreePaymentId;
        intent.fulfilledOrderId = orderId;
        await intent.save({ session });
    }

    return { ok: true, orderId, alreadyFulfilled: false };
}

/**
 * Upsert a PaymentIntent record keyed on cashfreeOrderId.
 * Called when creating a new Cashfree order (new cart or retry).
 */
async function upsertCashfreePaymentIntent({
    cashfreeOrderId,
    userId,
    addressId,
    couponCode,
    amountPaise,
    flow,
    appOrderId,
}) {
    return PaymentIntent.findOneAndUpdate(
        { cashfreeOrderId },
        {
            cashfreeOrderId,
            userId,
            addressId,
            couponCode: couponCode || '',
            amountPaise,
            flow: flow || 'new_cart',
            appOrderId: appOrderId || null,
            status: 'pending',
        },
        { upsert: true, new: true }
    );
}

module.exports = {
    fulfillCapturedPayment,
    upsertCashfreePaymentIntent,
};
