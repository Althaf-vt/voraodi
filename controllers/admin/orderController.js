const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const { creditWallet } = require('../../utils/walletOps');
const { incrementVariantStock } = require('../../utils/stockOps');
const { withTransaction } = require('../../utils/withTransaction');
const {
    getReturnItemRefundAmount,
    getReturnOrderRefundAmount,
    getActiveBillableItems,
    computeOrderFinalAmount,
} = require('../../utils/orderPricing');

const loadOrders = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;


        const orderData = await Order.find({ status: { $ne: 'Payment Failed' } })
            .populate('userId', 'name')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        const options = { day: 'numeric', month: 'short', year: 'numeric' }
        const formattedData = orderData.map(order => ({
            orderId: order.orderId,
            username: order.userId?.name || 'Account Deleted',
            orderedDate: order.createdOn.toLocaleDateString(),
            paymentMethod: order.paymentMethod,
            totalAmount: order.totalPrice,
            status: order.status,
            returnStatus: order.returnStatus,
            hasReturnRequest: order.orderedItems.some(item => item.returnStatus === 'Requested')
            // viewLink: `/admin/orders/orderDetails/${order.orderId}`
        }));



        const totalOrders = await Order.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        return res.render('orders', {
            orders: formattedData,
            currentPage: page,
            totalPages: totalPages,
        })



    } catch (error) {
        next(error);
    }
}

const orderDetails = async (req, res, next) => {
    try {
        const { orderId } = req.query;

        const order = await Order.findOne({ orderId }).populate('orderedItems.product').lean();

        const getProducts = order.orderedItems.map(item => ({
            name: item.product.productName,
            image: item.product.productImage,
            size: item.size,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            status: item.status,
            returnStatus: item.returnStatus,
            Reason: item.returnReason
        }))

        const address = order.address;

        return res.render('order-Details', {
            products: getProducts,
            address,
            order
        })

    } catch (error) {
        console.error('Error in loading OrderDetail page', error);
        next(error)
    }
}

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        const VALID_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Payment Failed'];
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }

        const order = await Order.findOne({ orderId });

        if (!order) {
            return res.status(500).json({ success: false, message: 'Order not found' });
        }

        if(order.status === 'Cancelled'){
            return res.status(400).json({success:false,message:'Order is already cancelled'})
        }

        if(order.status === 'Delivered'){
            return res.status(400).json({success:false,message:'Order is already delivered'})
        }

        const updateStatus = order.status = status;
        order.orderedItems.map(item => {
            if (item.status !== 'Cancelled') {
                item.status = status
            }
        });

        if (!updateStatus) {
            return res.status(500).json({ success: false, message: 'Status is not updated' });
        }

        await order.save()

        return res.status(200).json({ success: true, message: 'Status Updated' })

    } catch (error) {
        console.error('Error in update status', error);
        return res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
}

const approveReturnOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        await withTransaction(async (session) => {
            const order = await Order.findOne({ orderId }).session(session);
            if (!order) {
                throw Object.assign(new Error('Order not found'), { statusCode: 400 });
            }

            const activeItems = getActiveBillableItems(order);
            const refundAmount = getReturnOrderRefundAmount(order);

            for (const item of activeItems) {
                item.status = 'Returned';
                item.returnStatus = 'Returned';
                await incrementVariantStock(
                    item.product,
                    item.sku,
                    item.size,
                    item.quantity,
                    session
                );
            }

            order.status = 'Returned';
            order.returnStatus = 'Returned';

            if (refundAmount > 0) {
                const credit = await creditWallet(
                    order.userId,
                    refundAmount,
                    {
                        type: 'credit',
                        amount: refundAmount,
                        reason: 'Order returned',
                        orderId: order.orderId,
                    },
                    session
                );
                if (!credit.ok) {
                    throw Object.assign(new Error(credit.message || 'Refund failed'), {
                        statusCode: 500,
                    });
                }
            }

            order.finalAmount = computeOrderFinalAmount(order);
            await order.save({ session });
        });

        return res.status(200).json({ success: true, message: 'Request approved' });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
}

const rejectReturnOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(400).json({ success: false, message: 'Order not found' });
        }

        order.returnStatus = 'Rejected';
        order.orderedItems.map(item => item.returnStatus = 'Rejected');

        order.save();

        return res.status(200).json({ success: true, message: 'Request rejected' });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const approveReturnItem = async (req, res) => {
    try {
        const { orderId, sku } = req.body;

        await withTransaction(async (session) => {
            const order = await Order.findOne({ orderId }).session(session);
            if (!order) {
                throw Object.assign(new Error('Order not found'), { statusCode: 400 });
            }

            const requestedItem = order.orderedItems.find((item) => item.sku === sku);
            if (!requestedItem) {
                throw Object.assign(new Error('Item not found'), { statusCode: 400 });
            }

            const refundAmount = getReturnItemRefundAmount(requestedItem, order);

            requestedItem.returnStatus = 'Returned';
            requestedItem.status = 'Returned';

            const restocked = await incrementVariantStock(
                requestedItem.product,
                requestedItem.sku,
                requestedItem.size,
                requestedItem.quantity,
                session
            );
            if (!restocked) {
                throw Object.assign(new Error('Product variant not found'), { statusCode: 500 });
            }

            if (refundAmount > 0) {
                const credit = await creditWallet(
                    order.userId,
                    refundAmount,
                    {
                        type: 'credit',
                        amount: refundAmount,
                        reason: 'Product returned',
                        orderId,
                        quantity: requestedItem.quantity,
                    },
                    session
                );
                if (!credit.ok) {
                    throw Object.assign(new Error(credit.message || 'Refund failed'), {
                        statusCode: 500,
                    });
                }
            }

            const allItemsReturned = order.orderedItems.every(
                (item) => item.returnStatus === 'Returned' || item.status === 'Returned'
            );
            if (allItemsReturned) {
                order.status = 'Returned';
                order.returnStatus = 'Returned';
            }

            order.finalAmount = computeOrderFinalAmount(order);
            await order.save({ session });
        });

        return res.status(200).json({ success: true, message: 'Return request approved' });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
}

const rejectReturnItem = async (req, res) => {
    try {
        const { orderId, sku } = req.body;

        const order = await Order.findOne({ orderId: orderId });

        if (!order) return res.status(400).json({ success: false, message: 'Order not found' });

        const requestedItem = order.orderedItems.find(item => item.sku === sku);

        if (!requestedItem) return res.status(400).json({ success: false, message: 'Item not found' });

        requestedItem.returnStatus = 'Rejected';
        requestedItem.status = 'Rejected';

        await order.save();

        return res.status(200).json({ success: true, message: 'Return request rejected' });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

module.exports = {
    loadOrders,
    orderDetails,
    updateOrderStatus,
    approveReturnOrder,
    rejectReturnOrder,
    approveReturnItem,
    rejectReturnItem
}