const express = require('express');
const app = express();
const cors = require('cors');
const helmet = require('helmet');

const path = require('path');
require('dotenv').config();
const { createSessionMiddleware, isProduction } = require('./config/session');
const { attachCsrfToken, validateCsrf } = require('./middlewares/csrf');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const methodOverride = require('method-override');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const webhookRouter = require('./routes/webhookRouter');
const errorHandler = require('./middlewares/errorHandler');

if (isProduction() || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

app.use(methodOverride('_method'));

app.use(
    '/webhooks',
    express.raw({ type: 'application/json' }),
    webhookRouter
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/.env' || p.endsWith('/.env') || p.includes('.env')) {
        return res.status(404).end();
    }
    next();
});

app.use(createSessionMiddleware());

app.use(passport.initialize());
app.use(passport.session());

app.use(attachCsrfToken);

app.use(validateCsrf);

app.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
});

app.use(cors({
    origin: ['https://voraodi.shop', 'http://localhost:3000'],
    credentials: true,
}));

app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/', userRouter);
app.use('/admin', adminRouter);

app.use((req, res, next) => {
    const err = new Error('Page Not Found');
    err.statusCode = 404;
    next(err);
});

app.use(errorHandler);

async function startServer() {
    await connectDB();
    app.listen(process.env.PORT, () => console.log('Server Running'));
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;
