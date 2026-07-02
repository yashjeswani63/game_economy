const { getDb } = require('../db');
class WalletService {
  constructor() {}
  async getDb() {
    return await getDb();
  }
}
module.exports = WalletService;