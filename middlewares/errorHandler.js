// const errorHandler = async(err, req, res, next)=>{
//     const statusCode = err.statusCode || 500;
//     const isAdmin = req.path.startsWith('/admin');
//     const errorMessage = err.message || (isAdmin ? 'Admin error occured' : 'User error occured');

//     if(req.xhr || req.is('json')){
//         return res.status(statusCode).json({
//             error:true,
//             message: errorMessage,
//         });
//     }

//     res.status(statusCode).render(isAdmin ? 'admin-error' : 'page-404',{
//         message: errorMessage,
//         statusCode
//     });
// };

// module.exports = errorHandler;


// middlewares/errorHandler.js

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isAdmin = req.originalUrl.startsWith("/admin");

  const errorMessage =
    err.message || (isAdmin ? "An admin error occurred" : "An error occurred");

  // Handle JSON / API requests
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(statusCode).json({
      error: true,
      message: errorMessage,
    });
  }

  // Always render the same template, but pass statusCode + message
  const view = isAdmin ? "admin-error" : "page-404";

  res.status(statusCode).render(view, {
    statusCode,
    message: errorMessage,
    error: process.env.NODE_ENV === "development" ? err.stack : null,
  });
};

module.exports = errorHandler;

