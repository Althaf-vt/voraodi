const session = require('express-session');
const MongoStore = require('connect-mongo').default;

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            'SESSION_SECRET must be set in .env and be at least 32 characters long'
        );
    }
    const weak = ['your-secret-key', 'secret', 'changeme', 'session_secret'];
    if (weak.includes(secret.toLowerCase())) {
        throw new Error('SESSION_SECRET must not use a default or placeholder value');
    }
    return secret;
}

function isProduction() {
    return process.env.NODE_ENV === 'production';
}

function createSessionMiddleware() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI must be set in .env for session store');
    }

    return session({
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: mongoUri,
            collectionName: 'sessions',
            ttl: 72 * 60 * 60,
        }),
        cookie: {
            secure: isProduction(),
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 72 * 60 * 60 * 1000,
        },
    });
}

module.exports = { createSessionMiddleware, isProduction };
