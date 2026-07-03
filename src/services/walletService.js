const { getDb } = require('../db');
const { ValidationError } = require('../validator');

const IDEMPOTENCY_KEY_TTL_SECONDS = 24 * 60 * 60;
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
let queuePromise = Promise.resolve();

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

class WalletService {
  async claimReward(playerId, rewardId, idempotencyKey) {
    return this.executeSerialized(async () => {
      const db = await this.getDb();
      const existing = await this.resolveIdempotency(idempotencyKey);
      if (existing) return existing;

      let inTransaction = false;
      try {
        await new Promise((resolve, reject) => {
          db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
            if (err) reject(err);
            else { inTransaction = true; resolve(); }
          });
        });

        const wallet = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);
        if (!wallet) {
          await runQuery(db, 'INSERT INTO wallets (player_id, balance) VALUES (?, 0)', [playerId]);
        }

        const existingClaim = await getQuery(db, 'SELECT claimed_at FROM claimed_rewards WHERE player_id = ? AND reward_id = ?', [playerId, rewardId]);
        if (existingClaim) throw new ValidationError('Reward already claimed');

        const rewardAmount = 100;
        await runQuery(db, 'UPDATE wallets SET balance = balance + ?, updated_at = strftime("%s", "now") WHERE player_id = ?', [rewardAmount, playerId]);
        await runQuery(db, 'INSERT INTO claimed_rewards (player_id, reward_id) VALUES (?, ?)', [playerId, rewardId]);

        const reason = `Claim of reward ${rewardId}`;
        await runQuery(db, `INSERT INTO transaction_ledger (player_id, transaction_type, amount, reward_id, reason, idempotency_key) VALUES (?, 'claim', ?, ?, ?, ?)`, [playerId, rewardAmount, rewardId, reason, idempotencyKey]);

        const updated = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);
        await new Promise((resolve, reject) => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else { inTransaction = false; resolve(); }
          });
        });

        const result = { success: true, balance: updated.balance, rewardId: rewardId };
        await this.storeIdempotencyResult(idempotencyKey, result, 200);
        return result;
      } catch (error) {
        if (inTransaction) {
          await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
        }
        const isValidationError = error instanceof ValidationError || error.name === 'ValidationError' || error.statusCode === 400;
        if (isValidationError) {
          const errorResult = { success: false, error: error.message };
          await this.storeIdempotencyResult(idempotencyKey, errorResult, 400);
        } else {
          await this.deleteIdempotencyKey(idempotencyKey);
        }
        throw error;
      }
    });
  }
  async purchase(playerId, itemId, price, idempotencyKey) {
    return this.executeSerialized(async () => {
      const db = await this.getDb();
      const existing = await this.resolveIdempotency(idempotencyKey);
      if (existing) return existing;

      let inTransaction = false;
      try {
        await new Promise((resolve, reject) => {
          db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
            if (err) reject(err);
            else { inTransaction = true; resolve(); }
          });
        });

        const wallet = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);
        if (!wallet) throw new ValidationError('Wallet not found');
        if (wallet.balance < price) throw new ValidationError('Insufficient funds');

        const existingItem = await getQuery(db, 'SELECT id FROM inventory WHERE player_id = ? AND item_id = ?', [playerId, itemId]);
        if (existingItem) throw new ValidationError('Item already owned');

        await runQuery(db, 'UPDATE wallets SET balance = balance - ?, updated_at = strftime("%s", "now") WHERE player_id = ?', [price, playerId]);
        await runQuery(db, 'INSERT INTO inventory (player_id, item_id) VALUES (?, ?)', [playerId, itemId]);

        const updated = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);
        if (updated.balance < 0) throw new ValidationError('Negative balance after purchase');

        const reason = `Purchase of item ${itemId}`;
        await runQuery(db, `INSERT INTO transaction_ledger (player_id, transaction_type, amount, item_id, reason, idempotency_key) VALUES (?, 'purchase', ?, ?, ?, ?)`, [playerId, price, itemId, reason, idempotencyKey]);

        await new Promise((resolve, reject) => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else { inTransaction = false; resolve(); }
          });
        });

        const result = { success: true, balance: updated.balance, itemId: itemId };
        await this.storeIdempotencyResult(idempotencyKey, result, 200);
        return result;
      } catch (error) {
        if (inTransaction) {
          await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
        }
        const isValidationError = error instanceof ValidationError || error.name === 'ValidationError' || error.statusCode === 400;
        if (isValidationError) {
          const errorResult = { success: false, error: error.message };
          await this.storeIdempotencyResult(idempotencyKey, errorResult, 400);
        } else {
          await this.deleteIdempotencyKey(idempotencyKey);
        }
        throw error;
      }
    });
  }
  constructor() {}

  async executeSerialized(fn) {
    const current = queuePromise;
    let resolveNext;
    queuePromise = new Promise(resolve => { resolveNext = resolve; });
    await current;
    try { return await fn(); } finally { resolveNext(); }
  }

  async getDb() {
    return await getDb();
  }

  async credit(playerId, amount, reason, idempotencyKey) {
    return this.executeSerialized(async () => {
      const db = await this.getDb();
      const existing = await this.resolveIdempotency(idempotencyKey);
      if (existing) return existing;

      let inTransaction = false;
      try {
        await new Promise((resolve, reject) => {
          db.run('BEGIN IMMEDIATE TRANSACTION', (err) => {
            if (err) reject(err);
            else { inTransaction = true; resolve(); }
          });
        });

        const wallet = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);
        if (!wallet) {
          await runQuery(db, 'INSERT INTO wallets (player_id, balance) VALUES (?, 0)', [playerId]);
        }

        await runQuery(db, 'UPDATE wallets SET balance = balance + ?, updated_at = strftime("%s", "now") WHERE player_id = ?', [amount, playerId]);
        const updated = await getQuery(db, 'SELECT balance FROM wallets WHERE player_id = ?', [playerId]);

        if (updated.balance < 0 || updated.balance > MAX_AMOUNT) {
          throw new ValidationError('Balance overflow or underflow');
        }

        await runQuery(db, `INSERT INTO transaction_ledger (player_id, transaction_type, amount, reason, idempotency_key) VALUES (?, 'credit', ?, ?, ?)`, [playerId, amount, reason, idempotencyKey]);

        await new Promise((resolve, reject) => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else { inTransaction = false; resolve(); }
          });
        });

        const result = { success: true, balance: updated.balance };
        await this.storeIdempotencyResult(idempotencyKey, result, 200);
        return result;
      } catch (error) {
        if (inTransaction) {
          await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
        }
        const isValidationError = error instanceof ValidationError || error.name === 'ValidationError' || error.statusCode === 400;
        if (isValidationError) {
          const errorResult = { success: false, error: error.message };
          await this.storeIdempotencyResult(idempotencyKey, errorResult, 400);
        } else {
          await this.deleteIdempotencyKey(idempotencyKey);
        }
        throw error;
      }
    });
  }

  async storeIdempotencyResult(key, result, statusCode) {
    if (!key) return;
    const db = await this.getDb();
    const expiresAt = Math.floor(Date.now() / 1000) + IDEMPOTENCY_KEY_TTL_SECONDS;
    await runQuery(db, 'INSERT OR REPLACE INTO idempotency_keys (key, response_body, status_code, expires_at) VALUES (?, ?, ?, ?)', [key, JSON.stringify(result), statusCode, expiresAt]);
  }

  async resolveIdempotency(key) {
    if (!key) return null;
    const db = await this.getDb();
    const row = await getQuery(db, 'SELECT response_body, status_code FROM idempotency_keys WHERE key = ?', [key]);
    if (row) {
      if (row.status_code === 102) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return this.resolveIdempotency(key);
      }
      return { ...JSON.parse(row.response_body), statusCode: row.status_code, fromCache: true };
    }
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + IDEMPOTENCY_KEY_TTL_SECONDS;
      await runQuery(db, 'INSERT INTO idempotency_keys (key, response_body, status_code, expires_at) VALUES (?, ?, ?, ?)', [key, 'pending', 102, expiresAt]);
      return null;
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return this.resolveIdempotency(key);
      }
      throw err;
    }
  }

  async deleteIdempotencyKey(key) {
    if (!key) return;
    const db = await this.getDb();
    await runQuery(db, 'DELETE FROM idempotency_keys WHERE key = ?', [key]);
  }
}
module.exports = WalletService;