const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');

const loadOrders = async(req,res)=>{
    try {

        const page = req.query.page || 1;
        const limit = 4;
        const skip = (page-1)*limit;


        const orderData = await Order.find({})
        .populate('userId','name')
        .sort({createdOn: -1})
        .skip(skip)
        .limit(limit);

        const options = { day:'numeric', month: 'short', year:'numeric' }
        const formattedData =  orderData.map(order =>({
            orderId: order.orderId,
            username: order.userId?.name || 'Account Deleted',
            orderedDate: order.createtOn.toLocaleDateString('en-IN',options),
            paymentMethod: order.paymentMethod,
            totalAmount: order.totalPrice,
            status: order.status,
            // viewLink: `/admin/orders/orderDetails/${order.orderId}`
        }));



        const totalOrders = await Order.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        return res.render('orders',{
            orders: formattedData,
            currentPage: page,
            totalPages: totalPages, 
        })



    } catch (error) {
        console.log('Error in loading orders page',error);
        return res.redirect('/admin/pageError');
    }
}

const orderDetails = async(req,res)=>{
    try {
        const {orderId} = req.query;

        const order = await Order.findOne({orderId}).populate('orderedItems.product').lean();
        
        const getProducts = order.orderedItems.map(item =>({
            name : item.product.productName,
            image: item.product.productImage,
            size : item.size,
            quantity: item.quantity,
            price: item.price,
            rProduct: item.returnStatus,
            Reason: item.returnReason 
        }))

        const address = order.address;

        return res.render('order-Details',{
            products: getProducts,
            address,
            order
        })

    } catch (error) {
        console.error('Error in loading OrderDetail page',error);
        return res.redirect('/admin/pageError');
    }
}

const updateOrderStatus = async(req,res)=>{
    try {
        const {orderId,status} = req.body;
        const order = await Order.findOne({orderId});

        if(!order){
            console.log('Could not find order');
            return res.status(500).json({success: false, message: 'Order not found'});
        }

        const updateStatus = order.status = status;

        if(!updateStatus){
            console.log('status not updated');
            return res.status(500).json({success: false, message: 'Status is not updated'});
        }

        await order.save()
        console.log('====saved====');

        return res.status(200).json({success: true, message: 'Status Updated'})

    } catch (error) {
        console.error('Error in update status',error);
        return res.redirect('/admin/pageError');
    }
}

module.exports ={
    loadOrders,
    orderDetails,
    updateOrderStatus
}