const User = require('../../models/userSchema');

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
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('/pageError');
    }
}


const customerUnblocked = async (req,res) =>{
    try {
        let id = req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/users');
    } catch (error) {
        res.redirect('pageError')
    }
}


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
}