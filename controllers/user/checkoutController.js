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
const messages = require('../../public/constants/messages');
const { type } = require('os');

// const { generate } = require('mongoose/lib/types/objectid');


const checkStock = async(req,res)=>{
    try {
        console.log('checking....');
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
        console.log('checked!')

        return res.status(200).json({success:true,stockAvailable: true,});

    } catch (error) {
        console.error("Stock check error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const loadCheckout = async (req, res) => {
    try {
        // 1. Order success session check
        if (req.session.orderSuccess) {
            req.session.orderSuccess = null;
            return res.redirect('/shop');
        }

        const userId = req.session.user;
        const { orderId } = req.query;
        const isPaymentFailed = !!orderId;

        // Fetch user, address, wallet
        const user = await User.findById(userId);
        const userAddressData = await Address.findOne({ userId });
        const userAddress = userAddressData ? userAddressData.address : [];
        const wallet = await Wallet.findOne({ userId });

        let cartItems = [];
        let subtotal = 0;
        let deliveryCharge = 50;
        let total = 0;
        let availableCoupons = [];

        if (isPaymentFailed) {
            // 2. Payment failed: Load order and check stock
            const order = await Order.findOne({ orderId, userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment Failed') {
                return res.redirect('/cart');
            }

            // Stock check
            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.redirect(`/cart?error=Product ${item.product?.productName || 'Unknown'} is unavailable or blocked`);
                }
                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.quantity < item.quantity) {
                    return res.redirect(`/cart?error=Insufficient stock for ${product.productName} (Size: ${item.size})`);
                }
            }

            // Prepare cartItems from order
            cartItems = order.orderedItems.map(item => ({
                productId: item.product,
                size: item.size,
                sku: item.sku,
                color: item.product.color || 'N/A',
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
            }));

            subtotal = order.totalPrice;
            deliveryCharge = order.deliveryCharge || (subtotal >= 3000 ? 0 : 50);
            total = order.finalAmount;
            // Coupons: Only show if not already applied
            if (!order.couponApplied) {
                const coupons = await Coupon.find({ isListed: true, isPublic: true, amount: { $lte: subtotal } }).sort({ amount: -1 });
                availableCoupons = coupons.filter(c => !c.usedBy.includes(userId));
            }
            // Save retry order in session
            req.session.retryOrder = { orderId: order.orderId };
        } else {
            // 3. Normal checkout: Load cart and check stock
            const userCart = await Cart.findOne({ userId }).populate('items.productId');
            if (!userCart || !userCart.items.length) {
                return res.redirect('/cart?error=Your cart is empty');
            }

            // Stock check
            for (const item of userCart.items) {
                const product = item.productId;
                if (!product || product.isBlocked) {
                    return res.redirect(`/cart?error=Product ${product?.productName || 'Unknown'} is unavailable or blocked`);
                }
                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.quantity < item.quantity) {
                    return res.redirect(`/cart?error=Insufficient stock for ${product.productName} (Size: ${item.size})`);
                }
            }

            // Prepare cartItems from cart
            cartItems = userCart.items.map(item => ({
                productId: item.productId,
                size: item.size,
                sku: item.sku,
                color: item.productId.color || 'N/A',
                quantity: item.quantity,
                price: item.productId.salePrice,
                total: item.productId.salePrice * item.quantity,
            }));

            subtotal = userCart.items.reduce((total, item) => {
                return item.productId ? total + item.productId.salePrice * item.quantity : total;
            }, 0);

            deliveryCharge = subtotal >= 3000 ? 0 : 50;
            total = subtotal + deliveryCharge;

            // Save delivery charge in cart
            userCart.deliveryCharge = deliveryCharge;
            await userCart.save();

            // Coupons
            const coupons = await Coupon.find({ isListed: true, isPublic: true, amount: { $lte: subtotal } }).sort({ amount: -1 });
            availableCoupons = coupons.filter(c => !c.usedBy.includes(userId));
        }

        console.log("CartItems ======: ",cartItems)

        // 4. Render checkout
        return res.render('checkout', {
            user,
            userAddress,
            cartItems,
            availableCoupons,
            subtotal,
            total,
            deliveryCharge,
            wallet,
            retryOrderId: req.query.orderId || null,
        });

    } catch (error) {
        console.error('Error in loading checkout page', error);
        res.redirect('/pageNotFound');
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode, userId, orderId } = req.body;

        const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
        if (!coupon) {
            return res.status(400).json({ success: false, message: 'This Coupon is currently unavailable' });
        }
        if (coupon.expireOn < new Date()) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }
        if (coupon.usedBy.length >= coupon.maxUsage) {
            return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
        }
        if (coupon.usedBy.includes(userId)) {
            return res.status(400).json({ success: false, message: "Coupon already used by this user" });
        }

        let items = [];
        let subtotal = 0;
        let deliveryCharge = 50;

        if (orderId) {
            // Retry payment: get items from failed order
            const order = await Order.findOne({ orderId, userId });
            if (!order || order.paymentStatus !== 'Failed') {
                return res.status(400).json({ success: false, message: 'Order not found or not eligible for coupon' });
            }
            items = order.orderedItems;
            subtotal = order.totalPrice;
            deliveryCharge = order.deliveryCharge || (subtotal >= 3000 ? 0 : 50);
        } else {
            // Normal checkout: get items from cart
            const userCart = await Cart.findOne({ userId }).populate('items.productId');
            if (!userCart || userCart.items.length === 0) {
                return res.status(400).json({ success: false, message: 'No items in cart' });
            }
            items = userCart.items;
            subtotal = userCart.items.reduce((total, item) => {
                return item.productId ? total + item.productId.salePrice * item.quantity : total;
            }, 0);
            deliveryCharge = subtotal >= 3000 ? 0 : 50;
        }

        if (subtotal < coupon.minimumPrice) {
            return res.status(400).json({ success: false, message: `Minimum order amount ₹${coupon.minimumPrice} required to use this coupon` });
        }

        const discount = Math.min(coupon.amount, subtotal);
        const total = subtotal - discount + deliveryCharge;

        return res.status(200).json({
            success: true,
            message: 'Coupon applied successfully',
            coupon,
            newTotals: {
                discount,
                subtotal,
                deliveryCharge,
                total
            }
        });
    } catch (error) {
        console.log("Error in apply coupon : ", error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const placeOrder = async (req,res)=>{
    try {
        const { userId, addressId, paymentMethod, couponCode ,orderId } = req.body;

        const userAddressDoc = await Address.findOne({userId});
        const selectedAddress = userAddressDoc.address.id(addressId);
        const clonedAddress = structuredClone(selectedAddress.toObject());

        if(!userId) return res.status(400).json({success: false, message:'user id is undefined'});
        if(!addressId) return res.status(400).json({success: false, message:'address is missing'});
        if(!paymentMethod) return res.status(400).json({success: false, message:'paymernt method is missing'});

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if(orderId){
            const order = await Order.findOne({orderId});
            
            if(!order){
                return res.status(400).json({success:false,messages:'Order not found'});
            }

            let discount = 0;
            let couponApplied = false;

            if(couponCode){
                const coupon = await Coupon.findOne({code:couponCode});

                if(!coupon){
                    return res.status(400).json({success:false,message:'Invalid or inactive coupon'})
                }

                const now = new Date();

                if(coupon.expireOn < now){
                    return res.status(400).json({success:false,message:'Coupon has expired'})
                }

                if(coupon.usedBy.includes(userId)){
                    return res.status(400).json({success:false,message:'You have already used this coupon '})
                }

                if(order.totalPrice < coupon.minimumPrice){
                    return res.status(400).json({success:false,message:`Minimum Order amount ₹${coupon.minimumPrice} required to use this coupon`});
                }

                discount = coupon.amount;
                couponApplied = true;
                coupon.usedBy.push(userId);

                await coupon.save();
            }

            const couponAmountToEach = discount / order.orderedItems.length;

            for(let item of order.orderedItems){
                item.price = (item.price * item.quantity) - couponAmountToEach;

                item.status = 'Pending';
            }

            const currentOrderTotal = order.totalPrice;
            const newTotal = currentOrderTotal - discount;

            order.totalPrice = newTotal;
            order.finalAmount = newTotal + order.deliveryCharge;
            order.discount = discount;
            order.couponApplied = couponApplied;
            order.status = 'Pending';
            order.paymentStatus = paymentMethod === 'cod' ? 'Pending' : 'Completed';
            order.paymentMethod = paymentMethod;
            order.address = clonedAddress;

            await order.save();

            for(let item of order.orderedItems){
                const product = await Product.findById(item.product);

                if(!product) continue;

                const variant = product.variants.find(v => 
                    v.sku === item.sku && v.size === item.size
                )

                if(variant){
                    variant.quantity -= item.quantity;
                    
                    await product.save();
                }
            }

            if(paymentMethod === 'wallet'){
                await Wallet.updateOne(
                    {userId},
                    {
                        $inc:{balance : - order.finalAmount},
                        $push:{
                            transactions:{
                                type: 'debit',
                                amount: order.finalAmount,
                                reason: 'Wallet payment',
                                orderId
                            }
                        }
                    }
                )
            }

            // session hanlding
            req.session.orderSuccess = null;
            return res.status(200).json({success:true,orderId})

        }else{

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
                const discountedPrice = (item.productId.salePrice * item.quantity) - couponAmountToEach;
                return {
                    product: item.productId._id,
                    quantity: item.quantity,
                    price: discountedPrice < 0 ? 0 : discountedPrice,
                    sku: item.sku,
                    size: item.size,
                    status: 'Pending'
                };
            });
        
            const recalculatedTotal = orderedItems.reduce((sum, item) => sum + item.price, 0);

            const deliveryCharge = totalPrice >= 3000 ? 0 : 50;
            
            const finalAmount = recalculatedTotal + deliveryCharge;

            console.log('============>',paymentMethod)

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
            req.session.orderSuccess = null;
            return res.status(200).json({success:true,orderId:newOrder.orderId});

        }

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
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
            if (coupon) {
                discount = coupon.amount;
            }
        }
        // const finalAmount = subtotal - discount + deliveryCharge;

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

// const verifyRazorpayPayment = async(req,res)=>{
//     try {
//         const {
//             razorpay_payment_id,
//             razorpay_order_id,
//             razorpay_signature,
//             addressId,
//             userId,
//             couponCode
//         } = req.body;

//         if(!razorpay_payment_id || !razorpay_order_id || !razorpay_signature){
//             return res.status(400).json({success:false,message:"Missing Razorpay credentials"});
//         }

//         // 1 generate expected signature
//         const generated_signature = Crypto
//             .createHmac('sha256',process.env.RAZORPAY_KEY_SECRET)
//             .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//             .digest('hex');

//         // 2 compare signatures
//         if(generated_signature !== razorpay_signature){
//             console.log('in gen sign and raz sign comapre')
//             return res.status(400).json({success:false,message:'Payment verification failed'});
//         }


//         return res.status(200).json({success:true,message:'Payment verified and order palced'});
//     } catch (error) {
//         console.error("Payment verification error:", error);
//         return res.status(500).json({ success: false, message: "Internal server error" })
//     }
// }
// POST /verify-razorpay-payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderId, // may be undefined for normal payment
      couponCode,
      addressId,
    } = req.body;

    

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing Razorpay credentials" });
    }

    // Signature verification
    const generated_signature = Crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    if (orderId) {
      // Retry payment: update existing order
      const order = await Order.findOne({ orderId });
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      const addressDoc = await Address.findOne({userId:order.userId});
      const selectedAddress = addressDoc.address.id(addressId);
      const clonedAddress = structuredClone(selectedAddress.toObject());

      
        let discount = 0;
        let couponApplied= false;
        
        if (couponCode) {

            const coupon = await Coupon.findOne({ code: couponCode });
            if(!coupon){
                return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
            }

            const now = new Date();
            if(now > coupon.expireOn){
                return res.status(400).json({success:false,message: 'Coupon has expired'});
            }

            if(coupon.usedBy.includes(order.userId)){
                return res.status(400).json({ success: false, message: 'You have already used this coupon' });
            }
            if(order.totalPrice < coupon.minimumPrice){
                return res.status(400).json({success: false, message: `Minimum order amount ₹${coupon.minimumPrice} required to use this coupon`})
            }

            discount = coupon.amount;
            couponApplied = true;

            coupon.usedBy.push(order.userId);
            await coupon.save();
        }

        // calculating coupon amount for each item
        const couponAmountToEach = discount/order.orderedItems.length;

        order.orderedItems.map(item => item.price =  (item.price * item.quantity)  - couponAmountToEach);
        order.orderedItems.map(item => item.status = 'Pending');

        const currentOrderTotal = order.totalPrice;
        const newTotal = currentOrderTotal - discount;

        order.address = clonedAddress;
        order.totalPrice = newTotal;
        order.finalAmount = newTotal + order.deliveryCharge;
        order.discount = discount;
        order.couponApplied = couponApplied;
        order.paymentStatus = 'Completed';
        order.status = 'Pending';
        order.razorpayPaymentId = razorpay_payment_id;

        await order.save();

        for(let item of order.orderedItems){
            const product = await Product.findOne({_id:item.product});

            if(!product) continue;

            const variant = product.variants.find(v => 
                v.sku === item.sku && v.size === item.size
            );

            if(variant){
                variant.quantity -= item.quantity;

                await product.save();
            }
        }

      return res.status(200).json({ success: true, message: 'Payment verified and order placed' });
    } else {
      // Normal payment: just verify, let frontend create order after this
      return res.status(200).json({ success: true, message: 'Payment verified' });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
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

// const paymentFailed = async(req,res)=>{
//     try {
//         const {userId,addressId,paymentMethod,couponCode} = req.body;

//         if(!userId){
//             return res.status(400).json({success:false, message: 'Unauthorized user'});
//         }
//         const addressDoc = await Address.findOne({userId:userId});
//         const selectedAddress = await addressDoc.address.id(addressId);

//         if(!selectedAddress){
//             return res.status(400).json({success:false,message:'Invalid address'});
//         }

//         const clonedAddress = structuredClone(selectedAddress.toObject())
//     } catch (error) {
        
//     }
// }

// POST /payment-failed
const paymentFailed = async (req, res) => {
  try {
    const { userId, addressId, paymentMethod, couponCode } = req.body;

    if (!userId) return res.status(400).json({ success: false, message: 'Unauthorized user' });

    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(addressId);
    if (!selectedAddress) return res.status(400).json({ success: false, message: 'Invalid address' });

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let discount = 0;
    let couponApplied = false;

    // Coupon validation but DO NOT mark as used
    // if (couponCode) {
    //   const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
    //   if (coupon) {
    //     const now = new Date();
    //     if (now <= coupon.expireOn && !coupon.usedBy.includes(userId) && totalPrice >= coupon.minimumPrice) {
    //       discount = coupon.amount;
    //     //   couponApplied = true;
    //     }
    //   }
    // }

    // const couponAmountToEach = discount / cart.items.length;

    const orderedItems = cart.items.map(item => {
      const discountedPrice = item.productId.salePrice //- couponAmountToEach;
      return {
        product: item.productId._id,
        quantity: item.quantity,
        price: discountedPrice < 0 ? 0 : discountedPrice,
        sku: item.sku,
        size: item.size,
        status: 'Payment Failed'
      };
    });

    const recalculatedTotal = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryCharge = totalPrice >= 3000 ? 0 : 50;
    const finalAmount = recalculatedTotal + deliveryCharge;

    // Save order with failed status
    const newOrder = new Order({
      orderedItems,
      totalPrice,
      discount,
      finalAmount,
      address: structuredClone(selectedAddress.toObject()),
      invoiceDate: new Date(),
      status: 'Payment Failed',
      couponApplied,
      paymentMethod,
      paymentStatus: 'Failed',
      userId,
      deliveryCharge,
      couponCode: couponCode || null
    });
    await newOrder.save();

    // Clear cart
    cart.items = [];
    await cart.save();

    return res.status(200).json({ success: true, orderId: newOrder.orderId });
  } catch (error) {
    console.error('Payment failed error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};


// POST /retry-razorpay-order
const retryRazorpayOrder = async (req, res) => {
  try {
    const { orderId, couponCode } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentStatus === 'Completed') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // If couponCode is sent, validate and apply it
    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
      if (coupon) {
        discount = coupon.amount;
      }
    }
    // Use the order's subtotal, not finalAmount, to recalculate
    const subtotal = order.totalPrice;
    const deliveryCharge = order.deliveryCharge || (subtotal >= 3000 ? 0 : 50);
    const finalAmount = subtotal - discount + deliveryCharge;

    // Create new Razorpay order
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: 'INR',
      receipt: `retry_order_rcpt_${Date.now()}`,
      notes: {
        userId: order.userId,
        orderId: order.orderId,
        couponCode: couponCode || order.couponCode || '',
      },
    });

    // Optionally, save the new razorpayOrderId in your order for tracking
    order.razorpayOrderId = razorpayOrder.id;
    order.discount = discount;
    order.finalAmount = finalAmount;
    order.couponCode = couponCode || order.couponCode || '';
    await order.save();

    return res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error) {
    console.error('Retry Razorpay order error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getPaymentFailed = async(req,res)=>{
    try {
        const userId = req.session.user;
        const {orderId} = req.query;

        const order = await Order.findOne({orderId:orderId});

        const user = await User.findOne({_id:userId});
        res.render('payment-failed',{
            user,
            order
        });
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
    paymentFailed,
    getPaymentFailed,
    retryRazorpayOrder

}