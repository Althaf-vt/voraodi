const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const { assertOrderOwnership } = require('../../utils/orderAuth');
const { creditWallet } = require('../../utils/walletOps');
const { incrementVariantStock } = require('../../utils/stockOps');
const { withTransaction } = require('../../utils/withTransaction');
const {
    getCancelItemRefundAmount,
    getFullOrderCancelRefundAmount,
    computeOrderFinalAmount,
    getActiveBillableItems,
} = require('../../utils/orderPricing');

const orderDetailpage = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user;

        const user = await User.findOne({ _id: userId });
        if (!user) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        const order = await Order.findOne({ orderId, userId }).populate('orderedItems.product');
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            const err = new Error(ownership.message);
            err.statusCode = ownership.status;
            throw err;
        }

        return res.render('orderDetails', { order, user, message: null });
    } catch (error) {
        next(error);
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, sku } = req.body;
        const userId = req.session.user;

        await withTransaction(async (session) => {
            const findOrder = await Order.findOne({ orderId, userId }).session(session);
            const ownership = assertOrderOwnership(findOrder, userId);
            if (!ownership.ok) {
                throw Object.assign(new Error(ownership.message), { statusCode: ownership.status });
            }

            const item = findOrder.orderedItems.find((i) => i.sku === sku);
            if (!item) {
                throw Object.assign(new Error('Item with SKU not found in ordered items'), {
                    statusCode: 500,
                });
            }
            if (item.status === 'Cancelled') {
                throw Object.assign(new Error('Item already cancelled'), { statusCode: 400 });
            }

            const refundAmount = getCancelItemRefundAmount(item, findOrder);
            item.status = 'Cancelled';

            const restocked = await incrementVariantStock(
                item.product,
                sku,
                item.size,
                item.quantity,
                session
            );
            if (!restocked) {
                throw Object.assign(new Error('Product variant not found'), { statusCode: 500 });
            }

            if (refundAmount > 0) {
                const credit = await creditWallet(
                    userId,
                    refundAmount,
                    {
                        type: 'credit',
                        amount: refundAmount,
                        reason: 'Refund for Cancel Item',
                        orderId,
                        productId: item.product,
                        quantity: item.quantity,
                    },
                    session
                );
                if (!credit.ok) {
                    throw Object.assign(new Error(credit.message || 'Refund failed'), {
                        statusCode: 500,
                    });
                }
            }

            const allCancelled = findOrder.orderedItems.every((i) => i.status === 'Cancelled');
            if (allCancelled) {
                findOrder.status = 'Cancelled';
            }

            findOrder.finalAmount = computeOrderFinalAmount(findOrder);
            await findOrder.save({ session });
        });

        return res.status(200).json({ success: true, message: 'Item cancelled successfully' });
    } catch (error) {
        console.error(' Error cancelling item:', error);
        const status = error.statusCode || 400;
        return res.status(status).json({
            success: false,
            message: error.message || 'Internal server error',
        });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user;

        await withTransaction(async (session) => {
            const order = await Order.findOne({ orderId, userId }).session(session);
            const ownership = assertOrderOwnership(order, userId);
            if (!ownership.ok) {
                throw Object.assign(new Error(ownership.message), { statusCode: ownership.status });
            }
            if (order.status === 'Cancelled') {
                throw Object.assign(new Error('Order already cancelled'), { statusCode: 400 });
            }

            const refundAmount = getFullOrderCancelRefundAmount(order);

            for (const item of getActiveBillableItems(order)) {
                await incrementVariantStock(
                    item.product,
                    item.sku,
                    item.size,
                    item.quantity,
                    session
                );
            }

            for (const item of order.orderedItems) {
                item.status = 'Cancelled';
            }
            order.status = 'Cancelled';

            if (refundAmount > 0) {
                const credit = await creditWallet(
                    userId,
                    refundAmount,
                    {
                        type: 'credit',
                        amount: refundAmount,
                        reason: 'Refund for cancel Order',
                        orderId,
                    },
                    session
                );
                if (!credit.ok) {
                    throw Object.assign(new Error(credit.message || 'Refund failed'), {
                        statusCode: 500,
                    });
                }
            }

            order.finalAmount = 0;
            await order.save({ session });
        });

        return res.status(200).json({ success: true, message: 'Order Cancelled successfully' });
    } catch (error) {
        console.error('Error in Cancel Order', error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};

const returnItem = async (req, res) => {
    try {
        const { orderId, sku, reason } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ orderId, userId });
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            return res.status(ownership.status).json({ success: false, message: ownership.message });
        }

        const item = order.orderedItems.find((i) => i.sku === sku);
        if (!item) {
            return res.status(400).json({ success: false, message: 'Item not found' });
        }

        item.status = 'Return Request';
        item.returnStatus = 'Requested';
        item.returnReason = reason;
        await order.save();

        return res.status(200).json({ success: true, message: 'Return request submitted' });
    } catch (error) {
        console.log('Error in Return item', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ orderId, userId });
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            return res.status(ownership.status).json({ success: false, message: ownership.message });
        }

        const activeItems = getActiveBillableItems(order);
        activeItems.forEach((item) => {
            item.status = 'Return Request';
        });

        order.status = 'Return Request';
        order.returnStatus = 'Requested';
        order.returnReason = reason;
        await order.save();

        return res.status(200).json({ success: true, message: 'Return request submitted' });
    } catch (error) {
        console.log('Error in Return order : ', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const invoice = async (req, res, next) => {
    try {
        const orderId = req.query.id;
        const userId = req.session.user;

        const admin = await User.findOne({ isAdmin: true });
        const order = await Order.findOne({ orderId, userId }).populate('orderedItems.product');
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            const err = new Error(ownership.message);
            err.statusCode = ownership.status;
            throw err;
        }

        return res.render('invoice', { order, user: userId, admin });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    orderDetailpage,
    cancelItem,
    cancelOrder,
    returnItem,
    returnOrder,
    invoice,
};
