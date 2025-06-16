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

module.exports = {
    getAddProduct,
    addProduct,
    getAllProducts
};