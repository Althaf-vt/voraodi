const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');


const orderDetailpage = async(req,res)=>{
    try {
        const orderId = req.query.id;
        console.log(orderId, "jdjfidnifndniudnxin")
        const user = req.session.user;
    
        const order = await Order.findOne({orderId:orderId})
        .populate('orderedItems.product')

        return res.render('orderDetails',{
            order,
        });


    } catch (error) {
        
    }
}

const cancelItem = async(req,res)=>{
    try {
        const {orderId,sku} = req.body;
        console.log('Cancel Request Payload:', req.body); //  log input

        const findOrder = await Order.findOne({orderId:orderId});

        if(!findOrder){
            console.log("Order not found");
            return res.status(400).json({ success: false, message: "Order not found" });
        }

        const item = findOrder.orderedItems.find((item)=> item.sku === sku);
        console.log("Found item index:", item); //  log match index

        if(!item){
            console.log('Item with SKU not found')
            return res.status(500).json({success: false, message:'Item not found in ordered items'});
        }

        if(item.status === 'Cancelled'){
            return res.status(400).json({success: false, message: "Item already cancelled"});
        }
        const cancelQty = item.quantity;
        const productId = item.product;

        item.status = 'Cancelled';

        await findOrder.save();

        // update quantity in product schema
        const product = await Product.findOne({_id: productId});

        if (!product) {
            console.log("Product not found");
            return res.status(500).json({ success: false, message: "Product not found" });
        }

        // Find the variant by SKU and increment its quantity
        const variant = product.variants.find(variant => variant.sku === sku);
        console.log("Variant matched:", variant); // ✅ log variant
        if(!variant){
            console.log('varient not found in product Schema');
            return res.status(500).json({success: false, message:"Product variant not found"})
        }

        variant.quantity += cancelQty; // restock qty
        await product.save();

        const allCancelled = findOrder.orderedItems.every(item => item.status === 'Cancelled');
        if(allCancelled && findOrder.status !== 'Cancelled'){
            findOrder.status = 'Cancelled';
            await findOrder.save();
        }

        console.log("Item removed successfully");
        return res.status(200).json({ success: true, message: "Item removed successfully" });
    } catch (error) {
        console.error(" Error deleting item:", error);
        return res.status(400).json({ success: false, message: "Internal server error" });
    }
}

const cancelOrder = async (req,res)=>{
    try {
        const {orderId} = req.body;
        
        const order = await Order.findOne({orderId:orderId});
        console.log('order',order)

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



        order.status = 'Cancelled';
        await order.save();
        console.log('cancelled');

        return res.status(200).json({success: true, message: 'Order Cancelled successfully'});
    } catch (error) {
        console.error('Error in Cancel Order',error);
        return res.status(500).json({success: false, message: 'Internal Server Error'});
    }
}


module.exports = {
    orderDetailpage,
    cancelItem,
    cancelOrder
}