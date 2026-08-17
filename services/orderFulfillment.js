const Order = require('../models/orderSchema');
const Cart = require('../models/cartSchema');
const Coupon = require('../models/couponSchema');
const { debitWallet } = require('../utils/walletOps');
const { deductOrderItemsStock } = require('../utils/stockOps');
const {
    applyCouponToOrderLines,
    finalizeOrderTotalsAfterCoupon,
    buildCartLineItems,
    getItemLineTotal,
} = require('../utils/orderPricing');
const {
    assertValidPaymentMethod,
    assertCashfreeCredentials,
} = require('../utils/paymentValidation');

async function validateAndApplyCoupon(couponCode, userId, subtotal, session) {
    if (!couponCode) {
        return { discount: 0, couponApplied: false, coupon: null };
    }

    const coupon = await Coupon.findOne({ code: couponCode, isListed: true }).session(session);
    if (!coupon) {
        throw Object.assign(new Error('Invalid or inactive coupon'), { statusCode: 400 });
    }

    const now = new Date();
    if (coupon.expireOn < now) {
        throw Object.assign(new Error('Coupon has expired'), { statusCode: 400 });
    }
    if (coupon.usedBy.includes(userId)) {
        throw Object.assign(new Error('You have already used this coupon'), { statusCode: 400 });
    }
    if (subtotal < coupon.minimumPrice) {
        throw Object.assign(new Error(
            `Minimum order amount ₹${coupon.minimumPrice} required to use this coupon`
        ), { statusCode: 400 });
    }

    coupon.usedBy.push(userId);
    await coupon.save({ session });

    return { discount: coupon.amount, couponApplied: true, coupon };
}

async function fulfillRetryOrder({
    order,
    userId,
    paymentMethod,
    couponCode,
    clonedAddress,
    session,
}) {
    assertValidPaymentMethod(paymentMethod);

    if (order.paymentStatus === 'Completed') {
        throw Object.assign(new Error('Order already paid'), { statusCode: 400 });
    }

    let discount = 0;
    let couponApplied = false;

    if (couponCode) {
        const subtotalForCoupon = order.orderedItems.reduce(
            (sum, item) => sum + getItemLineTotal(item, order),
            0
        );
        const applied = await validateAndApplyCoupon(
            couponCode,
            userId,
            subtotalForCoupon,
            session
        );
        discount = applied.discount;
        couponApplied = applied.couponApplied;
    }

    applyCouponToOrderLines(order, discount);
    for (const item of order.orderedItems) {
        item.status = 'Pending';
    }
    finalizeOrderTotalsAfterCoupon(order, discount);

    order.couponApplied = couponApplied;
    order.status = 'Pending';
    order.paymentStatus = paymentMethod === 'cod' ? 'Pending' : 'Completed';
    order.paymentMethod = paymentMethod;
    order.address = clonedAddress;

    const stockResult = await deductOrderItemsStock(order.orderedItems, session);
    if (!stockResult.ok) {
        throw Object.assign(new Error(stockResult.message), { statusCode: 400 });
    }

    if (paymentMethod === 'wallet') {
        const debit = await debitWallet(
            userId,
            order.finalAmount,
            {
                type: 'debit',
                amount: order.finalAmount,
                reason: 'Wallet payment',
                orderId: order.orderId,
            },
            session
        );
        if (!debit.ok) {
            throw Object.assign(new Error(debit.message), { statusCode: 400 });
        }
    }

    await order.save({ session });
    return order.orderId;
}

