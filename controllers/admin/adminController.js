const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');



// Top selling products
async function getTopSellingProducts(limit = 10) {
    const topProducts = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
            $group: {
                _id: "$orderedItems.product",
                totalSold: { $sum: "$orderedItems.quantity" }
            }
        },
        { $sort: { totalSold: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" },
        {
            $project: {
                _id: 0,
                productId: "$product._id",
                productName: "$product.productName",
                productImage: { $arrayElemAt: ["$product.productImage", 0] },
                totalSold: 1,
                salePrice: "$product.salePrice"
            }
        }
    ]);
    return topProducts;
}

// Top selling categories
async function getTopSellingCategories(limit = 10) {
    const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },
        // Lookup product to get its category
        {
            $lookup: {
                from: "products",
                localField: "orderedItems.product",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" },
        // Group by category and sum revenue and quantity
        {
            $group: {
                _id: "$product.category",
                totalSold: { $sum: "$orderedItems.quantity" },
                totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } }
            }
        },
        { $sort: { totalRevenue: -1 } }, // Sort by revenue
        { $limit: limit },
        // Lookup category details
        {
            $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "category"
            }
        },
        { $unwind: "$category" },
        {
            $project: {
                _id: 0,
                categoryId: "$category._id",
                categoryName: "$category.name",
                totalSold: 1,
                totalRevenue: 1
            }
        }
    ]);
    return topCategories;
}

const loadAdminSignin = async (req, res, next) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/');
        }
        res.render('adminSignin', { message: null })
    } catch (error) {
        next(error);
    }
}

const signin = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            if (passwordMatch) {
                req.session.admin = true;
                console.log('admin in session')
                return res.redirect('/admin/')
            } else {
                res.render('adminSignin', { message: 'password incorrect' })
            }
        } else {
            res.render('adminSignin', { message: 'Admin not found' })
        }
    } catch (error) {
        console.log('login error', error);
        next(error);

    }
}


const logout = async (req, res, next) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log('Error destroying session', err);
                const error = new Error("Error destroying session");
                error.statusCode = 500;
                return next(error);
            }
            res.redirect('/admin/signin');
        })
    } catch (error) {
        console.log('unexpected error during logout', error);
        next(error)
    }
}

const loadDashboard = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/signin');
        }

        const filter = {
            period: req.session.filter?.period || req.query.period || 'monthly',
            startDate: req.session.filter?.startDate || req.query.startDate || null,
            endDate: req.session.filter?.endDate || req.query.endDate || null,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5
        };

        // Validate filter inputs
        if (filter.period === 'custom' && (!filter.startDate || !filter.endDate || !moment(filter.startDate).isValid() || !moment(filter.endDate).isValid())) {
            filter.period = 'monthly';
            filter.startDate = null;
            filter.endDate = null;
        }

        const data = await getSalesData(filter);

        const topProducts = await getTopSellingProducts(10);
        const topCategories = await getTopSellingCategories(10)

        res.render('dashboard', {
            ...data,
            topProducts,
            topCategories,
            message: req.session.message || null,
            selectedPeriod: filter.period,
            filter,
            moment: moment
        });
        delete req.session.message;
    } catch (error) {
        console.error('Error loading dashboard:', error);
        next(error)
        // res.render('dashboard', {
        //     totalSale: 0,
        //     totalOrders: 0,
        //     totalCustomers: 0,
        //     totalIncome: 0,
        //     summary: { salesCount: 0, orderAmount: 0, discount: 0 },
        //     salesReport: [],
        //     pagination: { currentPage: 1, totalPages: 1, limit: 5, totalRecords: 0 },
        //     categorySalesData: [],
        //     incomeData: [],
        //     // topProducts: [],
        //     // topBrands: [],
        //     // topCategories: [],
        //     message: 'Failed to load dashboard data. Please try again.',
        //     selectedPeriod: 'monthly',
        //     filter: { period: 'monthly', page: 1, limit: 5 }
        // });
    }
};

