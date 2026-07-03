const WalletService = require('../services/walletService');
const { validateIdempotencyKey } = require('../validator');

function generateIdempotencyKey(req) {
  const key = req.headers['idempotency-key'];
  if (key) return validateIdempotencyKey(key);
  return null;
}

class WalletController {
  async claimReward(req, res, next) {
    try {
      const { rewardId } = req.params;
      const { playerId } = req.body;
      const idempotencyKey = generateIdempotencyKey(req);
      const result = await this.walletService.claimReward(playerId, rewardId, idempotencyKey);
      if (result.fromCache) {
        const { statusCode, fromCache, ...body } = result;
        return res.status(statusCode || 200).json(body);
      }
      res.status(200).json({ success: true, balance: result.balance, rewardId: result.rewardId });
    } catch (error) {
      next(error);
    }
  }
  async purchase(req, res, next) {
    try {
      const { playerId } = req.params;
      const { itemId, price } = req.body;
      const idempotencyKey = generateIdempotencyKey(req);
      const result = await this.walletService.purchase(playerId, itemId, price, idempotencyKey);
      if (result.fromCache) {
        const { statusCode, fromCache, ...body } = result;
        return res.status(statusCode || 200).json(body);
      }
      res.status(200).json({ success: true, balance: result.balance, itemId: result.itemId });
    } catch (error) {
      next(error);
    }
  }
  constructor() {
    this.walletService = new WalletService();
  }
  async health(req, res) {
    res.status(200).json({ status: 'healthy' });
  }
  async credit(req, res, next) {
    try {
      const { playerId } = req.params;
      const { amount, reason } = req.body;
      const idempotencyKey = generateIdempotencyKey(req);
      const result = await this.walletService.credit(playerId, amount, reason, idempotencyKey);
      if (result.fromCache) {
        const { statusCode, fromCache, ...body } = result;
        return res.status(statusCode || 200).json(body);
      }
      res.status(200).json({ success: true, balance: result.balance });
    } catch (error) {
      next(error);
    }
  }
}
module.exports = WalletController;