const request = require('supertest');
const { app, ensureDbInitialized } = require('../src/server');
const { closeDatabase, clearDatabase } = require('../src/db');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'economy-wallet.db');
process.env.DB_PATH = TEST_DB_PATH;

function cleanupTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

describe('Wallet API Tests - Credit Feature Only', () => {
  beforeAll(async () => {
    await ensureDbInitialized();
  });

  test('should claim reward for first time', async () => {
    const response = await request(app).post('/v1/rewards/daily_bonus/claim').send({ playerId: 'player1' }).expect(200);
    expect(response.body.success).toBe(true);
  });
});

  test('should reject purchase with insufficient funds', async () => {
    await request(app).post('/v1/wallets/player1/purchase').send({ itemId: 'sword', price: 100 }).expect(400);
  });
});
  beforeEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await closeDatabase();
    cleanupTestDb();
  });

  test('should credit currency to a new wallet', async () => {
    const response = await request(app)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 100, reason: 'initial_grant' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.balance).toBe(100);
  });
});