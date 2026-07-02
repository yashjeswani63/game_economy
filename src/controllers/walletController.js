const WalletService = require('../services/walletService');
const { validateIdempotencyKey } = require('../validator');

function generateIdempotencyKey(req) {
  const key = req.headers['idempotency-key'];
  if (key) return validateIdempotencyKey(key);
  return null;
}

class WalletController {
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