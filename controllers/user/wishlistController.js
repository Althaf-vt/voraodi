const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/whishlistSchema');
const Cart = require('../../models/cartSchema');


const loadWishlist = async(req,res)=>{
    try {
        const userId = req.session.user;

        let wishlist = await Wishlist.findOne({userId:userId}).populate('products.productId');

        return res.render('wishlist',{
            wishlistItems: wishlist ? wishlist.products : []
        })

    } catch (error) {
        console.log('Error while loading wishlist',error);
        return res.redirect('/pageNotFound');
    }
}

const checkStock = async (req, res) => {
    try {

        console.log('Body ==> ',req.body)
        const { productId,size } = req.body;

        console.log("productId : ",productId)
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v.size === size);

        if (!variant) {
            return res.status(400).json({ success: false, message: 'Variant not available' });
        }

        if (variant.quantity > 0) {
            return res.status(200).json({ success: true });
        } else {
            return res.status(400).json({ success: false, message: 'Product is currently out of stock' });
        }

    } catch (error) {
        console.error("Error in check stock:", error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


const addToCart = async(req,res)=>{
    try {
        const userId = req.session.user;
        console.log(req.body)
        const {productId,size} = req.body;

        const product = await Product.findOne({_id:productId,isBlocked:false});
        if(!product) return res.status(400).json({success:false,message:'Product is currently unavailable'})

        const productVariant = product.variants.find(variant => variant.size === size);
        if(!productVariant) return res.status(400).json({success:false,message:'Product variant is currently unavailable'})

        let cart = await Cart.findOne({userId:userId});

        if(!cart){
            cart = new Cart({
                userId,
                items: []
            })
        }

        console.log("======product Variant========= :",productVariant)

        // check if product + size in already in cart
        const itemIndex = cart.items.findIndex(item => item.productId.equals(productId) && item.size === size);

        //Product already in Cart , so update qty
        if(itemIndex > -1){
            const item = cart.items[itemIndex];
            item.quantity += 1;

            if(item.quantity > productVariant.quantity){
                return res.status(400).json({success:false,message:'Exceeds available stock'})
            }

            if(item.quantity > 3){
                return res.status(400).json({success:false,message:'Maximum of 3 quantities allowed. Your cart already contains 3.'})
            }

            item.totalPrice += item.price;
        }else{
            cart.items.push({
                productId,
                sku: productVariant.sku,
                size: size,
                quantity: 1,
                price: product.salePrice,
                totalPrice: product.salePrice,   
            })
        }

        await cart.save();

        console.log('Saved');

        const wishlist = await Wishlist.findOne({userId:userId})
        if(wishlist){
            await Wishlist.updateOne(
                {userId},
                {$pull:{products:{productId:productId}}}
            );
            console.log('removed');
        }else{
            return res.status(400).json({success:false,message:"Wishlist not found"})
        }
        
        return res.status(200).json({success:true,message:"Product added to cart"})
  
    } catch (error) {
        console.log('Error in Add to cart from wishlist',error);
        return res.status(500).json({success:false,message:'Internal Server Error'});
    }
}

module.exports = {
    loadWishlist,
    checkStock,
    addToCart
}