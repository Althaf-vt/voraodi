const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');



const productDetails = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;
        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;


        const relatedProducts = await Product.find({
            _id: { $ne: productId },
            category: findCategory._id,
            isBlocked: false,
            quantity: { $gt: 0 },
        })
        .limit(4)
        .sort({ createdOn: -1 });

        
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

module.exports = {
    productDetails,
    quickView
}