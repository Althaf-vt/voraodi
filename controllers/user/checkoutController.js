const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const { assertOrderOwnership } = require('../../utils/orderAuth');
const { getCashfreeInstance } = require('../../utils/cashfreeClient');
const { withTransaction } = require('../../utils/withTransaction');
const {
    fulfillRetryOrder,
    fulfillNewOrderFromCart,
} = require('../../services/orderFulfillment');
const {
    fulfillCapturedPayment: fulfillCashfreeCapturedPayment,
    upsertCashfreePaymentIntent,
} = require('../../services/cashfreeFulfillment');
const {
    assertValidPaymentMethod,
} = require('../../utils/paymentValidation');


const checkStock = async (req, res) => {
    try {
        const userId = req.session.user;
        const userCart = await Cart.findOne({ userId: userId });

        for (const item of userCart.items) {
            const product = await Product.findById(item.productId).populate('category');

            if (!product) {
                return res.status(400).json({ success: false, message: `Product not found for ID : ${item.productId}` });
            }
            if (product.isBlocked === true) {
                return res.status(400).json({ success: false, message: `The product"${product.productName}" is currently unavailable. Please update your cart.` });
            }
            if (product.category.isListed === false) {
                return res.status(400).json({ success: false, message: `The "${product.category.name}" category is currently unavailable. Please update your cart.` })
            }

            const variant = product.variants.find(v => v.sku === item.sku);

            if (!variant) {
                return res.status(400).json({ success: false, message: `Variant not found for product : ${product.productName}` })
            }

            if (item.quantity > variant.quantity) {
                return res.status(400).json({
                    success: false,
                    stockAvailable: false,
                    message: `Insufficient stock for ${product.productName} (Size: ${item.size}) - Available Qty: ${variant.quantity}, Requested Qty: ${item.quantity}`
                })
            }
        }

        return res.status(200).json({ success: true, stockAvailable: true, });

    } catch (error) {
        console.error("Stock check error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const loadCheckout = async (req, res, next) => {
    try {
        // 1. Order success session check
        if (req.session.orderSuccess && !req.query.orderId) {
            req.session.orderSuccess = false;
            return res.redirect('/shop');
        }

        const userId = req.session.user;
        const { orderId } = req.query;
        const isPaymentFailed = !!orderId;

        // Fetch user, address, wallet
        const user = await User.findById(userId);

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }
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
                const err = new Error("Order not found or not eligible for retry");
                err.statusCode = 400;
                throw err;
            }

            // Stock check
            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    const err = new Error(`Product ${item.product?.productName || "Unknown"} is unavailable`);
                    err.statusCode = 400;
                    throw err;
                }
                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.quantity < item.quantity) {
                    const err = new Error(`Insufficient stock for ${product.productName} (Size: ${item.size})`);
                    err.statusCode = 400;
                    throw err;
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
                const err = new Error("Your cart is empty");
                err.statusCode = 400;
                throw err;
            }

            // Stock check
            for (const item of userCart.items) {
                const product = item.productId;
                if (!product || product.isBlocked) {
                    const err = new Error(`Product ${product?.productName || "Unknown"} is unavailable`);
                    err.statusCode = 400;
                    throw err;
                }
                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.quantity < item.quantity) {
                    const err = new Error(`Insufficient stock for ${product.productName} (Size: ${item.size})`);
                    err.statusCode = 400;
                    throw err;
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
        next(error);
    }
};

