function orderBelongsToUser(order, userId) {
    if (!order || !userId) return false;
    return String(order.userId) === String(userId);
}

function assertOrderOwnership(order, userId) {
    if (!order) {
        return { ok: false, status: 404, message: 'Order not found' };
    }
    if (!orderBelongsToUser(order, userId)) {
        return { ok: false, status: 403, message: 'Access denied' };
    }
    return { ok: true };
}

module.exports = { orderBelongsToUser, assertOrderOwnership };
