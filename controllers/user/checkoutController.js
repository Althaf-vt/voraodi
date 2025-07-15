const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Product = require('../../models/productSchema');


const loadCheckout = async(req,res)=>{
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const userCart = await Cart.findOne({userId}).populate('items.productId');
        const userAddressData = await Address.findOne({userId});

        const cartItems = userCart ? userCart.items : [];
        const userAddress = userAddressData ? userAddressData.address : [];


        return res.render('checkout',{
            user,
            userAddress,
            cartItems,

        });

    } catch (error) {
        console.log('Error in loading checkout page',error);
        res.redirect('/pageNotFound');
    }
}

const orderDone = async (req,res)=>{
    try {
        console.log('Received body:', req.body);
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

        // calculate price
        const orderedItems = cart.items.map(item =>({
            product : item.productId._id,
            quantity: item.quantity,
            price: item.productId.salePrice,
            sku: item.sku,
            size: item.size,
            status: 'Pending' 
        }));

        const totalPrice = orderedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const deliveryCharge = orderedItems.reduce((sum,item) => sum + item.quantity * 40, 0);
        
        //coupon handling
        let discount = 0;

        let couponApplied = false;

        if(couponCode){
            const coupon = await Coupon.findOne({name: couponCode, isList: true});
            if(!coupon){
                return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
            }

            const now = new Date();
            if(now > coupon.expireOn){
                return res.status(400).json({success: false, message: 'Coupon has expired'});
            }

            if(coupon.userId.includes(userId)){
                return res.status(400).json({ success: false, message: 'You have already used this coupon' });
            }

            if(totalPrice < coupon.minimumPrice){
                return res.status(400).json({success: false, message: `Minimum order amount ₹${coupon.minimumPrice} required to use this coupon`})
            }

            discount = coupon.offerPrice;
            couponApplied = true;

            coupon.userId.push(userId);
            await coupon.save();
        }

        const finalAmount = totalPrice - discount;

        // console.log(clonedAddress);

        const newOrder = new Order({
            orderedItems,
            totalPrice : totalPrice + deliveryCharge,
            discount,
            finalAmount,
            address: clonedAddress,
            invoiceDate: new Date(),
            status: 'Pending',
            couponApplied,
            paymentMethod,
            userId: userId,
        })
        await newOrder.save();


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

        const populateOrder = await Order.findById(newOrder._id).populate('orderedItems.product');
        return res.render('orderSuccess',{ order: populateOrder });
    } catch (error) {
        console.error('Order placement error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }   
}

module.exports ={
    loadCheckout,
    orderDone
}