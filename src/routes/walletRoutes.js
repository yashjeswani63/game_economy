const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/walletController');
const controller = new WalletController();

router.get('/health', controller.health.bind(controller));
router.post('/wallets/:playerId/credit', controller.credit.bind(controller));

router.post('/wallets/:playerId/purchase', controller.purchase.bind(controller));
module.exports = router;