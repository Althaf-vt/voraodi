const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PATH_PREFIXES = ['/webhooks'];

function isExemptPath(path) {
    return EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function attachCsrfToken(req, res, next) {
    if (!req.session) {
        return next();
    }
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

function readCsrfToken(req) {
    return (
        req.body?._csrf ||
        req.headers['x-csrf-token'] ||
        req.headers['csrf-token']
    );
}

function validateCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }
    if (isExemptPath(req.path)) {
        return next();
    }

    const sessionToken = req.session?.csrfToken;
    const submitted = readCsrfToken(req);

    if (!sessionToken || !submitted || submitted !== sessionToken) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or missing CSRF token',
            });
        }
        return res.status(403).send('Invalid or missing CSRF token');
    }

    next();
}

module.exports = { attachCsrfToken, validateCsrf };
