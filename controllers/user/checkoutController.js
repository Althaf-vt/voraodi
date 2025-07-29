const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Product = require('../../models/productSchema');
const Razorpay = require('razorpay');
const Crypto = require('crypto');
const { router } = require('../../server');
const Wallet = require('../../models/walletSchema');

// const { generate } = require('mongoose/lib/types/objectid');


const checkStock = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userCart = await Cart.findOne({userId:userId});

        for(const item of userCart.items){
            const product = await Product.findById(item.productId).populate('category');

            if(!product){
                console.log(`Product not found for ID : ${item.productId}`);
            }
            if(product.isBlocked === true){
                console.log('Product is Blocked');
                return res.status(400).json({success:false,message:`The product"${product.productName}" is currently unavailable. Please update your cart.`});
            }
            if(product.category.isListed === false){
                return res.status(400).json({success:false, message:`The "${product.category.name}" category is currently unavailable. Please update your cart.`})
            }

            const variant = product.variants.find(v=> v.sku === item.sku);

            if(!variant){
                console.log(`Variant not found for product : ${product.productName}`);
            }

            if(item.quantity > variant.quantity){
                return res.status(400).json({
                    success:false,
                    stockAvailable: false,
                    message: `Insufficient stock for ${product.productName} (Size: ${item.size}) - Available Qty: ${variant.quantity}, Requested Qty: ${item.quantity}`
                })
            } 
        }

        return res.status(200).json({success:true,stockAvailable: true,});

    } catch (error) {
        console.error("Stock check error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const loadCheckout = async(req,res)=>{
    try {

        //session handling
        if (req.session.orderSuccess) {
            req.session.orderSuccess = null;
            return res.redirect('/shop');
        }

        const userId = req.session.user;

        const user = await User.findById(userId);
       
        const userCart = await Cart.findOne({userId}).populate('items.productId');
        const userAddressData = await Address.findOne({userId});

        const cartItems = userCart ? userCart.items : [];
        const userAddress = userAddressData ? userAddressData.address : [];

        const subtotal = userCart.items.reduce((total, item) => {
            return item.productId ? total + item.productId.salePrice * item.quantity : total;
        },0);

        userCart.deliveryCharge = subtotal >= 3000 ? 0 : 50;

        const total = subtotal + userCart.deliveryCharge;
        
        await userCart.save();

        const coupons = await Coupon.find(
            {isListed:true,isPublic:true,amount:{$lte: subtotal}}
        ).sort({amount: -1})

        const availableCoupons = coupons.filter(c => !c.usedBy.includes(userId));

        const wallet = await Wallet.findOne({userId:userId})


        return res.render('checkout',{
            user,
            userAddress,
            cartItems,
            availableCoupons,
            subtotal,
            total,
            deliveryCharge: userCart.deliveryCharge,
            wallet,
        });

    } catch (error) {
        console.log('Error in loading checkout page',error);
        res.redirect('/pageNotFound');
    }
}

const applyCoupon = async(req,res) => {
    try {
        const {couponCode,userId} = req.body;

        const coupon = await Coupon.findOne({code: couponCode,isListed:true,});

        if(!coupon){
            return res.status(400).json({success:false,message:'This Coupon is currenly unavailable'});
        }

        if(coupon.expireOn < new Date()){
            return res.status(400).json({success:false,message:"Coupon has expired"});
        }

        if(coupon.usedBy.length >= coupon.maxUsage){
            return res.status(400).json({ success:false,message:"Coupon usage limit reaches"});
        }

        const isUsed = coupon.usedBy.includes(userId)
        if(isUsed){
            return res.status(400).json({ success:false,message:"Coupon already used by this user"});
        }

        const userCart = await Cart.findOne({userId}).populate('items.productId');

        if(!userCart || userCart.items.length === 0){
            return res.status(400).json({success:false,message:'No items in cart'});
        }

        const subtotal = userCart.items.reduce((total, item) => {
            return item.productId ? total + item.productId.salePrice * item.quantity : total;
        },0);

        if(subtotal >= 3000){
            userCart.deliveryCharge = 0;
        }

        const discount = Math.min(coupon.amount, subtotal); // avoid discount being more than subtotal

         const total = subtotal - discount + userCart.deliveryCharge;

        return res.status(200).json({
            success:true,
            message:'Coupon applied successfully',
            coupon,
            newTotals: {
                discount,
                subtotal,
                deliveryCharge: userCart.deliveryCharge,
                total
            }
        });
    } catch (error) {
        console.log("Error in apply coupon : ",error);
        return res.status(500).json({success:false,message:'Internal Server Error'});
    }
}

const placeOrder = async (req,res)=>{
    try {
        const { userId, addressId, paymentMethod, couponCode } = req.body;

        const userAddressDoc = await Address.findOne({userId});
        const selectedAddress = userAddressDoc.address.id(addressId);
        const clonedAddress = structuredClone(selectedAddress.toObject());

        if(!userId) return res.status(400).json({success: false, message:'user id is undefined'});
        if(!addressId) return res.status(400).json({success: false, message:'address is missing'});
        if(!paymentMethod) return res.status(400).json({success: false, message:'paymernt method is missing'});

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const cart = await Cart.findOne({userId}).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }
        
        //Update cart item prices with latest product prices
        for (let item of cart.items) {
            if (item.productId) {
                const latestPrice = item.productId.salePrice;
                item.price = latestPrice;
                item.totalPrice = latestPrice * item.quantity;
            }
        }
        await cart.save();

        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        //coupon handling
        let discount = 0;

        let couponApplied = false;

        if(couponCode){
            const coupon = await Coupon.findOne({code: couponCode, isListed: true});
            if(!coupon){
                return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
            }

            const now = new Date();
            if(now > coupon.expireOn){
                return res.status(400).json({success: false, message: 'Coupon has expired'});
            }

            if(coupon.usedBy.includes(userId)){
                return res.status(400).json({ success: false, message: 'You have already used this coupon' });
            }

            if(totalPrice < coupon.minimumPrice){
                return res.status(400).json({success: false, message: `Minimum order amount ₹${coupon.minimumPrice} required to use this coupon`})
            }

            discount = coupon.amount;
            couponApplied = true;

            coupon.usedBy.push(userId);
            await coupon.save();
        }

        const couponAmountToEach = discount/cart.items.length;
        

         const orderedItems = cart.items.map(item => {
            const discountedPrice = item.productId.salePrice - couponAmountToEach;
            return {
                product: item.productId._id,
                quantity: item.quantity,
                price: discountedPrice < 0 ? 0 : discountedPrice,
                sku: item.sku,
                size: item.size,
                status: 'Pending'
            };
        });
    
        const recalculatedTotal = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const deliveryCharge = totalPrice >= 3000 ? 0 : 50;
        
        const finalAmount = recalculatedTotal + deliveryCharge;

        const paymentStatus = paymentMethod === 'cod' ? 'Pending' : 'Completed';


        const newOrder = new Order({
            orderedItems,
            totalPrice: totalPrice, // Original total before discounts
            discount,
            finalAmount,
            address: clonedAddress,
            invoiceDate: new Date(),
            status: 'Pending',
            couponApplied,
            paymentMethod,
            paymentStatus,
            userId: userId,
            deliveryCharge: deliveryCharge,
        });
        await newOrder.save();

        console.log(paymentMethod)

        // Decrease amount from wallet
        if(paymentMethod === 'wallet'){
            await Wallet.updateOne(
                {userId:userId},
                {
                    $inc: {balance:-finalAmount},
                    $push: {
                        transactions: {
                            type: 'debit',
                            amount: finalAmount,
                            reason: 'Wallet payment',
                            orderId: newOrder.orderId
                        }
                    }
                }
            )
        }

        // decrease product quanity
        for(const item of orderedItems){
            const product = await Product.findById(item.product);

            if(!product)continue;

            const variant = product.variants.find((v)=>
                v.size === item.size && v.sku === item.sku
            );
            
            if(variant){
                variant.quantity -= item.quantity;

                // To prevent ngtv stock
                if(variant.quantity < 0 ) variant.quantity = 0;

                await product.save();
            }
        }


        // Clear cart
        cart.items = [];
        await cart.save();

        //session handling
        req.session.orderSuccess = true;
        return res.status(200).json({success:true,orderId:newOrder.orderId});
    } catch (error) {
        console.error('Order placement error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }   
}

const createRazorpayOrder = async(req,res)=>{
    try {
        const userId = req.session.user;
        if(!userId){
            return res.status(400).json({success:false,message:'Unauthorized user'});
        }

        const {addressId,couponCode} = req.body;
        if(!addressId){
           return res.status(400).json({success:false,message:'Please select a shipping address'});
        }

        //Get selected address
        const userAddressDoc = await Address.findOne({userId});
        const selectedAddress = userAddressDoc.address.id(addressId);

        if(!selectedAddress){
            return res.status(400).json({success:false,message:'invalid address'});
        }

        const cart = await Cart.findOne({userId}).populate('items.productId');

        if(!cart || cart.items.length === 0){
            return res.status(400).json({success:false,message:'Your cart is empty'});
        }
        
        const subtotal = cart.items.reduce((acc,item) =>{
            if(item.productId){
                return acc + item.productId.salePrice * item.quantity
            }
            return acc;
        },0);

        let discount = 0;
        if(couponCode){
            const coupon = await Coupon.findOne({code:couponCode, isListed:true, isListed:true});
            if(coupon){
                discount = coupon.amount;
            }
        }

        let deliveryCharge = subtotal >= 3000 ? 0 : 50;

        const finalAmount = subtotal - discount + deliveryCharge;

        // Create Razorpay order
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret:process.env.RAZORPAY_KEY_SECRET,
        })

        //Create order
        const order = await razorpay.orders.create({
            amount: Math.round(finalAmount * 100),
            currency: 'INR',
            receipt: `order_rcpt_${Date.now()}`,
            notes: {
                userId,
                addressId,
                couponCode,
            },
        });

        return res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const verifyRazorpayPayment = async(req,res)=>{
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            addressId,
            userId,
            couponCode
        } = req.body;

        if(!razorpay_payment_id || !razorpay_order_id || !razorpay_signature){
            return res.status(400).json({success:false,message:"Missing Razorpay credentials"});
        }

        // 1 generate expected signature
        const generated_signature = Crypto
            .createHmac('sha256',process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        // 2 compare signatures
        if(generated_signature !== razorpay_signature){
            console.log('in gen sign and raz sign comapre')
            return res.status(400).json({success:false,message:'Payment verification failed'});
        }


        return res.status(200).json({success:true,message:'Payment verified and order palced'});
    } catch (error) {
        console.error("Payment verification error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" })
    }
}

const orderSuccess = async(req,res)=>{
    try {
        const  userId = req.session.user;
        const {id} = req.params;

        const user = await User.findOne({_id:userId});

        const order = await Order.findOne({orderId:id}).populate('orderedItems.product');

        if(!order){
            return res.redirect('/pageNotFound');
        }

        return res.render('orderSuccess',{
            order:order,
            user,
        });
    } catch (error) {
        
    }
}

const paymentFailed = async(req,res)=>{
    try {
        const userId = req.session.user;

        const user = await User.findOne({_id:userId});
        res.render('payment-failed',{user});
    } catch (error) {
        console.log("Error while rendering payment failed",error);
        res.redirect('/pageNotFound');
    }
}



module.exports ={
    checkStock,
    loadCheckout,
    placeOrder,
    applyCoupon,
    createRazorpayOrder,
    verifyRazorpayPayment,
    orderSuccess,
    paymentFailed

}