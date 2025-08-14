const errorHandler = async(err, req, res, next)=>{
    const statusCode = err.statusCode || 500;
    const isAdmin = req.path.startsWith('/admin');
    const errorMessage = err.message || (isAdmin ? 'Admin error occured' : 'User error occured');

    if(req.xhr || req.is('json')){
        return res.status(statusCode).json({
            error:true,
            message: errorMessage,
        });
    }

    res.status(statusCode).render(isAdmin ? 'admin-error' : 'page-404',{
        message: errorMessage,
        statusCode
    });
};

module.exports = errorHandler;