// Sales Report
const saleReport = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { period, startDate, endDate, page = 1, limit = 5 } = req.body;
        const filter = { period, startDate, endDate, page: parseInt(page), limit: parseInt(limit) };

        // Validate filter inputs
        if (period === 'custom' && (!startDate || !endDate || !moment(startDate).isValid() || !moment(filter.endDate).isValid())) {
            return res.status(400).json({ success: false, message: 'Invalid custom date range' });
        }

        req.session.filter = { period, startDate, endDate };
        const data = await getSalesData(filter);

        res.json({
            success: true,
            message: 'Report generated successfully!',
            ...data,
            selectedPeriod: period,
            filter
        });
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to generate report: ${error.message}` });
    }
};


// Download PDF
const downloadPDF = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { period, startDate, endDate } = req.body;
        const filter = { period, startDate, endDate, page: 1, limit: Infinity };

        // Validate inputs
        if (period === 'custom' && (!startDate || !endDate || !moment(startDate).isValid() || !moment(endDate).isValid())) {
            return res.status(400).json({ success: false, message: 'Invalid custom date range' });
        }

        const data = await getSalesData(filter);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

        doc.pipe(res);

        doc
            .fontSize(26)
            .fillColor('#333333')
            .text('VORAODI', { align: 'center' })
            .moveDown(0.5)
            .fontSize(20)
            .fillColor('#000000')
            .text('Sales Report', { align: 'center' })
            .moveDown(0.5)
            .fontSize(12)
            .fillColor('black')
            .text(`Report Generated: ${moment().format('DD/MM/YYYY')}`, { align: 'right' });

        doc
            .moveDown(1)
            .fontSize(12)
            .text(`Period: ${period}${period === 'custom' ? ` (${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')})` : ''}`);

        doc
            .moveDown(1)
            .fontSize(14)
            .fillColor('#000080')
            .text('Sales Summary:', { underline: true })
            .moveDown(0.5)
            .fontSize(12)
            .fillColor('black')
            .text(`Overall Sales Count: ${data.summary.salesCount}`)
            .text(`Overall Order Amount: ${data.summary.orderAmount.toLocaleString()}`)
            .text(`Overall Discount: ${data.summary.discount.toLocaleString()}`);

        doc
            .moveDown(1)
            .fontSize(14)
            .fillColor('#000080')
            .text('Sales Details:', { underline: true });

        const tableTop = doc.y + 15;
        const colWidths = [80, 80, 100, 80, 80, 80];
        const headers = ['Order ID', 'Date', 'Customer', 'Total', 'Discount', 'Coupon'];

        doc
            .fontSize(10)
            .fillColor('black')
            .font('Helvetica-Bold');

        headers.forEach((header, i) => {
            doc.text(header, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop, { width: colWidths[i], align: 'left' });
        });

        doc
            .moveTo(50, tableTop + 15)
            .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
            .stroke();

        doc.font('Helvetica').fontSize(9);
        let y = tableTop + 25;

        for (const order of data.salesReport) {
            doc
                .text(order.orderId.slice(0, 8), 50, y, { width: colWidths[0] })
                .text(order.orderDate, 50 + colWidths[0], y, { width: colWidths[1] })
                .text(order.userName || 'Unknown', 50 + colWidths.slice(0, 2).reduce((a, b) => a + b, 0), y, { width: colWidths[2] })
                .text(`${(order.finalAmount || 0).toLocaleString()}`, 50 + colWidths.slice(0, 3).reduce((a, b) => a + b, 0), y, { width: colWidths[3] })
                .text(`${(order.discount || 0).toLocaleString()}`, 50 + colWidths.slice(0, 4).reduce((a, b) => a + b, 0), y, { width: colWidths[4] })
                .text(order.couponCode || 'None', 50 + colWidths.slice(0, 5).reduce((a, b) => a + b, 0), y, { width: colWidths[5] });

            y += 20;
            if (y > doc.page.height - 50) {
                doc.addPage();
                y = 50;
            }
        }

        doc.end();
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to download PDF: ${error.message}` });
    }
};

