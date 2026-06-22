const Order = require('../models/orderSchema');
const PaymentIntent = require('../models/paymentIntentSchema');
const Address = require('../models/addressSchema');
const {
    fulfillNewOrderFromCart,
    fulfillRazorpayRetryOrder,
} = require('./orderFulfillment');

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
 * Idempotent fulfillment after Razorpay capture.
 * Safe to call from checkout verify, place-order, and webhooks.
 */
async function fulfillCapturedPayment({
    razorpayPaymentId,
    razorpayOrderId,
    userId,
    addressId,
    couponCode,
    appOrderId,
    session,
}) {
    if (!razorpayPaymentId || !razorpayOrderId) {
        throw Object.assign(new Error('Missing Razorpay payment identifiers'), { statusCode: 400 });
    }

    const existingByPayment = await Order.findOne({ razorpayPaymentId }).session(session);
    if (existingByPayment?.paymentStatus === 'Completed') {
        return {
            ok: true,
            orderId: existingByPayment.orderId,
            alreadyFulfilled: true,
        };
    }

    const existingByRpOrder = await Order.findOne({
        razorpayOrderId,
        paymentStatus: 'Completed',
    }).session(session);

    if (existingByRpOrder) {
        if (!existingByRpOrder.razorpayPaymentId) {
            existingByRpOrder.razorpayPaymentId = razorpayPaymentId;
            existingByRpOrder.paymentCapturedAt = existingByRpOrder.paymentCapturedAt || new Date();
            await existingByRpOrder.save({ session });
        }
        return {
            ok: true,
            orderId: existingByRpOrder.orderId,
            alreadyFulfilled: true,
        };
    }

    const intent = await PaymentIntent.findOne({ razorpayOrderId }).session(session);
    const retryOrderId = appOrderId || intent?.appOrderId;

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
        // For retry flow the order already carries the snapshotted shipping address.
        // resolvedAddressId holds String(order._id) (a non-empty sentinel) — not an
        // address subdoc ID — so we always use the embedded order.address for retries.
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

        await fulfillRazorpayRetryOrder({
            order,
            couponCode: couponCode || intent?.couponCode || '',
            clonedAddress,
            razorpayPaymentId,
            razorpayOrderId,
            session,
        });

        if (intent) {
            intent.status = 'fulfilled';
            intent.razorpayPaymentId = razorpayPaymentId;
            intent.fulfilledOrderId = order.orderId;
            await intent.save({ session });
        }

        return { ok: true, orderId: order.orderId, alreadyFulfilled: false };
    }

    if (!userId || !addressId) {
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

    const resolvedUserId = userId || intent.userId;
    const resolvedAddressId = addressId || intent.addressId;
    const clonedAddress = await resolveAddress(resolvedUserId, resolvedAddressId, session);

    const orderId = await fulfillNewOrderFromCart({
        userId: resolvedUserId,
        paymentMethod: 'razorpay',
        couponCode: couponCode || intent?.couponCode || '',
        clonedAddress,
        razorpayPaymentId,
        razorpayOrderId,
        session,
    });

    if (intent) {
        intent.status = 'fulfilled';
        intent.razorpayPaymentId = razorpayPaymentId;
        intent.fulfilledOrderId = orderId;
        await intent.save({ session });
    }

    return { ok: true, orderId, alreadyFulfilled: false };
}

async function upsertPaymentIntent({
    razorpayOrderId,
    userId,
    addressId,
    couponCode,
    amountPaise,
    flow,
    appOrderId,
}) {
    return PaymentIntent.findOneAndUpdate(
        { razorpayOrderId },
        {
            razorpayOrderId,
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
    upsertPaymentIntent,
    resolveAddress,
};