const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        const { couponCode, orderId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

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
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const {
            addressId,
            paymentMethod,
            couponCode,
            orderId,
        } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'address is missing' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'payment method is missing' });
        }

        try {
            assertValidPaymentMethod(paymentMethod);
        } catch (validationError) {
            return res.status(validationError.statusCode || 400).json({
                success: false,
                message: validationError.message,
            });
        }

        // Cashfree payments must go through /verify-cashfree-payment, not placeOrder
        if (paymentMethod === 'cashfree') {
            return res.status(400).json({
                success: false,
                message: 'Cashfree payments must be verified via /verify-cashfree-payment',
            });
        }

        const userAddressDoc = await Address.findOne({ userId });
        if (!userAddressDoc) {
            return res.status(400).json({ success: false, message: 'No addresses found' });
        }
        const selectedAddress = userAddressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }
        const clonedAddress = structuredClone(selectedAddress.toObject());

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        let completedOrderId;

        if (orderId) {
            completedOrderId = await withTransaction(async (session) => {
                const order = await Order.findOne({ orderId, userId }).session(session);
                if (!order) {
                    throw Object.assign(new Error('Order not found'), { statusCode: 400 });
                }
                return fulfillRetryOrder({
                    order,
                    userId,
                    paymentMethod,
                    couponCode,
                    clonedAddress,
                    session,
                });
            });
        } else {
            completedOrderId = await withTransaction(async (session) =>
                fulfillNewOrderFromCart({
                    userId,
                    paymentMethod,
                    couponCode,
                    clonedAddress,
                    session,
                })
            );
        }

        req.session.orderSuccess = true;
        return res.status(200).json({ success: true, orderId: completedOrderId });
    } catch (error) {
        console.error('Order placement error:', error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


/**
 * POST /create-cashfree-order
 *
 * Creates a Cashfree order and returns the payment_session_id to the frontend.
 * The frontend uses this (no public key needed) to redirect to Cashfree checkout.
 */
const createCashfreeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const { addressId, couponCode } = req.body;
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc?.address?.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const subtotal = cart.items.reduce((acc, item) =>
            item.productId ? acc + item.productId.salePrice * item.quantity : acc, 0);

        let discount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
            if (coupon) discount = coupon.amount;
        }

        const deliveryCharge = subtotal >= 3000 ? 0 : 50;
        const finalAmount = subtotal - discount + deliveryCharge;

        // Use a unique order ID for Cashfree (their order_id must be unique per account)
        const cfOrderId = `app_${Date.now()}_${String(userId).slice(-6)}`;

        // Build the return URL — Cashfree GETs this after payment (success or failure)
        const protocol = req.protocol;
        const host = req.get('host');
        const returnUrl = `${protocol}://${host}/verify-cashfree-payment?order_id=${cfOrderId}`;

        const cashfree = getCashfreeInstance();
        const cfResponse = await cashfree.PGCreateOrder({
            order_id: cfOrderId,
            order_amount: parseFloat(finalAmount.toFixed(2)),
            order_currency: 'INR',
            customer_details: {
                customer_id: String(userId),
                customer_phone: user.phone || '9999999999',
                customer_name: user.name || '',
                customer_email: user.email || '',
            },
            order_meta: {
                return_url: returnUrl,
            },
            // order_tags are sent back in webhooks so we can fulfill without session
            order_tags: {
                userId:     String(userId),
                addressId:  String(addressId),
                couponCode: couponCode || '',
            },
        });

        const sessionId = cfResponse?.data?.payment_session_id;
        if (!sessionId) {
            console.error('Cashfree PGCreateOrder response missing payment_session_id:', cfResponse?.data);
            return res.status(500).json({ success: false, message: 'Failed to create Cashfree order' });
        }

        await upsertCashfreePaymentIntent({
            cashfreeOrderId: cfOrderId,
            userId,
            addressId,
            couponCode,
            amountPaise: Math.round(finalAmount * 100),
            flow: 'new_cart',
        });

        return res.json({
            success: true,
            cashfreeOrderId: cfOrderId,
            paymentSessionId: sessionId,
        });

    } catch (error) {
        console.error('Error creating Cashfree order:', error?.response?.data || error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


/**
 * GET /verify-cashfree-payment?order_id=<cfOrderId>
 *
 * Cashfree redirects the browser here after payment (success or failure).
 * We server-poll PGFetchOrder to confirm the real status — never trust
 * client-side redirect params alone.
 *
 * Flow:
 *  PAID        → run fulfillCapturedPayment → redirect to /order-success/:id
 *  ACTIVE/etc  → payment failed → create failed order → redirect to /payment-failed
 */
const verifyCashfreePayment = async (req, res, next) => {
    try {
        const { order_id: cashfreeOrderId } = req.query;
        const sessionUserId = req.session.user;

        const PaymentIntent = require('../../models/paymentIntentSchema');
        const intent = await PaymentIntent.findOne({ cashfreeOrderId });

        if (!sessionUserId) {
            return res.redirect('/signin');
        }
        if (!cashfreeOrderId) {
            return res.redirect('/checkout');
        }

        // Server-side status poll — the authoritative source of truth
        const cashfree = getCashfreeInstance();
        let cfOrder;
        try {
            const response = await cashfree.PGFetchOrder(cashfreeOrderId);
            cfOrder = response?.data;
        } catch (fetchErr) {
            console.error('PGFetchOrder error:', fetchErr?.response?.data || fetchErr);
            return res.redirect(`/checkout?error=payment_verify_failed`);
        }

        if (!cfOrder) {
            return res.redirect('/checkout?error=order_not_found');
        }

        const orderStatus = cfOrder.order_status; // 'PAID' | 'ACTIVE' | 'EXPIRED' | etc.

        if (orderStatus === 'PAID') {
            // Retrieve the payment ID from the payments list on the order
            const cfPaymentId = cfOrder.cf_order_id
                ? String(cfOrder.cf_order_id)
                : cashfreeOrderId; // fallback — use order ID as payment ID sentinel

            const result = await withTransaction((session) =>
                fulfillCashfreeCapturedPayment({
                    cashfreePaymentId: cfPaymentId,
                    cashfreeOrderId,
                    userId: sessionUserId,
                    // Pass fields from the intent directly if found (though the service
                    // now correctly falls back to its own intent lookup too)
                    addressId:  intent?.addressId  || null,
                    couponCode: intent?.couponCode || '',
                    appOrderId: intent?.appOrderId || null,
                    session,
                })
            );

            req.session.orderSuccess = true;
            return res.redirect(`/order-success/${result.orderId}`);
        }

        // Payment did not succeed — create a failed order record so the user can retry
        const addressId  = intent?.addressId  || null;
        const couponCode = intent?.couponCode || '';

        // Reuse the existing paymentFailed logic by calling it programmatically
        const fakedReq = {
            session: req.session,
            body: { addressId, paymentMethod: 'cashfree', couponCode },
        };
        let failedOrderId = null;
        const fakedRes = {
            status: () => ({
                json: (data) => { failedOrderId = data?.orderId; }
            }),
        };

        // Call the paymentFailed handler inline to create the failed order record
        await paymentFailed(fakedReq, fakedRes);

        if (failedOrderId) {
            return res.redirect(`/payment-failed?orderId=${failedOrderId}`);
        }
        return res.redirect('/payment-failed');

    } catch (error) {
        console.error('verifyCashfreePayment error:', error);
        next(error);
    }
};

const orderSuccess = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const { id } = req.params;

        req.session.orderSuccess = true;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }

        const order = await Order.findOne({ orderId: id, userId }).populate('orderedItems.product');
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            const err = new Error(ownership.message);
            err.statusCode = ownership.status;
            throw err;
        }

        return res.render('orderSuccess', {
            order: order,
            user,
        });
    } catch (error) {
        next(error);
    }
}

