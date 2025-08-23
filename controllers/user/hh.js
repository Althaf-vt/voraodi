const { generate } = require('mongoose/lib/types/objectid');
const env = require('dotenv').config();
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { search } = require('../../server');
const { find } = require('../../models/addressSchema');
const mongoose = require('mongoose');


const loadHome = async(req,res)=>{
    try {
        const {search,CategoryQuery,priceFilter,sort} = req.body;


        const filter = {isBlocked:false}

        if(search){

            filter.productName = {$regex:search,$options:'i'};
        }
        
        if(priceFilter === 'under500'){
            filter.salePrice = {$lt:500}
        }else if(priceFilter === '500-1000'){
            filter.salePrice = {$gt:500,$lt:1000}
        }

        let sortOption ={ createdOn: -1}

        if(sort === 'priceLow-high'){
            sortOption = {salePrice : 1}
        }else if(sort === 'highttolow'){
            sortOption = {salePrice : -1}
        }else if( sort === 'a-z'){
            sortOption = {productName:1}
        }

        const page = parseInt(req.qury.page)||1;


        const limit = 6;

        const skip = (page - 1) * limit;

        const products = await Product.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts/limit);

        

        
    } catch (error) {
        
    }
}