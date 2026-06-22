const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email) {
    return typeof email === 'string' && EMAIL_PATTERN.test(email.trim());
}

function isValidSignupPassword(password) {
    return typeof password === 'string' && password.length >= 8;
}

module.exports = { isValidEmail, isValidSignupPassword };
