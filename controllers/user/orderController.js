const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');


const orderDetailpage = async(req,res)=>{
    try {
        const orderId = req.params.id;
        const userId = req.session.user;

        const user = await User.findOne({_id:userId})
        
    
        const order = await Order.findOne({orderId:orderId})
        .populate('orderedItems.product')

        return res.render('orderDetails',{
            order,
            user,
            message : null
        });


    } catch (error) {
        console.log('Catch in orderdetail',error)
    }
}

const cancelItem = async(req,res)=>{
    try {
        const {orderId,sku} = req.body;

        const userId = req.session.user;

        const findOrder = await Order.findOne({orderId:orderId});

        if(!findOrder){
            console.log("Order not found");
            return res.status(400).json({ success: false, message: "Order not found" });
        }

        const item = findOrder.orderedItems.find((item)=> item.sku === sku);

        if(!item){
            console.log('Item with SKU not found')
            return res.status(500).json({success: false, message:'Item not found in ordered items'});
        }

        if(item.status === 'Cancelled'){
            return res.status(400).json({success: false, message: "Item already cancelled"});
        }
        const cancelQty = item.quantity;
        const unitPrice = item.price
        const productId = item.product;

        item.status = 'Cancelled';

        // update quantity in product schema
        const product = await Product.findOne({_id: productId});

        if (!product) {
            console.log("Product not found");
            return res.status(500).json({ success: false, message: "Product not found" });
        }

        // Find the variant by SKU and increment its quantity
        const variant = product.variants.find(variant => variant.sku === sku);
        if(!variant){
            console.log('varient not found in product Schema');
            return res.status(500).json({success: false, message:"Product variant not found"})
        }

        variant.quantity += cancelQty; // restock qty
        

        const allCancelled = findOrder.orderedItems.every(item => item.status === 'Cancelled');
        if(allCancelled && findOrder.status !== 'Cancelled'){
            findOrder.status = 'Cancelled';
            await findOrder.save();
        }

        console.log(findOrder.paymentMethod);

        if(findOrder.paymentMethod !== 'cod'){
            const refundAmount = unitPrice * cancelQty;
            
            await Wallet.updateOne(
                {userId},
                {
                    $inc:{balance:refundAmount},
                    $push:{
                        transactions:{
                            type:'credit',
                            amount: refundAmount,
                            reason: 'Refund for Cancel Item',
                            orderId: orderId,
                            productId: productId,
                            quantity: cancelQty,
                        }
                    }
                }
            )
            findOrder.finalAmount -= refundAmount;
        }

        await product.save();
        await findOrder.save();
        
        return res.status(200).json({ success: true, message: "Item removed successfully" });
    } catch (error) {
        console.error(" Error deleting item:", error);
        return res.status(400).json({ success: false, message: "Internal server error" });
    }
}

const cancelOrder = async (req,res)=>{
    try {
        const {orderId} = req.body;
        const userId = req.session.user;
        
        const order = await Order.findOne({orderId:orderId});

        if(!order){
            console.log('Order not found');
            return res.status(500).json({success: false, message: 'Order not found'});
        }

        for(let item of order.orderedItems){
            const product = await Product.findById(item.product);
            
            if(!product){
                console.log(`Product not found for item SKU: ${item.sku}`);
                continue; // Skip to next item
            }
            const variant = product?.variants.find(v => v.sku === item.sku);
            
            if (!variant) {
                console.log(`Variant not found for SKU: ${item.sku}`);
                continue;
            }

            variant.quantity += item.quantity
            await product.save();
        }


        for(let item of order.orderedItems){
            item.status = 'Cancelled';
        }

        order.status = 'Cancelled';

        if(order.paymentMethod !== 'cod'){

            const refundAmount = order.finalAmount;

            await Wallet.updateOne(
                {userId},
                {
                    $inc:{balance: refundAmount},
                    $push: {
                        transactions: {
                            type: 'credit',
                            amount: refundAmount,
                            reason: 'Refund for cancel Order',
                            orderId: orderId,
                        }
                    }
                }
            )
            order.finalAmount -= refundAmount;
        }

        await order.save();

        return res.status(200).json({success: true, message: 'Order Cancelled successfully'});
    } catch (error) {
        console.error('Error in Cancel Order',error);
        return res.status(500).json({success: false, message: 'Internal Server Error'});
    }
}

// const returnItem = async(req,res)=>{
//     try {
//         const {orderId,sku,reason} = req.body;
//         const user = req.session.user;

//         // const order = await 
//     } catch (error) {
        
//     }
// }
const returnItem = async(req,res)=>{
    try {
        const {orderId,sku,reason} = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({orderId:orderId})
        if(!order){
            console.log('Order not found')
            return res.status(400).json({success:false,message:'Order not found'});
        }

        const item = order.orderedItems.find((item)=> item.sku === sku);

        if(!item){
            console.log('Item not found');
            return res.status(400).json({success:false,message:'Item not found'})
        }


        item.status = 'Return Request';
        item.returnStatus = 'Requested';
        item.returnReason = reason;

        await order.save();

        return res.status(200).json({success:true,message:'Return request submitted'})
    } catch (error) {
        console.log('Error in Return item',error);
        return res.status(500).json({success:false, message:'Internal Server Error'});
    }
}

const returnOrder = async(req,res)=>{
    try {
        const {orderId,reason} = req.body;
        const user = req.session.user;

        const order = await Order.findOne({orderId:orderId});

        if(!order){
            console.log('Order not found');
            return res.status(400).json({success:false, message:'Order not found'});
        }
        
        order.orderedItems.forEach(item =>{
            item.status = 'Return Request'
        })

        order.status = 'Return Request';
        order.returnStatus = 'Requested';
        order.returnReason = reason;

        await order.save();

        return res.status(200).json({success:true, message:'Return request submitted'})
    } catch (error) {
        console.log('Error in Return order : ',error);
        return res.status(500).json({success:false,message:'Internal Server Error'});
    }
}


const invoice = async(req,res)=>{
    try {
        const orderId = req.query.id;
        const user = req.session.user;

        const admin = await User.findOne({isAdmin:true});
        const order = await Order.findOne({orderId:orderId}).populate('orderedItems.product');

         if(!order){
            console.log('Order not found')
            return res.redirect('/pageNotFound');
         }

        return res.render('invoice',{
            order,
            user,
            admin
        })
    } catch (error) {
        console.log("Error while rendering invoice",error);
        return res.redirect('/pageNotFound');
    }
}


module.exports = {
    orderDetailpage,
    cancelItem,
    cancelOrder,
    returnItem,
    returnOrder,
    invoice
}