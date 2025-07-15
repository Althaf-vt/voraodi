const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const categoryInfo = async (req,res) =>{
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        res.render('category',{
            cat: categoryData, 
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error(error);
        res.redirect('/pageError');
    }
};


const addCategory = async (req,res) =>{
    const {categoryName,description} = req.body;
  
    try {
        const existingCategory = await Category.findOne({
            name:{$regex:`^${categoryName}$`, $options: 'i'}
        });
        
        if(existingCategory){
            return res.status(400).json({status: false, message: "Category already exists"});
        }
        const newCategory = new Category({
            name:categoryName,
            description,
        })
        await newCategory.save();
        return res.json({status: true, message: 'Category added successfully!'});
    } catch (error) {
    console.error('Error in addCategory:', error); // Add this
    return res.status(500).json({status: false, message: 'Internal Server Error'});
        }
}


const addCategoryOffer = async (req,res)=>{
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.id;
        const category = await Category.findById(categoryId);

        if(!category){
            return res.status(404).json({status:false, message:'Category not found'});
        }

        const products = await Product.find({category:category._id});
        const hasProductOffer = products.some((product)=>product.productOffer > percentage);
        if(hasProductOffer){
            return res.json({status:false, message:'Product within this category already have product offers'});
        }

        await Category.updateOne({_id:categoryId},{$set:{categoryOffer:percentage}});

        for (const product of products){
            product.productOffer = 0;
            product.salePrice = product.regularPrice;
            await product.save();
        }

       res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
}


const removeCategoryOffer = async(req,res)=>{
    try {
        const categoryId = req.body.id;
        const category = await Category.findById(categoryId);

        if(!category){
            return res.status(404).json({status:false,message:"Category not found"});
        }
        const percentage = category.categoryOffer;
        const products = await Product.find({category:category._id});

        if(products.length > 0){
            for(const product of products){
                product.salePrice = Math.floor(product.regularPrice);
                product.productOffer = 0;
                await product.save();
            }
        }
        category.categoryOffer = 0;
        await category.save();
        res.json({ success: true });

    } catch (error) {
        console.error("Error in addCategoryOffer:", error);
        res.status(500).json({ success: false });
    }
}


const getListCategory = async (req,res)=>{
    try {
        let id = req.query.id;

        await Category.updateOne({_id:id},{$set:{isListed:false}});

        res.json({ success: true });
    }catch(error) {
        console.error('List category error:', error);
        res.status(500).json({ success: false });
    }
}

const getUnlistCategory = async (req,res)=>{
    try {
        let id = req.query.id;

        await Category.updateOne({_id:id},{$set:{isListed:true}});

        res.json({ success: true });
    }catch(error) {
        console.error('Unlist category error:', error);
        res.status(500).json({ success: false });
    }
}


const getEditCategory = async(req,res)=>{
    try {
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        return res.render('edit-category',{category:category});
    } catch (error) {
        console.log('Internal Server Error',error);
        return res.redirect('/pageError');
    }
}


const editCategory = async(req,res) =>{
    try {
        const id = req.params.id;
        const {categoryName,description} = req.body;
        const existingCategory = await Category.findOne({name:categoryName});

        if(existingCategory){
            return res.status(400).json({error:"Category exists, please choose another name"});
        }

        const updateCategory = await Category.findByIdAndUpdate(id,{
            name:categoryName,
            description:description
        },{new:true});//////////////

        if(updateCategory){
            return res.status(200).json({message: 'Category updated successfully'});
        }else{
            res.status(404).json({error:'Category not found'});
        }
    } catch (error) {
        return res.status(500).json({error:'Internal Server Error'})
    }
}

const deleteCategory = async(req,res)=>{
    try {
        const id = req.query.id;

        await Category.deleteOne({_id:id});

        return res.redirect('/admin/category');
    } catch (error) {
        console.error('Error in delete Category',error);
        return res.redirect('/admin/pageError');
    }
}

const searchCategory = async (req, res) => {
    try {
        const search = (req.body?.query || req.query?.query || "").trim();

        let searchResult = [];

        if (search === "") {
            searchResult = await Category.find({});
        }else{
            searchResult = await Category.find({
            $or:[
                {name:{$regex:".*"+search+".*",$options:"i"}},
                {email:{$regex:".*"+search+".*",$options:"i"}}
            ]    
        })};
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
        return res.redirect('/admin/pageError');
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