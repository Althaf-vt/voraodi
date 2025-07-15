const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// const { enabled } = require('../../server');

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
        console.log(req.body)
        const productExists = await Product.findOne({ 
            productName: { $regex: `^${product.productName}$`, $options: 'i' }
        });

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

            let variants = [];
            if (typeof product.variantData === 'string') {
                try {
                    variants = JSON.parse(product.variantData);
                } catch (err) {
                    return res.status(400).json({ message: 'Invalid varients format' });
                }
            }

            const newProduct = new Product({
                productName: product.productName,
                description: product.description,
                category: categoryId._id,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                createdOn: new Date(),
                color: product.color,
                variants: variants, //  added here
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
        const page = req.query.page || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const productData = await Product.find({})
        .populate('category')
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        // 🔁 Add total quantity to each product
        const enrichedProducts = productData.map(product => {
        const totalQuantity = product.variants.reduce((sum, variant) => sum + (variant.quantity || 0), 0);
        // Use `.toObject()` to convert the Mongoose doc to plain JS object so .category.name works in EJS
        const plainProduct = product.toObject();   
        return { ...plainProduct, totalQuantity };
        });

        const totalProducts = await Product.countDocuments();
        const totalPages = Math.ceil(totalProducts / limit);

        const category = await Category.find({ isListed: true });
        

        if (category) {
            return res.render('products', {
                data: enrichedProducts,
                currentPage: page,
                totalPages: totalPages,
                // category: category
            });
        } else {
            return res.redirect('/admin/pageError');
        }
    } catch (error) {
        console.log(error)
        return res.redirect('/admin/pageError');
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
       res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
}

const unblockProduct = async (req,res) =>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
}

const getEditProduct = async (req,res)=>{
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        const category = await Category.find({});

        // map varients to a size based object like small , medium etc
        const variantsMap = {};
        if(product.variants && product.variants.length > 0){
            product.variants.forEach(variant =>{
                variantsMap[variant.size] = {
                    quantity : variant.quantity,
                    sku: variant.sku
                }
            });
        }
        res.render('edit-product',{
            product: product,
            cat: category,
            variantsMap: variantsMap 
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

        let variants = [];
        if(typeof data.variantData === 'string'){
            try {
                variants = JSON.parse(data.variantData);
            } catch (error) {
                return res.status(400).json({ message: 'Invalid varients format' });
            }
        }

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
            regularPrice: parseFloat(data.regularPrice),
            salePrice: parseFloat(data.salePrice),
            variants : variants,
            color: data.color,
            productImage: [...existingImages, ...images] // Combine existing and new images
        }

        // Check if any field is actually changed
        const hasChanges =
            product.productName !== updateFields.productName ||
            product.description !== updateFields.description ||
            product.category.toString() !== updateFields.category ||
            parseFloat(product.regularPrice) !== updateFields.regularPrice ||
            parseFloat(product.salePrice) !== updateFields.salePrice ||
            product.color !== updateFields.color ||
            JSON.stringify(product.variants) !== JSON.stringify(updateFields.variants) ||
            JSON.stringify(product.productImage) !== JSON.stringify(updateFields.productImage);

        if (!hasChanges) {
            return res.status(200).json({
                status: false,
                message: 'No changes detected. Product not updated.',
            });
        }

        const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, { new: true });

        if (!updatedProduct) {
            return res.status(500).json({ status: false, error: 'Failed to update product in database' });
        }
        res.json({ status: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error('Error in editProduct:',error);
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
        try {
            await fs.unlink(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        } catch (err) {
            console.warn(`Image ${imageNameToServer} not found on disk:`, err.message);
        }
        res.json({ status: true, message: 'Image deleted successfully' });
    } catch (error) {

        console.error('Error in deleteSingleImage:', error);
        res.status(500).json({ status: false, error: 'Failed to delete image' });
    }
}


const searchProduct = async(req,res)=>{
    try {
        const search = (req.body?.query || req.query?.query || "").trim();

        console.log('search ==========', search)

        let searchResult = [];

        // const matchedCategories = await Category.find({
        //     name: { $regex: search, $options: 'i' }
        // }).select('_id');


        if (search === "") {
            searchResult = await Product.find().populate('category');;
        }else{
            searchResult = await Product.find({
            productName:{$regex:".*"+search+".*",$options:"i"}
            // $or:[
            //     {productName:{$regex:".*"+search+".*",$options:"i"}},
            // ]    
            }).populate('category');
        };

        searchResult.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
        

        let productsPerPage = 4;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1)*productsPerPage;
        let endIndex = startIndex + productsPerPage;
        let totalPages = Math.ceil(searchResult.length/productsPerPage);
        const currentProducts = searchResult.slice(startIndex,endIndex);

        // 🔁 Add total quantity to each product
        const enrichedProducts = currentProducts.map(product => {
        const totalQuantity = product.variants.reduce((sum, variant) => sum + (variant.quantity || 0), 0);
        // Use `.toObject()` to convert the Mongoose doc to plain JS object so .category.name works in EJS
        const plainProduct = product.toObject();   
        return { ...plainProduct, totalQuantity };
        });

        return res.render('products',{
            data: enrichedProducts,
            totalPages,
            currentPage,
            count: searchResult.length,
            searchQuery: search
        });


    } catch (error) {
        console.log("Error in Search Products",error);
        return res.redirect('/admin/pageError');
    }
}

const deleteProduct = async(req,res)=>{
    try {
        const productId = req.query.id;
        await Product.deleteOne({_id:productId});

        return res.redirect('/admin/products')
        
    } catch (error) {
        console.error('Error in Delete product',error);
        return res.redirect('/admin/pageError')
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
    deleteSingleImage,
    searchProduct,
    deleteProduct
}