const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/walletController');
const controller = new WalletController();

router.get('/health', controller.health.bind(controller));

module.exports = router;