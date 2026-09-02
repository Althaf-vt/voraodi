const express = require('express');
const router = express.Router();
const { handleCashfreeWebhook } = require('../controllers/cashfreeWebhookController');

// Cashfree webhook — server.js already applies express.raw() to this router
router.post('/cashfree', handleCashfreeWebhook);

module.exports = router;
