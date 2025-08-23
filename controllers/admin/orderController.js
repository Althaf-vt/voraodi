const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');

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
        console.log('Error in loading orders page', error);
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
        const order = await Order.findOne({ orderId });

        if (!order) {
            console.log('Could not find order');
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
            console.log('status not updated');
            return res.status(500).json({ success: false, message: 'Status is not updated' });
        }

        await order.save()

        return res.status(200).json({ success: true, message: 'Status Updated' })

    } catch (error) {
        console.error('Error in update status', error);
        return res.redirect('/admin/pageError');
    }
}

const approveReturnOrder = async (req, res) => {
    try {
        console.log('Body : ', req.body)
        const { orderId } = req.body;
        console.log('orderId : ', orderId)
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            console.log('Order not found');
            return res.status(400).json({ success: false, message: 'Order not found' });
        }

        

        order.status = 'Returned';
        order.returnStatus = 'Returned';


        // find active orders
        const activeItems = order.orderedItems.filter(item => 
            item.status !== 'Cancelled' && item.status !== 'Returned' && item.returnStatus !== 'Returned'
        );

        const activeItemsTotal = activeItems.reduce((total,item)=> total + item.price,0);
        const amountToRefund = activeItemsTotal;

        activeItems.map(item => item.status = 'Returned');
        activeItems.map(item => item.returnStatus = 'Returned');


        // Refund Amount to wallet
        const refundAmount = amountToRefund;

        await Wallet.updateOne(
            { userId: order.userId },
            {
                $inc: { balance: refundAmount },
                $push: {
                    transactions: {
                        type: 'credit',
                        amount: refundAmount,
                        reason: "Order returned",
                        orderId: order.orderId,
                    }
                }
            }
        )


        await order.save()
        console.log('approved & saved');

        const items = order.orderedItems;

        console.log('items: ', items)


        for (const item of items) {
            const product = await Product.findById(item.product);

            if (product) {
                const variant = product.variants.find(v => v.sku === item.sku);

                if (variant) {
                    variant.quantity += item.quantity;

                    await product.save()
                } else {
                    console.log(`Variant with SKU ${item.sku} not found in product ${product._id}`);
                }
            } else {
                console.warn(`Product not found with id ${item.product}`);
            }
        }

        return res.status(200).json({ success: true, message: 'Request approved' });

    } catch (error) {
        console.log('Error in Approving return order', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const rejectReturnOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            console.log('Order not found');
            return res.status(400).json({ success: false, message: 'Order not found' });
        }

        order.returnStatus = 'Rejected';
        order.orderedItems.map(item => item.returnStatus = 'Rejected');

        order.save();

        return res.status(200).json({ success: true, message: 'Request rejected' });

    } catch (error) {
        console.log('Error in Reject return Order');
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const approveReturnItem = async (req, res) => {
    try {
        const { orderId, sku } = req.body;

        const order = await Order.findOne({ orderId: orderId });
        const userId = order.userId;

        if (!order) return res.status(400).json({ success: false, message: 'Order not found' });

        // const orderedItems = order.orderedItems;

        const requestedItem = order.orderedItems.find(item => item.sku === sku);

        if (!requestedItem) return res.status(400).json({ success: false, message: 'Item not found' });

        requestedItem.returnStatus = 'Returned';
        requestedItem.status = 'Returned';

        // Calculate refund amount
        const unitPrice = requestedItem.price / requestedItem.quantity; // Price per item
        const refundAmount = unitPrice * requestedItem.quantity; // Total price for returned items


        await Wallet.updateOne(
            { userId: userId },
            {
                $inc: { balance: refundAmount },
                $push: {
                    transactions: {
                        type: 'credit',
                        amount: refundAmount,
                        reason: "Product returned",
                        orderId: orderId,
                        quantity: requestedItem.quantity
                    }
                }
            }
        )

        // Restore product quantity
        const product = await Product.findById(requestedItem.product);

        if (product) {
            const variant = product.variants.find(v => v.sku === requestedItem.sku);

            if (variant) {
                variant.quantity += requestedItem.quantity;
                await product.save();
            } else {
                console.log(`Variant with SKU ${requestedItem.sku} not found in product ${product._id}`);
            }
        } else {
            console.warn(`Product not found with id ${requestedItem.product}`);
        }

        requestedItem.status = 'Returned';

        // Update order totals
        // const activeItems = order.orderedItems.filter(item => 
        //     item.status !== 'Cancelled' && item.status !== 'Returned' && item.returnStatus !== 'Returned'
        // );
        // const newTotalPrice = activeItems.reduce((sum, item) => sum + (item.price), 0);

        // order.totalPrice = newTotalPrice;
        // order.finalAmount = newTotalPrice - order.discount + order.deliveryCharge;

        // Check if all items are now returned
        const allItemsReturned = order.orderedItems.every(item => 
            item.returnStatus === 'Returned' || item.status === 'Returned'
        );
        
        if (allItemsReturned) {
            order.status = 'Returned';
            order.returnStatus = 'Returned';
        }

        await order.save();

        return res.status(200).json({ success: true, message: 'Return request approved' });
    } catch (error) {
        console.log('Error in approve return item ', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
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
        console.log('Error in reject return request');
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