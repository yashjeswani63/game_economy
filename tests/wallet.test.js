const path = require('path');
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'economy-wallet.db');
process.env.DB_PATH = TEST_DB_PATH;

const request = require('supertest');
const { app, ensureDbInitialized } = require('../src/server');
const { closeDatabase, clearDatabase } = require('../src/db');
const fs = require('fs');

function cleanupTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

describe('Wallet API Tests', () => {
  beforeAll(async () => {
    await ensureDbInitialized();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    cleanupTestDb();
  });

  describe('POST /v1/wallets/:playerId/credit', () => {
    test('should credit currency to a new wallet', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 100, reason: 'battle_win' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: 100
      });
    });

    test('should credit currency to an existing wallet', async () => {
      await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 100, reason: 'battle_win' });

      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 50, reason: 'battle_win' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: 150
      });
    });

    test('should reject negative amount', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: -10, reason: 'battle_win' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('must be greater than 0');
    });

    test('should reject zero amount', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 0, reason: 'battle_win' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject missing amount', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ reason: 'battle_win' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject non-integer amount', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 10.5, reason: 'battle_win' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /v1/wallets/:playerId/purchase', () => {
    beforeEach(async () => {
      await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 200, reason: 'initial' });
    });

    test('should purchase item with sufficient funds', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/purchase')
        .send({ itemId: 'sword', price: 50 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: 150,
        itemId: 'sword'
      });
    });

    test('should reject purchase with insufficient funds', async () => {
      const response = await request(app)
        .post('/v1/wallets/player1/purchase')
        .send({ itemId: 'sword', price: 300 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient funds');
    });

    test('should reject duplicate item purchase', async () => {
      await request(app)
        .post('/v1/wallets/player1/purchase')
        .send({ itemId: 'sword', price: 50 });

      const response = await request(app)
        .post('/v1/wallets/player1/purchase')
        .send({ itemId: 'sword', price: 50 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already owned');
    });

    test('should reject purchase for non-existent wallet', async () => {
      const response = await request(app)
        .post('/v1/wallets/nonexistent/purchase')
        .send({ itemId: 'sword', price: 50 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Wallet not found');
    });
  });

  describe('POST /v1/rewards/:rewardId/claim', () => {
    test('should claim reward for first time', async () => {
      const response = await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player1' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        balance: 100,
        rewardId: 'daily_bonus'
      });
    });

    test('should reject duplicate reward claim', async () => {
      await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player1' });

      const response = await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player1' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already claimed');
    });

    test('should allow same reward for different players', async () => {
      await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player1' });

      const response = await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player2' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /v1/wallets/:playerId', () => {
    test('should return empty state for non-existent wallet', async () => {
      const response = await request(app)
        .get('/v1/wallets/nonexistent')
        .expect(200);

      expect(response.body).toEqual({
        balance: 0,
        inventory: [],
        claimedRewards: []
      });
    });

    test('should return wallet state', async () => {
      await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 200, reason: 'initial' });

      await request(app)
        .post('/v1/wallets/player1/purchase')
        .send({ itemId: 'sword', price: 50 });

      await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .send({ playerId: 'player1' });

      const response = await request(app)
        .get('/v1/wallets/player1')
        .expect(200);

      expect(response.body).toEqual({
        balance: 250,
        inventory: ['sword'],
        claimedRewards: ['daily_bonus']
      });
    });
  });

  describe('Idempotency', () => {
    test('should return same response for duplicate credit request', async () => {
      const body = { amount: 100, reason: 'battle_win' };
      const key = 'test-credit-key';
      
      const response1 = await request(app)
        .post('/v1/wallets/player1/credit')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      const response2 = await request(app)
        .post('/v1/wallets/player1/credit')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      expect(response1.body).toEqual(response2.body);
      
      // Verify balance was only credited once
      const wallet = await request(app)
        .get('/v1/wallets/player1');
      expect(wallet.body.balance).toBe(100);
    });

    test('should return same response for duplicate purchase request', async () => {
      await request(app)
        .post('/v1/wallets/player1/credit')
        .send({ amount: 200, reason: 'initial' });

      const body = { itemId: 'sword', price: 50 };
      const key = 'test-purchase-key';
      
      const response1 = await request(app)
        .post('/v1/wallets/player1/purchase')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      const response2 = await request(app)
        .post('/v1/wallets/player1/purchase')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      expect(response1.body).toEqual(response2.body);
      
      // Verify item was only granted once
      const wallet = await request(app)
        .get('/v1/wallets/player1');
      expect(wallet.body.inventory).toEqual(['sword']);
      expect(wallet.body.balance).toBe(150);
    });

    test('should return same response for duplicate claim request', async () => {
      const body = { playerId: 'player1' };
      const key = 'test-claim-key';
      
      const response1 = await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      const response2 = await request(app)
        .post('/v1/rewards/daily_bonus/claim')
        .set('idempotency-key', key)
        .send(body)
        .expect(200);

      expect(response1.body).toEqual(response2.body);
      
      // Verify reward was only granted once
      const wallet = await request(app)
        .get('/v1/wallets/player1');
      expect(wallet.body.balance).toBe(100);
    });
  });
});