// Download Excel
const downloadExcel = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { period, startDate, endDate } = req.body;
        const filter = { period, startDate, endDate, page: 1, limit: Infinity };

        // Validate inputs
        if (period === 'custom' && (!startDate || !endDate || !moment(startDate).isValid() || !moment(endDate).isValid())) {
            return res.status(400).json({ success: false, message: 'Invalid custom date range' });
        }

        const data = await getSalesData(filter);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.addRow(['VORAODI Sales Report']).getCell(1).font = { size: 20, bold: true };
        worksheet.addRow([`Generated: ${moment().format('DD/MM/YYYY')}`]).getCell(1).font = { size: 12 };
        worksheet.addRow([`Period: ${period}${period === 'custom' ? ` (${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')})` : ''}`]).getCell(1).font = { size: 12 };
        worksheet.addRow([]);

        worksheet.addRow(['Sales Summary']).getCell(1).font = { size: 14, bold: true, color: { argb: '000080' } };
        worksheet.addRow(['Overall Sales Count', data.summary.salesCount]);
        worksheet.addRow(['Overall Order Amount', `₹${data.summary.orderAmount.toLocaleString()}`]);
        worksheet.addRow(['Overall Discount', `₹${data.summary.discount.toLocaleString()}`]);
        worksheet.addRow([]);

        worksheet.addRow(['Sales Details']).getCell(1).font = { size: 14, bold: true, color: { argb: '000080' } };
        const headers = ['Order ID', 'Date', 'Customer', 'Total Amount', 'Discount', 'Coupon Code'];
        worksheet.addRow(headers);
        headers.forEach((header, i) => {
            worksheet.getCell(`${String.fromCharCode(65 + i)}6`).font = { bold: true };
            worksheet.getColumn(i + 1).width = header.length + 10;
        });

        data.salesReport.forEach(order => {
            worksheet.addRow([
                order.orderId,
                order.orderDate,
                order.userName || 'Unknown',
                `₹${(order.finalAmount || 0).toLocaleString()}`,
                `₹${(order.discount || 0).toLocaleString()}`,
                order.couponApplied || 'None'
            ]);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to download Excel: ${error.message}` });
    }
};

// Enhanced Get Sales Data
const getSalesData = async (filter) => {
    const { period, startDate, endDate, page, limit } = filter;
    let match = {};

    try {
        if (period === 'custom' && startDate && endDate) {
            if (!moment(startDate).isValid() || !moment(endDate).isValid()) {
                throw new Error('Invalid date format');
            }
            const start = moment(startDate).utc().startOf('day').toDate();
            const end = moment(endDate).utc().endOf('day').toDate();
            if (moment(end).isBefore(start)) {
                throw new Error('End date cannot be before start date');
            }
            match.createdOn = { $gte: start, $lte: end };
        } else {
            const now = moment();
            if (period === 'daily') {
                match.createdOn = { $gte: now.startOf('day').toDate(), $lte: now.endOf('day').toDate() };
            } else if (period === 'weekly') {
                match.createdOn = { $gte: now.startOf('week').toDate(), $lte: now.endOf('week').toDate() };
            } else if (period === 'monthly') {
                match.createdOn = { $gte: now.startOf('month').toDate(), $lte: now.endOf('month').toDate() };
            } else if (period === 'yearly') {
                match.createdOn = { $gte: now.startOf('year').toDate(), $lte: now.endOf('year').toDate() };
            }
        }

        const skip = (page - 1) * limit;
        const totalSalesRecords = await Order.countDocuments(match).catch(err => {
            console.error('Error counting sales records:', err);
            return 0;
        });
        const totalPages = Math.ceil(totalSalesRecords / limit);

        const salesReport = await Order.find(match)
            .populate('userId', 'name')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .catch(err => {
                console.error('Error fetching sales report:', err);
                return [];
            });

            

        const formattedSalesReport = salesReport.map(order => ({
            orderId: order.orderId || 'N/A',
            orderDate: order.createdOn ? moment(order.createdOn).format('DD/MM/YYYY') : moment().format('DD/MM/YYYY'),
            userName: order.userId?.name || 'Unknown',
            finalAmount: order.status === 'Cancelled' ? order.totalPrice : order.finalAmount || 0,
            discount: order.discount || 0,
            couponCode: order.couponApplied ? 'Applied' : 'None',
            orderedItems: order.orderedItems || []
        }));

        const allOrdersForCharts = await Order.find(match)
            .populate({
                path: 'orderedItems.product',
                populate: [
                    { path: 'category', select: 'name' },
                    // { path: 'brand', select: 'brandName brandImage' }
                ]
            })
            .sort({ createdOn: 1 })
            .lean()
            .catch(err => {
                console.error('Error fetching orders for charts:', err);
                return [];
            });

        const categorySales = {};
        allOrdersForCharts.forEach(order => {
            order.orderedItems.forEach(item => {
                const categoryName = item.product?.category?.name || 'Unknown';
                const quantity = item.quantity || 0;
                categorySales[categoryName] = (categorySales[categoryName] || 0) + quantity;
            });
        });

        const topCategories = Object.keys(categorySales)
            .map(category => ({
                category,
                totalSold: categorySales[category]
            }))
            .sort((a, b) => b.totalSold - a.totalSold)
            .slice(0, 10);

        // const brandSales = {};
        // allOrdersForCharts.forEach(order => {
        //     order.orderedItems.forEach(item => {
        //         const brandName = item.product?.brand?.brandName || 'Unknown';
        //         const brandImage = item.product?.brand?.brandImage || '/images/placeholder.jpg';
        //         const quantity = item.quantity || 0;
        //         if (!brandSales[brandName]) {
        //             brandSales[brandName] = {
        //                 name: brandName,
        //                 image: brandImage,
        //                 totalSold: 0
        //             };
        //         }
        //         brandSales[brandName].totalSold += quantity;
        //     });
        // });

        // const topBrands = Object.values(brandSales)
        //     .sort((a, b) => b.totalSold - a.totalSold)
        //     .slice(0, 10);

        const productSales = {};
        allOrdersForCharts.forEach(order => {
            order.orderedItems.forEach(item => {
                const productId = item.product?._id?.toString();
                const quantity = item.quantity || 0;
                if (productId) {
                    if (!productSales[productId]) {
                        productSales[productId] = {
                            name: item.product?.productName || 'Unknown Product',
                            image: item.product?.productImage?.[0] || '/images/placeholder.jpg',
                            totalSold: 0
                        };
                    }
                    productSales[productId].totalSold += quantity;
                }
            });
        });

        const topProducts = Object.entries(productSales)
            .map(([productId, data]) => ({
                productId,
                name: data.name,
                image: data.image,
                totalSold: data.totalSold
            }))
            .sort((a, b) => b.totalSold - a.totalSold)
            .slice(0, 10);

        const incomeData = [];
        if (period === 'daily') {
            const dailyIncome = {};
            allOrdersForCharts.forEach(order => {
                const hour = moment(order.createdOn).format('HH:00');
                const income = (order.finalAmount || 0) - (order.discount || 0);
                dailyIncome[hour] = (dailyIncome[hour] || 0) + income;
            });
            incomeData.push(...Object.keys(dailyIncome).map(hour => ({
                date: hour,
                income: dailyIncome[hour]
            })).sort((a, b) => a.date.localeCompare(b.date)));
        } else if (period === 'weekly') {
            const dailyIncome = {};
            const start = moment().startOf('week');
            for (let i = 0; i < 7; i++) {
                const date = moment(start).add(i, 'days').format('DD/MM/YYYY');
                dailyIncome[date] = 0;
            }
            allOrdersForCharts.forEach(order => {
                const date = moment(order.createdOn).format('DD/MM/YYYY');
                const income = (order.finalAmount || 0) - (order.discount || 0);
                dailyIncome[date] = (dailyIncome[date] || 0) + income;
            });
            incomeData.push(...Object.keys(dailyIncome).map(date => ({
                date,
                income: dailyIncome[date]
            })).sort((a, b) => moment(a.date, 'DD/MM/YYYY').unix() - moment(b.date, 'DD/MM/YYYY').unix()));
        } else if (period === 'monthly') {
            const weeklyIncome = {};
            const start = moment().startOf('month').subtract(3, 'weeks');
            for (let i = 0; i < 4; i++) {
                const weekStart = moment(start).add(i, 'weeks').format('DD/MM/YYYY');
                weeklyIncome[`Week ${i + 1}`] = 0;
            }
            allOrdersForCharts.forEach(order => {
                const orderDate = moment(order.createdOn);
                const weeksDiff = Math.floor(orderDate.diff(start, 'days') / 7);
                const weekLabel = weeksDiff >= 0 && weeksDiff < 4 ? `Week ${weeksDiff + 1}` : null;
                if (weekLabel) {
                    const income = (order.finalAmount || 0) - (order.discount || 0);
                    weeklyIncome[weekLabel] = (weeklyIncome[weekLabel] || 0) + income;
                }
            });
            incomeData.push(...Object.keys(weeklyIncome).map(week => ({
                date: week,
                income: weeklyIncome[week]
            })).sort((a, b) => a.date.localeCompare(b.date)));
        } else if (period === 'yearly') {
            const monthlyIncome = {};
            const start = moment().startOf('year');
            for (let i = 0; i < 12; i++) {
                const month = moment(start).add(i, 'months').format('MMM YYYY');
                monthlyIncome[month] = 0;
            }
            allOrdersForCharts.forEach(order => {
                const month = moment(order.createdOn).format('MMM YYYY');
                const income = (order.finalAmount || 0) - (order.discount || 0);
                monthlyIncome[month] = (monthlyIncome[month] || 0) + income;
            });
            incomeData.push(...Object.keys(monthlyIncome).map(month => ({
                date: month,
                income: monthlyIncome[month]
            })).sort((a, b) => moment(a.date, 'MMM YYYY').unix() - moment(b.date, 'MMM YYYY').unix()));
        } else if (period === 'custom' && startDate && endDate) {
            const durationDays = moment(endDate).diff(moment(startDate), 'days');
            if (durationDays <= 1) {
                const dailyIncome = {};
                allOrdersForCharts.forEach(order => {
                    const hour = moment(order.createdOn).format('HH:00');
                    const income = (order.finalAmount || 0) - (order.discount || 0);
                    dailyIncome[hour] = (dailyIncome[hour] || 0) + income;
                });
                incomeData.push(...Object.keys(dailyIncome).map(hour => ({
                    date: hour,
                    income: dailyIncome[hour]
                })).sort((a, b) => a.date.localeCompare(b.date)));
            } else if (durationDays <= 31) {
                const dailyIncome = {};
                const start = moment(startDate).startOf('day');
                for (let i = 0; i <= durationDays; i++) {
                    const date = moment(start).add(i, 'days').format('DD/MM/YYYY');
                    dailyIncome[date] = 0;
                }
                allOrdersForCharts.forEach(order => {
                    const date = moment(order.createdOn).format('DD/MM/YYYY');
                    const income = (order.finalAmount || 0) - (order.discount || 0);
                    dailyIncome[date] = (dailyIncome[date] || 0) + income;
                });
                incomeData.push(...Object.keys(dailyIncome).map(date => ({
                    date,
                    income: dailyIncome[date]
                })).sort((a, b) => moment(a.date, 'DD/MM/YYYY').unix() - moment(b.date, 'DD/MM/YYYY').unix()));
            } else {
                const monthlyIncome = {};
                const start = moment(startDate).startOf('month');
                const end = moment(endDate).endOf('month');
                const monthsDiff = end.diff(start, 'months') + 1;
                for (let i = 0; i < monthsDiff; i++) {
                    const month = moment(start).add(i, 'months').format('MMM YYYY');
                    monthlyIncome[month] = 0;
                }
                allOrdersForCharts.forEach(order => {
                    const month = moment(order.createdOn).format('MMM YYYY');
                    const income = (order.finalAmount || 0) - (order.discount || 0);
                    monthlyIncome[month] = (monthlyIncome[month] || 0) + income;
                });
                incomeData.push(...Object.keys(monthlyIncome).map(month => ({
                    date: month,
                    income: monthlyIncome[month]
                })).sort((a, b) => moment(a.date, 'MMM YYYY').unix() - moment(b.date, 'MMM YYYY').unix()));
            }
        }

        const totalOrders = await Order.countDocuments().catch(err => {
            console.error('Error counting total orders:', err);
            return 0;
        });

        const totalCustomers = await User.countDocuments({ isAdmin: false }).catch(err => {
            console.error('Error counting total customers:', err);
            return 0;
        });

        const summary = {
            salesCount: totalSalesRecords,
            orderAmount: allOrdersForCharts.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
            discount: allOrdersForCharts.reduce((sum, order) => sum + (order.discount || 0), 0)
        };

        const totalSale = summary.orderAmount;
        const totalIncome = summary.orderAmount - summary.discount;

        return {
            totalSale,
            totalOrders,
            totalCustomers,
            totalIncome,
            summary,
            salesReport: formattedSalesReport,
            pagination: {
                currentPage: page,
                totalPages,
                limit,
                totalRecords: totalSalesRecords
            },
            categorySalesData: topCategories, // Make sure this is populated
            incomeData, // Make sure this is populated
            topProducts, // Make sure this is populated
            topCategories // Make sure this is populated
        };
    } catch (error) {
        return {
            totalSale: 0,
            totalOrders: 0,
            totalCustomers: 0,
            totalIncome: 0,
            summary: { salesCount: 0, orderAmount: 0, discount: 0 },
            salesReport: [],
            pagination: { currentPage: 1, totalPages: 1, limit: 5, totalRecords: 0 },
            categorySalesData: [],
            incomeData: [],
            topProducts: [],
            // topBrands: [],
            topCategories: []
        };
    }
};

const pageError = async (req, res) => {
    res.render('admin-error')
}
module.exports = {
    loadAdminSignin,
    signin,
    loadDashboard,
    pageError,
    logout,
    saleReport,
    downloadPDF,
    downloadExcel,
    getSalesData,
}
