const Product = require('../models/productSchema');

function sessionOpts(session) {
    return session ? { session } : {};
}

async function decrementVariantStock(productId, sku, size, quantity, session = null) {
    return !!(await Product.findOneAndUpdate(
        {
            _id: productId,
            variants: {
                $elemMatch: {
                    sku,
                    size,
                    quantity: { $gte: quantity },
                },
            },
        },
        { $inc: { 'variants.$.quantity': -quantity } },
        { new: true, ...sessionOpts(session) }
    ));
}

async function incrementVariantStock(productId, sku, size, quantity, session = null) {
    return !!(await Product.findOneAndUpdate(
        {
            _id: productId,
            variants: { $elemMatch: { sku, size } },
        },
        { $inc: { 'variants.$.quantity': quantity } },
        { new: true, ...sessionOpts(session) }
    ));
}

async function deductOrderItemsStock(items, session = null) {
    for (const item of items) {
        const productId = item.product?._id || item.product;
        const ok = await decrementVariantStock(
            productId,
            item.sku,
            item.size,
            item.quantity,
            session
        );
        if (!ok) {
            return { ok: false, message: `Insufficient stock for SKU ${item.sku}` };
        }
    }
    return { ok: true };
}

module.exports = {
    decrementVariantStock,
    incrementVariantStock,
    deductOrderItemsStock,
};
