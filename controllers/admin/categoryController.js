const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const categoryInfo = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        res.render('category', {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};


const addCategory = async (req, res) => {
    const { categoryName, description } = req.body;

    try {
        const existingCategory = await Category.findOne({
            name: { $regex: `^${categoryName}$`, $options: 'i' }
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: "Category already exists" });
        }
        const newCategory = new Category({
            name: categoryName,
            description,
        })
        await newCategory.save();
        return res.status(200).json({ success: true, message: 'Category added successfully!' });
    } catch (error) {
        console.error('Error in addCategory:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


const addCategoryOffer = async (req, res) => {
    try {
        const { percentage, id } = req.body;

        if (!percentage || !id) {
            return res.status(400).json({ success: false, message: 'Category ID and percentage are required' });
        }

        if (parseInt(percentage) < 1) {
            return res.status(400).json({ success: false, message: 'Percentage must be greater than 0.' });
        }

        if (parseInt(percentage) > 90) {
            return res.status(400).json({ success: false, message: "Percentage cannot be greater than 100." });
        }
        const category = await Category.findOne({ _id: id });
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        const categoryOffer = parseInt(percentage);

        category.categoryOffer = categoryOffer
        await category.save();

        const products = await Product.find({ category: category._id });
        if (products.length === 0) {
            return res.status(200).json({ success: true, message: 'Category offer applied, but no products found in this category' });
        }

        // Apply offer to each product
        for (const product of products) {
            const productOffer = product.productOffer || 0;

            const finalOffer = Math.max(categoryOffer, productOffer);

            const offerType = finalOffer === productOffer ? 'product' : 'category';

            const salePrice = Math.floor(product.regularPrice * (1 - finalOffer / 100));

            product.appliedOffer = finalOffer;
            product.offerType = offerType;
            product.salePrice = salePrice;

            await product.save()
        }


        return res.status(200).json({ success: true, message: 'Offer added successful' });
    } catch (error) {
        console.log('Error in add categoty offer : ', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


const removeCategoryOffer = async (req, res) => {
    try {
        const categoryId = req.body.id;
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
        const percentage = category.categoryOffer;
        const products = await Product.find({ category: category._id });

        if (products.length > 0) {
            for (const product of products) {
                let appliedOffer = 0;
                let offerType = 'none';

                if (product.productOffer && product.productOffer > 0) {
                    appliedOffer = product.productOffer;
                    offerType = 'product';
                }

                product.appliedOffer = appliedOffer;
                product.offerType = offerType;
                product.salePrice = Math.floor(product.regularPrice * (1 - appliedOffer / 100));

                await product.save();
            }
        }
        category.categoryOffer = 0;
        await category.save();
        res.status(200).json({ success: true, message: 'Offer removed successful' });

    } catch (error) {
        console.error("Error in remove CategoryOffer:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Category Id is required' })
        }

        await Category.updateOne({ _id: id }, { $set: { isListed: false } });

        return res.status(200).json({ success: true, message: 'Categoty unlisted successful' });
    } catch (error) {
        console.error('List category error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Category Id is required' })
        }

        await Category.updateOne({ _id: id }, { $set: { isListed: true } });

        return res.status(200).json({ success: true, message: 'Categoty listed successful' });
    } catch (error) {
        console.error('Unlist category error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


const getEditCategory = async (req, res, next) => {
    try {
        const id = req.query.id;
        const category = await Category.findOne({ _id: id });
        return res.render('edit-category', { category: category });
    } catch (error) {
        console.log('Error in loading edit category', error);
        next(error);
    }
}


const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { categoryName, description } = req.body;
        const existingCategory = await Category.findOne({ name: categoryName ,_id:{$ne:id} });

        if (existingCategory) {
            return res.status(400).json({ error: "Category exists, please choose another name" });
        }

        const updateCategory = await Category.findByIdAndUpdate(id, {
            name: categoryName,
            description: description
        }, { new: true });//////////////

        if (updateCategory) {
            return res.status(200).json({ message: 'Category updated successfully' });
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        console.log('Error in edit category', error)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

const deleteCategory = async (req, res) => {
    try {
        const id = req.query.id;

        if (!id) {
            return res.status(400).json({ success: false, message: 'Category Id is required' })
        }

        await Category.deleteOne({ _id: id });

        return res.status(200).json({ success: true, message: 'Category deleted successful' })
    } catch (error) {
        console.error('Error in delete Category', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}

const searchCategory = async (req, res, next) => {
    try {
        const search = (req.body?.query || req.query?.query || "").trim();

        let searchResult = [];

        if (search === "") {
            searchResult = await Category.find({});
        } else {
            searchResult = await Category.find({
                $or: [
                    { name: { $regex: ".*" + search + ".*", $options: "i" } },
                    { email: { $regex: ".*" + search + ".*", $options: "i" } }
                ]
            })
        };
        searchResult.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        let categoriesPerPage = 4;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * categoriesPerPage;
        let endIndex = startIndex + categoriesPerPage;
        totalPages = Math.ceil(searchResult.length / categoriesPerPage);
        const currentCategories = searchResult.slice(startIndex, endIndex);

        res.render('category', {
            cat: currentCategories,
            totalPages,
            currentPage,
            count: searchResult.length,
            searchQuery: search
        });


    } catch (error) {
        console.log("Error in Search Category", error);
        next(error)
    }

}

module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
    deleteCategory,
    searchCategory
}