const paymentFailed = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, paymentMethod, couponCode } = req.body;

        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized user' });

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
            const lineTotal = item.productId.salePrice * item.quantity;
            return {
                product: item.productId._id,
                quantity: item.quantity,
                price: lineTotal,
                sku: item.sku,
                size: item.size,
                status: 'Payment Failed'
            };
        });

        const recalculatedTotal = orderedItems.reduce((sum, item) => sum + item.price, 0);
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

        req.session.orderSuccess = true;

        return res.status(200).json({ success: true, orderId: newOrder.orderId });
    } catch (error) {
        console.error('Payment failed error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


/**
 * POST /retry-cashfree-order
 *
 * Creates a new Cashfree order for a Payment Failed order so the user can retry.
 */
const retryCashfreeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { orderId, couponCode } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const order = await Order.findOne({ orderId, userId });
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            return res.status(ownership.status).json({ success: false, message: ownership.message });
        }

        if (order.paymentStatus === 'Completed') {
            return res.status(400).json({ success: false, message: 'Order already paid' });
        }

        if (order.status !== 'Payment Failed' && order.paymentStatus !== 'Failed') {
            return res.status(400).json({ success: false, message: 'Order not eligible for retry' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let discount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode, isListed: true });
            if (coupon) discount = coupon.amount;
        }

        const subtotal = order.totalPrice;
        const deliveryCharge = order.deliveryCharge || (subtotal >= 3000 ? 0 : 50);
        const finalAmount = subtotal - discount + deliveryCharge;

        const cfOrderId = `retry_${Date.now()}_${String(order.orderId).slice(-6)}`;

        const protocol = req.protocol;
        const host = req.get('host');
        const returnUrl = `${protocol}://${host}/verify-cashfree-payment?order_id=${cfOrderId}`;

        const cashfree = getCashfreeInstance();
        const cfResponse = await cashfree.PGCreateOrder({
            order_id: cfOrderId,
            order_amount: parseFloat(finalAmount.toFixed(2)),
            order_currency: 'INR',
            customer_details: {
                customer_id: String(userId),
                customer_phone: user.phone || '9999999999',
                customer_name:  user.name  || '',
                customer_email: user.email || '',
            },
            order_meta: {
                return_url: returnUrl,
            },
            order_tags: {
                userId:     String(order.userId),
                orderId:    order.orderId,          // marks this as a retry
                addressId:  String(order._id),
                couponCode: couponCode || order.couponCode || '',
            },
        });

        const sessionId = cfResponse?.data?.payment_session_id;
        if (!sessionId) {
            console.error('retryCashfreeOrder: missing payment_session_id', cfResponse?.data);
            return res.status(500).json({ success: false, message: 'Failed to create Cashfree retry order' });
        }

        // Store the new Cashfree order ID on the failed order record
        order.cashfreeOrderId = cfOrderId;
        order.discount = discount;
        order.finalAmount = finalAmount;
        order.couponCode = couponCode || order.couponCode || '';
        await order.save();

        await upsertCashfreePaymentIntent({
            cashfreeOrderId: cfOrderId,
            userId: order.userId,
            addressId: String(order._id),
            couponCode: couponCode || order.couponCode || '',
            amountPaise: Math.round(finalAmount * 100),
            flow: 'retry',
            appOrderId: order.orderId,
        });

        return res.json({
            success: true,
            cashfreeOrderId: cfOrderId,
            paymentSessionId: sessionId,
        });
    } catch (error) {
        console.error('Retry Cashfree order error:', error?.response?.data || error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getPaymentFailed = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const { orderId } = req.query;

        const order = await Order.findOne({ orderId, userId });
        const ownership = assertOrderOwnership(order, userId);
        if (!ownership.ok) {
            const err = new Error(ownership.message);
            err.statusCode = ownership.status;
            throw err;
        }

        const user = await User.findOne({ _id: userId });
        if (!user) {
            const err = new Error("User not found");
            err.statusCode = 404;
            throw err;
        }
        res.render('payment-failed', {
            user,
            order
        });
    } catch (error) {
        next(error);
    }
}



module.exports = {
    checkStock,
    loadCheckout,
    placeOrder,
    applyCoupon,
    createCashfreeOrder,
    verifyCashfreePayment,
    retryCashfreeOrder,
    orderSuccess,
    paymentFailed,
    getPaymentFailed,
}