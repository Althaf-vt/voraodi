const User = require('../../models/userSchema');
const { options } = require('../../server');

const customerInfo = async (req,res) =>{
    try {
        let search = "";
        if(req.query.search){
            search = req.query.search;
        }
        let page = 1;
        if(req.query.page){
            page = parseInt(req.query.page);
        }
        const limit = 5;
        const userData = await User.find({
            isAdmin:false,
            $or:[
                {name: {$regex: ".*"+search+".*", $options: 'i'}},
                {email: {$regex: ".*"+search+".*", $options: 'i'}}
            ],
        })
        .sort({createdOn:-1})
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();

        const count = await User .find({
             isAdmin:false,
            $or:[
               {name: {$regex: ".*"+search+".*", $options: 'i'}},
               {email: {$regex: ".*"+search+".*", $options: 'i'}}
            ],
        }).countDocuments();

        const totalPage = Math.ceil(count/limit);
        // const totalPageArray = Array.from({length: totalPage},(_,i)=> i)

        res.render('customers', {
            data: userData,
            totalPages: totalPage,
            currentPage: page
        })
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).render('error', { message: 'Error fetching customer data' });
    }
};

const customerBlocked = async (req,res) =>{
    try {
        let id = req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:true}});
        return res.json({ success: true });
    } catch (error) {
        console.error('Block error:', error);
        res.json({ success: false });
    }
}


const customerUnblocked = async (req,res) =>{
    try {
        let id = req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.json({ success: true });
    } catch (error) {
        console.error('Block error:', error);
        res.json({ success: false });
    }
}

const seachCustomer = async(req,res)=>{
    try {
        const search = (req.body?.query || req.query?.query || "").trim()

        let searchResult = [];

        if (search === "") {
            searchResult = await User.find({isAdmin: false });
        }else{
            searchResult = await User.find({
                isAdmin: false,
                name:{$regex:".*"+search+".*",$options:"i"}
                // $or:[
                //     {name:{$regex:".*"+search+".*",$options:"i"}},
                //     {email:{$regex:".*"+search+".*",$options:"i"}}
                // ]    
        })};

        searchResult.sort((a,b)=> new Date(b.createdOn) - new Date(a.createdOn));

        let customersPerPage = 5;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * customersPerPage;
        let endIndex = startIndex + customersPerPage;
        let totalPages = Math.ceil(searchResult.length/customersPerPage);
        const currentCustomers = searchResult.slice(startIndex,endIndex);

        
        return res.render('customers',{
            data: currentCustomers,
            totalPages,
            currentPage,
            count: searchResult.length,
            searchQuery: search
        });

    } catch (error) {
        console.log("Error in Search Customers",error);
        return res.redirect('/admin/pageError');
    }
}


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,
    seachCustomer
}