async function fulfillNewOrderFromCart({
    userId,
    paymentMethod,
    couponCode,
    clonedAddress,
    cashfreePaymentId,
    cashfreeOrderId,
    session,
}) {
    assertValidPaymentMethod(paymentMethod);
    assertCashfreeCredentials(paymentMethod, cashfreePaymentId, cashfreeOrderId);

    // Idempotency guard for Cashfree
    if (paymentMethod === 'cashfree' && cashfreePaymentId) {
        const existing = await Order.findOne({ cashfreePaymentId }).session(session);
        if (existing?.paymentStatus === 'Completed') {
            return existing.orderId;
        }
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId').session(session);
    if (!cart || cart.items.length === 0) {
        throw Object.assign(new Error('Cart is empty'), { statusCode: 400 });
    }

    for (const item of cart.items) {
        if (item.productId) {
            item.price = item.productId.salePrice;
            item.totalPrice = item.productId.salePrice * item.quantity;
        }
    }
    await cart.save({ session });

    const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

    let discount = 0;
    let couponApplied = false;
    if (couponCode) {
        const applied = await validateAndApplyCoupon(couponCode, userId, totalPrice, session);
        discount = applied.discount;
        couponApplied = applied.couponApplied;
    }

    const orderedItems = buildCartLineItems(cart.items, discount);
    const recalculatedTotal = orderedItems.reduce((sum, item) => sum + item.price, 0);

    if (paymentMethod === 'cod' && recalculatedTotal > 2000) {
        throw Object.assign(new Error('COD is not available for orders above ₹2000.'), {
            statusCode: 400,
        });
    }

    const deliveryCharge = totalPrice >= 3000 ? 0 : 50;
    const finalAmount = recalculatedTotal + deliveryCharge;
    const paymentStatus = paymentMethod === 'cod' ? 'Pending' : 'Completed';

    const orderData = {
        orderedItems,
        totalPrice,
        discount,
        finalAmount,
        address: clonedAddress,
        invoiceDate: new Date(),
        status: 'Pending',
        couponApplied,
        paymentMethod,
        paymentStatus,
        userId,
        deliveryCharge,
    };

    // Gateway-specific payment ID fields
    if (paymentMethod === 'cashfree') {
        orderData.cashfreePaymentId = cashfreePaymentId;
        orderData.cashfreeOrderId = cashfreeOrderId;
        orderData.paymentCapturedAt = new Date();
    }

    const newOrder = new Order(orderData);
    await newOrder.save({ session });

    const stockResult = await deductOrderItemsStock(orderedItems, session);
    if (!stockResult.ok) {
        throw Object.assign(new Error(stockResult.message), { statusCode: 400 });
    }

    if (paymentMethod === 'wallet') {
        const debit = await debitWallet(
            userId,
            finalAmount,
            {
                type: 'debit',
                amount: finalAmount,
                reason: 'Wallet payment',
                orderId: newOrder.orderId,
            },
            session
        );
        if (!debit.ok) {
            throw Object.assign(new Error(debit.message), { statusCode: 400 });
        }
    }

    cart.items = [];
    await cart.save({ session });

    return newOrder.orderId;
}

/**
 * Fulfill a Cashfree retry payment on an existing Payment Failed order.
 */
async function fulfillCashfreeRetryOrder({
    order,
    couponCode,
    clonedAddress,
    cashfreePaymentId,
    cashfreeOrderId,
    session,
}) {
    if (order.paymentStatus === 'Completed') {
        if (order.cashfreePaymentId === cashfreePaymentId) {
            return;
        }
        throw Object.assign(new Error('Order already paid'), { statusCode: 400 });
    }

    const paymentTaken = await Order.findOne({ cashfreePaymentId }).session(session);
    if (paymentTaken && paymentTaken.orderId !== order.orderId) {
        throw Object.assign(new Error('Payment already used for another order'), { statusCode: 409 });
    }

    let discount = 0;
    let couponApplied = false;

    if (couponCode) {
        const subtotalForCoupon = order.orderedItems.reduce(
            (sum, item) => sum + getItemLineTotal(item, order),
            0
        );
        const applied = await validateAndApplyCoupon(
            couponCode,
            order.userId,
            subtotalForCoupon,
            session
        );
        discount = applied.discount;
        couponApplied = applied.couponApplied;
    }

    applyCouponToOrderLines(order, discount);
    for (const item of order.orderedItems) {
        item.status = 'Pending';
    }
    finalizeOrderTotalsAfterCoupon(order, discount);

    order.address = clonedAddress;
    order.couponApplied = couponApplied;
    order.paymentStatus = 'Completed';
    order.status = 'Pending';
    order.paymentMethod = 'cashfree';
    order.cashfreePaymentId = cashfreePaymentId;
    order.cashfreeOrderId = cashfreeOrderId || order.cashfreeOrderId;
    order.paymentCapturedAt = new Date();

    const stockResult = await deductOrderItemsStock(order.orderedItems, session);
    if (!stockResult.ok) {
        throw Object.assign(new Error(stockResult.message), { statusCode: 400 });
    }

    await order.save({ session });
}

module.exports = {
    fulfillRetryOrder,
    fulfillNewOrderFromCart,
    fulfillCashfreeRetryOrder,
    validateAndApplyCoupon,
};
