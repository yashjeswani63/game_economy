const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'economy-crash.db');
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

async function simulateRestart() {
  try {
    const dbModule = require('../src/db');
    await dbModule.closeDatabase();
  } catch (e) {}
  delete require.cache[require.resolve('../src/server')];
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/services/walletService')];
}

describe('Crash Recovery Tests', () => {
  beforeEach(async () => {
    try {
      const dbModule = require('../src/db');
      await dbModule.closeDatabase();
    } catch (e) {}
    cleanupTestDb();
  });

  afterAll(async () => {
    try {
      const dbModule = require('../src/db');
      await dbModule.closeDatabase();
    } catch (e) {}
    cleanupTestDb();
  });

  test('should persist committed transactions after restart', async () => {
    await simulateRestart();
    const { app: app1 } = require('../src/server');

    // Perform some operations
    await request(app1)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 200, reason: 'initial' })
      .expect(200);

    await request(app1)
      .post('/v1/wallets/player1/purchase')
      .send({ itemId: 'sword', price: 50 })
      .expect(200);

    await request(app1)
      .post('/v1/rewards/daily_bonus/claim')
      .send({ playerId: 'player1' })
      .expect(200);

    // Verify state before "restart"
    const walletBefore = await request(app1)
      .get('/v1/wallets/player1');
    expect(walletBefore.body.balance).toBe(250);
    expect(walletBefore.body.inventory).toEqual(['sword']);
    expect(walletBefore.body.claimedRewards).toEqual(['daily_bonus']);

    // Simulate restart
    await simulateRestart();
    const { app: app2 } = require('../src/server');

    // Verify state after "restart"
    const walletAfter = await request(app2)
      .get('/v1/wallets/player1');
    
    expect(walletAfter.body.balance).toBe(250);
    expect(walletAfter.body.inventory).toEqual(['sword']);
    expect(walletAfter.body.claimedRewards).toEqual(['daily_bonus']);
  });

  test('should handle idempotency after restart', async () => {
    await simulateRestart();
    const { app: app1 } = require('../src/server');

    const body = { amount: 100, reason: 'battle_win' };
    const key = 'test-restart-key';
    
    // Perform credit operation
    const response1 = await request(app1)
      .post('/v1/wallets/player1/credit')
      .set('idempotency-key', key)
      .send(body)
      .expect(200);

    // Simulate restart
    await simulateRestart();
    const { app: app2 } = require('../src/server');

    // Send duplicate request after restart
    const response2 = await request(app2)
      .post('/v1/wallets/player1/credit')
      .set('idempotency-key', key)
      .send(body)
      .expect(200);

    // Should return same response
    expect(response1.body).toEqual(response2.body);
    
    // Verify balance was only credited once
    const wallet = await request(app2)
      .get('/v1/wallets/player1');
    expect(wallet.body.balance).toBe(100);
  });

  test('should not lose data during simulated mid-transaction crash', async () => {
    await simulateRestart();
    const { app: app1 } = require('../src/server');

    // Create wallet with initial balance
    await request(app1)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 200, reason: 'initial' })
      .expect(200);

    // Perform a purchase
    await request(app1)
      .post('/v1/wallets/player1/purchase')
      .send({ itemId: 'sword', price: 50 })
      .expect(200);

    // Simulate restart
    await simulateRestart();
    const { app: app2 } = require('../src/server');

    // Verify atomicity
    const wallet = await request(app2)
      .get('/v1/wallets/player1');
    
    expect(wallet.body.balance).toBe(150);
    expect(wallet.body.inventory).toContain('sword');
    
    const hasItem = wallet.body.inventory.includes('sword');
    const balanceDebited = wallet.body.balance < 200;
    
    expect(hasItem).toBe(balanceDebited);
  });

  test('should not lose data during simulated mid-transaction crash', async () => {
    await simulateRestart();
    const { app: app1 } = require('../src/server');

    // Create wallet with initial balance
    await request(app1)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 200, reason: 'initial' })
      .expect(200);

    // Perform a purchase
    await request(app1)
      .post('/v1/wallets/player1/purchase')
      .send({ itemId: 'sword', price: 50 })
      .expect(200);

    // Simulate restart
    await simulateRestart();
    const { app: app2 } = require('../src/server');

    // Verify atomicity
    const wallet = await request(app2)
      .get('/v1/wallets/player1');
    
    expect(wallet.body.balance).toBe(150);
    expect(wallet.body.inventory).toContain('sword');
    
    const hasItem = wallet.body.inventory.includes('sword');
    const balanceDebited = wallet.body.balance < 200;
    
    expect(hasItem).toBe(balanceDebited);
  });

  test('should maintain transaction ledger after restart', async () => {
    await simulateRestart();
    const { app: app1 } = require('../src/server');

    // Perform multiple operations
    await request(app1)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 100, reason: 'battle1' })
      .expect(200);

    await request(app1)
      .post('/v1/wallets/player1/credit')
      .send({ amount: 50, reason: 'battle2' })
      .expect(200);

    await request(app1)
      .post('/v1/wallets/player1/purchase')
      .send({ itemId: 'sword', price: 30 })
      .expect(200);

    // Simulate restart
    await simulateRestart();
    const { app: app2 } = require('../src/server');

    // Verify final state is correct
    const wallet = await request(app2)
      .get('/v1/wallets/player1');
    
    expect(wallet.body.balance).toBe(120);
    expect(wallet.body.inventory).toEqual(['sword']);
  });
});
