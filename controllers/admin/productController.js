const Product = require('../../models/ProductSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const getAddProduct = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true });
        res.render('add-product', {
            categories: category
        });
    } catch (error) {
        res.redirect('/pageError');
    }
};

const addProduct = async (req, res) => {
    try {
        const product = req.body;
        const productExists = await Product.findOne({ productName: product.productName });

        if (!productExists) {
            const images = [];

            const imageFolderPath = path.join(__dirname, '../../public/uploads/product-images');
            if (!fs.existsSync(imageFolderPath)) {
                fs.mkdirSync(imageFolderPath, { recursive: true });
            }

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const filename = `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}.png`;
                    const resizedImagePath = path.join(imageFolderPath, filename);

                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);
                    fs.unlinkSync(originalImagePath);
                    images.push(`/uploads/product-images/${filename}`);
                }
            }

            const categoryId = await Category.findById(product.category);
            if (!categoryId) {
                return res.status(400).json({ message: 'Invalid Category ID' });
            }

            const newProduct = new Product({
                productName: product.productName,
                description: product.description,
                category: categoryId._id,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                createdOn: new Date(),
                quantity: product.quantity,
                size: product.size,
                color: product.color,
                productImage: images,
                status: "Available",
            });

            await newProduct.save();
            return res.status(200).json({ success: true });
        } else {
            return res.status(400).json({ message: 'Product already exists, please try with another name' });
        }
    } catch (error) {
        console.error('Error saving product:', error);
        return res.status(500).json({ message: 'Failed to add product. Please try again.' });
    }
};

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = req.query.page || 1;
        const limit = 4;

        // Search product with name
        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ]
        }).limit(limit * 1).skip((page - 1) * limit).populate('category').exec();

        const count = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ]
        }).countDocuments();

        const category = await Category.find({ isListed: true });

        if (category) {
            return res.render('products', {
                data: productData,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                cate: category,
                search: search // Add search to template data
            });
        } else {
            return res.render('pageError');
        }
    } catch (error) {
        return res.redirect('/pageError');
    }
};

const addProductOffer = async(req,res)=>{
    try {
        const {productId,percentage} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const findCategory = await Category.findOne({_id:findProduct.category});
        if(findCategory.categoryOffer > percentage){
            return res.json({status:false, message:"This product's category already has a category offer"});
        }
        findProduct.salePrice = Math.floor(findProduct.regularPrice * ((100 - percentage) / 100));
        findProduct.productOffer = parseInt(percentage);
        await findProduct.save();
        findCategory.categoryOffer = 0;
        await findCategory.save();
        res.json({status: true});
    } catch (error) {
        console.log(error)
        res.redirect('/pageError');
        res.status(500).json({status:false, message:"Internal Server Error"})
    }
}

const removeProductOffer = async (req,res)=>{
    try {
        const {productId} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.regularPrice;
        findProduct.productOffer = 0;
        await findProduct.save();
        res.json({status:true});

    } catch (error) {
        console.log(error)
        res.redirect("/pageError");

    }
}

const blockProduct = async(req,res)=>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
       return res.redirect('/admin/products');

    } catch (error) {
        console.log(error);
        res.redirect('/pageError');
    }
}

const unblockProduct = async (req,res) =>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        return res.redirect('/admin/products');
    } catch (error) {
        console.log(error);
        res.redirect('/pageError');
    }
}

const getEditProduct = async (req,res)=>{
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        const category = await Category.find({});
        res.render('edit-product',{
            product: product,
            cat: category
        })
    } catch (error) {
        console.log(error);
        res.redirect("/pageError");
    }
}

const editProduct = async(req,res)=>{
    try {
        const id = req.params.id;
        const product = await Product.findOne({_id:id});
        const data = req.body;
        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id:{$ne:id}
        })

        if(existingProduct){
            return res.status(400).json({error:'Product with this name already exists. Please try with another name'});
        }

        // const images = [];

        // if(req.files && req.files.length > 0){
        //     for(let i = 0; i < req.files.length; i ++){
        //         images.push(req.files[i].filename);
        //     }
        // }

        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(`/uploads/product-images/${req.files[i].filename}`);
            }
        }

        // Handle existing images
        const existingImages = Array.isArray(data.existingImages)
            ? data.existingImages
            : data.existingImages
            ? [data.existingImages]
            : [];

        const updateFields = {
            productName: data.productName,
           description: data.description,
            category: data.category,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            quantity: parseInt(data.quantity),
            // size: data.size,
            color: data.color,
            productImage: [...existingImages, ...images] // Combine existing and new images

        }

        // if(req.files.length > 0){
        //     //// updateFields.$push = {productImage:{$each:images}};
        //     updateFields.productImage = [...(product.productImage || []), ...images];

        // }

        const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, { new: true });
        if (!updatedProduct) {
            return res.status(500).json({ status: false, error: 'Failed to update product in database' });
        }
        //// await Product.findByIdAndUpdate(id,updateFields,{new:true});
        // res.redirect('/admin/products');
        res.json({ status: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error('Error in editProduct:',error);
        // res.redirect('/pageError')
        res.status(500).json({ status: false, error: 'Failed to update product' });

    }
}

const deleteSingleImage = async(req,res)=>{
    try {
        const {imageNameToServer,productIdToServer} = req.body;
        const updatedProduct = await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
        if (!updatedProduct) {
            return res.status(500).json({ status: false, error: 'Failed to update product images' });
        }

        const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', path.basename(imageNameToServer));        
        // if(fs.existsSync(imagePath)){
        //     await fs.unlinkSync(imagePath);
        //     console.log(`Image ${imageNameToServer} deleted successfully`);
        // }else{
        //     console.log(`Image ${imageNameToServer} not found`);
        // }

        try {
            await fs.unlink(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        } catch (err) {
            console.warn(`Image ${imageNameToServer} not found on disk:`, err.message);
        }

        // res.send({status:true});
        res.json({ status: true, message: 'Image deleted successfully' });
    } catch (error) {
        // console.error(error)
        // res.redirect('/pageError');
        console.error('Error in deleteSingleImage:', error);
        res.status(500).json({ status: false, error: 'Failed to delete image' });
    }
}


module.exports = {
    getAddProduct,
    addProduct,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage

};