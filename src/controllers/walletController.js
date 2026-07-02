const WalletService = require('../services/walletService');
class WalletController {
  constructor() {
    this.walletService = new WalletService();
  }
  async health(req, res) {
    res.status(200).json({ status: 'healthy' });
  }
}
module.exports = WalletController;