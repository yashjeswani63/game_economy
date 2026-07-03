const express = require('express');
const WalletController = require('../controllers/walletController');
const {
  validateBody,
  validatePlayerIdParam,
  validateRewardIdParam,
  validateCreditBody,
  validatePurchaseBody,
  validateClaimBody
} = require('../middleware/validationMiddleware');

const router = express.Router();
const walletController = new WalletController();

/**
 * Wallet Routes
 * All routes are prefixed with /v1
 */

// POST /v1/wallets/:playerId/credit - Credit currency to wallet
router.post(
  '/wallets/:playerId/credit',
  validatePlayerIdParam,
  validateBody(['amount', 'reason']),
  validateCreditBody,
  (req, res, next) => walletController.credit(req, res, next)
);

// POST /v1/wallets/:playerId/purchase - Purchase an item
router.post(
  '/wallets/:playerId/purchase',
  validatePlayerIdParam,
  validateBody(['itemId', 'price']),
  validatePurchaseBody,
  (req, res, next) => walletController.purchase(req, res, next)
);

// POST /v1/rewards/:rewardId/claim - Claim a reward
router.post(
  '/rewards/:rewardId/claim',
  validateRewardIdParam,
  validateBody(['playerId']),
  validateClaimBody,
  (req, res, next) => walletController.claimReward(req, res, next)
);

// GET /v1/wallets/:playerId - Get wallet state
router.get(
  '/wallets/:playerId',
  validatePlayerIdParam,
  (req, res, next) => walletController.getWallet(req, res, next)
);

// GET /health - Health check
router.get('/health', (req, res) => walletController.health(req, res));

module.exports = router;
