const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/whishlistSchema');



const productDetails = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;
        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;


        const relatedProducts = await Product.find({
            _id: { $ne: productId },
            category: findCategory._id,
            isBlocked: false,
            'variants.quantity': { $gt: 0 }
        })
        .limit(4)
        .sort({ createdAt: -1 });

        
        res.render('product-details',{
            user: userData,
            product: product,
            quantity: product.quantity,
            totalOffer: totalOffer,
            category: findCategory,
            relatedProducts

        })

    } catch (error) {
        console.log("Error in Product Detail page",error);
        res.redirect('/pageNotFound');
    }
}

const quickView = async(req,res)=>{
    try {
        const productId = req.query.id;
        const product = await Product.findOne({_id:productId})

        res.json({
            _id: product._id,
            productImage: product.productImage,
            productName: product.productName,
            description: product.description,
            salePrice: product.salePrice
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching product' });
    }
}

const addToWishlist = async(req,res)=>{
    try {
        const {productId} = req.body;
        const userId = req.session.user;

        const findProduct = await Product.findOne({_id:productId,isBlocked:false});

        const quantity =  findProduct.variants.reduce((qty,variant)=> qty + variant.quantity,0);

        if(quantity < 1){
            return res.status(400).json({success:false,message:'All variants are out of stock'})
        }

        let wishlist = await Wishlist.findOne({userId:userId});

        if(!wishlist){
            wishlist = new Wishlist({
                userId,
                products: [{
                    productId: findProduct._id,
                    addedOn: new Date(),
                }]
            });
        }else{
            const alreadyInWishlist = wishlist.products.some(p => 
                p.productId.toString() === findProduct._id.toString()
            );

            if(alreadyInWishlist){
                return res.status(400).json({success:false, message:'Product already in wishlist'});
            }

            wishlist.products.push({
                productId: findProduct._id,
                addedOn: new Date()
            });
        }

        await wishlist.save();

        return res.status(200).json({success:true, message:'Product added successfull'});


    } catch (error) {
        console.log("error when Adding to wishlist",error);
        return res.status(500).json({success:false,message:'Internal Server Error'})
    }
}

module.exports = {
    productDetails,
    quickView,
    addToWishlist
}