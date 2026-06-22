/**
 * Compare Razorpay captured payments against MongoDB orders.
 *
 * Usage:
 *   node scripts/reconcile-razorpay-payments.js [--days=30] [--json]
 *
 * Requires: MONGODB_URI, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Order = require('../models/orderSchema');
const PaymentIntent = require('../models/paymentIntentSchema');
const { getRazorpayInstance } = require('../utils/razorpayClient');

const args = process.argv.slice(2);
const daysArg = args.find((a) => a.startsWith('--days='));
const days = daysArg ? Number(daysArg.split('=')[1]) : 30;
const jsonOutput = args.includes('--json');

async function fetchCapturedPayments(razorpay, fromEpoch, toEpoch) {
    const captured = [];
    let skip = 0;
    const count = 100;

    while (true) {
        const response = await razorpay.payments.all({
            from: fromEpoch,
            to: toEpoch,
            count,
            skip,
        });

        const items = response.items || [];
        for (const payment of items) {
            if (payment.status === 'captured') {
                captured.push(payment);
            }
        }

        if (items.length < count) {
            break;
        }
        skip += count;
    }

    return captured;
}

async function main() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGODB_URI (or MONGO_URI) is required');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);

    const toEpoch = Math.floor(Date.now() / 1000);
    const fromEpoch = toEpoch - days * 24 * 60 * 60;

    const razorpay = getRazorpayInstance();
    const capturedPayments = await fetchCapturedPayments(razorpay, fromEpoch, toEpoch);

    const paymentIds = capturedPayments.map((p) => p.id);
    const orders = await Order.find({
        $or: [
            { razorpayPaymentId: { $in: paymentIds } },
            { razorpayOrderId: { $in: capturedPayments.map((p) => p.order_id).filter(Boolean) } },
            {
                paymentCapturedAt: {
                    $gte: new Date(fromEpoch * 1000),
                    $lte: new Date(toEpoch * 1000),
                },
                paymentMethod: 'razorpay',
            },
        ],
    }).lean();

    const orderByPaymentId = new Map();
    const orderByRpOrderId = new Map();
    for (const order of orders) {
        if (order.razorpayPaymentId) {
            orderByPaymentId.set(order.razorpayPaymentId, order);
        }
        if (order.razorpayOrderId) {
            orderByRpOrderId.set(order.razorpayOrderId, order);
        }
    }

    const capturedWithoutOrder = [];
    const capturedWithIncompleteOrder = [];

    for (const payment of capturedPayments) {
        const order =
            orderByPaymentId.get(payment.id) ||
            (payment.order_id ? orderByRpOrderId.get(payment.order_id) : null);

        if (!order) {
            capturedWithoutOrder.push({
                razorpayPaymentId: payment.id,
                razorpayOrderId: payment.order_id,
                amountPaise: payment.amount,
                createdAt: payment.created_at,
                notes: payment.notes || {},
            });
            continue;
        }

        if (order.paymentStatus !== 'Completed') {
            capturedWithIncompleteOrder.push({
                razorpayPaymentId: payment.id,
                orderId: order.orderId,
                paymentStatus: order.paymentStatus,
            });
        }
    }

    const fulfilledPaymentIds = new Set(
        orders
            .filter((o) => o.paymentStatus === 'Completed' && o.razorpayPaymentId)
            .map((o) => o.razorpayPaymentId)
    );

    const ordersWithoutRazorpayMatch = orders
        .filter(
            (o) =>
                o.paymentMethod === 'razorpay' &&
                o.paymentStatus === 'Completed' &&
                o.razorpayPaymentId &&
                !paymentIds.includes(o.razorpayPaymentId)
        )
        .map((o) => ({
            orderId: o.orderId,
            razorpayPaymentId: o.razorpayPaymentId,
            razorpayOrderId: o.razorpayOrderId,
            paymentCapturedAt: o.paymentCapturedAt,
        }));

    const staleIntents = await PaymentIntent.find({
        status: 'pending',
        createdAt: { $gte: new Date(fromEpoch * 1000) },
    }).lean();

    const pendingIntentsWithCapture = staleIntents
        .filter((intent) => capturedPayments.some((p) => p.order_id === intent.razorpayOrderId))
        .map((intent) => ({
            razorpayOrderId: intent.razorpayOrderId,
            userId: intent.userId,
            flow: intent.flow,
            appOrderId: intent.appOrderId,
        }));

    const report = {
        windowDays: days,
        from: new Date(fromEpoch * 1000).toISOString(),
        to: new Date(toEpoch * 1000).toISOString(),
        razorpayCapturedCount: capturedPayments.length,
        dbRazorpayOrdersChecked: orders.length,
        mismatches: {
            capturedWithoutOrder: capturedWithoutOrder.length,
            capturedWithIncompleteOrder: capturedWithIncompleteOrder.length,
            completedOrdersOutsideWindow: ordersWithoutRazorpayMatch.length,
            pendingIntentsWithCapture: pendingIntentsWithCapture.length,
        },
        details: {
            capturedWithoutOrder,
            capturedWithIncompleteOrder,
            ordersWithoutRazorpayMatch,
            pendingIntentsWithCapture,
        },
        summary:
            capturedWithoutOrder.length === 0 &&
            capturedWithIncompleteOrder.length === 0 &&
            pendingIntentsWithCapture.length === 0
                ? 'OK — no critical mismatches in window'
                : 'ACTION REQUIRED — review mismatch details',
    };

    if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log('Razorpay payment reconciliation');
        console.log('----------------------------');
        console.log(`Window: last ${days} days`);
        console.log(`Razorpay captured payments: ${report.razorpayCapturedCount}`);
        console.log(`DB orders examined: ${report.dbRazorpayOrdersChecked}`);
        console.log('');
        console.log('Mismatches:');
        console.log(`  Captured in Razorpay, no completed order: ${report.mismatches.capturedWithoutOrder}`);
        console.log(`  Captured but order not Completed: ${report.mismatches.capturedWithIncompleteOrder}`);
        console.log(`  Completed orders (razorpay) not in Razorpay window: ${report.mismatches.completedOrdersOutsideWindow}`);
        console.log(`  Pending PaymentIntent with captured Razorpay order: ${report.mismatches.pendingIntentsWithCapture}`);
        console.log('');
        console.log(report.summary);

        if (capturedWithoutOrder.length > 0) {
            console.log('\nCaptured without order (first 10):');
            capturedWithoutOrder.slice(0, 10).forEach((row) => {
                console.log(`  ${row.razorpayPaymentId} order=${row.razorpayOrderId}`);
            });
        }
    }

    await mongoose.disconnect();
    process.exit(
        report.mismatches.capturedWithoutOrder > 0 ||
            report.mismatches.capturedWithIncompleteOrder > 0
            ? 1
            : 0
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
