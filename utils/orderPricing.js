/**
 * Pricing conventions:
 * - item.price is the LINE TOTAL (unit sale price × qty, minus per-line coupon share) for completed orders.
 * - Legacy "Payment Failed" orders may store UNIT price in item.price; use getItemLineTotal() to normalize.
 */

function isLegacyFailedPaymentOrder(order) {
    return order.status === 'Payment Failed' || order.paymentStatus === 'Failed';
}

function getItemLineTotal(item, order) {
    if (isLegacyFailedPaymentOrder(order)) {
        return item.price * item.quantity;
    }
    return item.price;
}

function getActiveBillableItems(order) {
    return order.orderedItems.filter(
        (item) =>
            item.status !== 'Cancelled' &&
            item.status !== 'Returned' &&
            item.returnStatus !== 'Returned'
    );
}

function computeItemsSubtotal(order, items = null) {
    const list = items || getActiveBillableItems(order);
    return list.reduce((sum, item) => sum + getItemLineTotal(item, order), 0);
}

function computeOrderFinalAmount(order, items = null) {
    const active = items || getActiveBillableItems(order);
    if (active.length === 0) return 0;
    const subtotal = computeItemsSubtotal(order, active);
    return subtotal + (order.deliveryCharge || 0);
}

function shouldWalletRefund(order) {
    if (order.paymentMethod === 'cod') return false;
    return order.paymentStatus === 'Completed';
}

function getCancelItemRefundAmount(item, order) {
    if (!shouldWalletRefund(order)) return 0;
    return getItemLineTotal(item, order);
}

function getFullOrderCancelRefundAmount(order) {
    if (!shouldWalletRefund(order)) return 0;
    return computeOrderFinalAmount(order);
}

function getReturnItemRefundAmount(item, order) {
    if (!shouldWalletRefund(order)) return 0;
    return getItemLineTotal(item, order);
}

function getReturnOrderRefundAmount(order) {
    if (!shouldWalletRefund(order)) return 0;
    const active = order.orderedItems.filter(
        (item) =>
            item.status !== 'Cancelled' &&
            item.status !== 'Returned' &&
            item.returnStatus !== 'Returned'
    );
    return computeItemsSubtotal(order, active);
}

/**
 * Apply coupon discount evenly across lines when completing a failed-payment retry.
 */
function applyCouponToOrderLines(order, discount) {
    if (!discount || order.orderedItems.length === 0) return;

    const perItem = discount / order.orderedItems.length;
    for (const item of order.orderedItems) {
        const line = getItemLineTotal(item, order);
        item.price = Math.max(0, line - perItem);
    }
}

function finalizeOrderTotalsAfterCoupon(order, discount) {
    const subtotal = order.orderedItems.reduce((sum, item) => sum + item.price, 0);
    order.totalPrice = subtotal + (discount || 0);
    order.discount = discount || 0;
    order.finalAmount = subtotal + (order.deliveryCharge || 0);
}

function buildCartLineItems(cartItems, discount) {
    const count = cartItems.length;
    const perItem = count > 0 ? (discount || 0) / count : 0;

    return cartItems.map((item) => {
        const line = item.productId.salePrice * item.quantity;
        return {
            product: item.productId._id,
            quantity: item.quantity,
            price: Math.max(0, line - perItem),
            sku: item.sku,
            size: item.size,
            status: 'Pending',
        };
    });
}

module.exports = {
    isLegacyFailedPaymentOrder,
    getItemLineTotal,
    getActiveBillableItems,
    computeItemsSubtotal,
    computeOrderFinalAmount,
    shouldWalletRefund,
    getCancelItemRefundAmount,
    getFullOrderCancelRefundAmount,
    getReturnItemRefundAmount,
    getReturnOrderRefundAmount,
    applyCouponToOrderLines,
    finalizeOrderTotalsAfterCoupon,
    buildCartLineItems,
};
