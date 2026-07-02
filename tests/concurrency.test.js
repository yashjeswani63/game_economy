const path = require('path');
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'economy-concurrency.db');
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

describe('Concurrency Tests', () => {
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

  describe('Concurrent credits to same wallet', () => {
    test('should handle concurrent credit requests correctly', async () => {
      const playerId = 'player1';
      const creditAmount = 10;
      const numRequests = 10;

      // Create initial wallet
      await request(app)
        .post(`/v1/wallets/${playerId}/credit`)
        .send({ amount: 100, reason: 'initial' });

      // Send concurrent credit requests
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .post(`/v1/wallets/${playerId}/credit`)
            .send({ amount: creditAmount, reason: 'battle_win' })
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify final balance
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      const expectedBalance = 100 + (creditAmount * numRequests);
      expect(wallet.body.balance).toBe(expectedBalance);
    });
  });

  describe('Concurrent purchases with limited balance', () => {
    test('should prevent double-spend on concurrent purchases', async () => {
      const playerId = 'player1';
      const initialBalance = 100;
      const itemPrice = 60;
      const numRequests = 5;

      // Create initial wallet
      await request(app)
        .post(`/v1/wallets/${playerId}/credit`)
        .send({ amount: initialBalance, reason: 'initial' });

      // Send concurrent purchase requests (only 1 should succeed)
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .post(`/v1/wallets/${playerId}/purchase`)
            .send({ itemId: `item_${i}`, price: itemPrice })
        );
      }

      const responses = await Promise.allSettled(promises);

      // Count successes and failures
      let successes = 0;
      let failures = 0;
      
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.status === 200) {
            successes++;
          } else {
            failures++;
          }
        } else {
          failures++;
        }
      });

      // Exactly one should succeed
      expect(successes).toBe(1);
      expect(failures).toBe(numRequests - 1);

      // Verify balance is correct (should be 40 after one purchase)
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      expect(wallet.body.balance).toBe(initialBalance - itemPrice);
      
      // Verify only one item was granted
      expect(wallet.body.inventory.length).toBe(1);
    });

    test('should allow multiple purchases when balance permits', async () => {
      const playerId = 'player1';
      const initialBalance = 200;
      const itemPrice = 50;
      const numRequests = 3;

      // Create initial wallet
      await request(app)
        .post(`/v1/wallets/${playerId}/credit`)
        .send({ amount: initialBalance, reason: 'initial' });

      // Send concurrent purchase requests (all should succeed)
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .post(`/v1/wallets/${playerId}/purchase`)
            .send({ itemId: `item_${i}`, price: itemPrice })
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify final balance
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      const expectedBalance = initialBalance - (itemPrice * numRequests);
      expect(wallet.body.balance).toBe(expectedBalance);
      
      // Verify all items were granted
      expect(wallet.body.inventory.length).toBe(numRequests);
    });
  });

  describe('Concurrent duplicate requests', () => {
    test('should handle identical concurrent requests idempotently', async () => {
      const playerId = 'player1';
      const body = { amount: 100, reason: 'battle_win' };
      const numRequests = 5;
      const key = 'test-concurrent-key';

      // Send identical concurrent requests
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .post(`/v1/wallets/${playerId}/credit`)
            .set('idempotency-key', key)
            .send(body)
        );
      }

      const responses = await Promise.all(promises);

      // All should return the same response
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body).toEqual(firstResponse);
      });

      // Verify balance was only credited once
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      expect(wallet.body.balance).toBe(100);
    });
  });

  describe('Concurrent reward claims', () => {
    test('should prevent duplicate reward claims from concurrent requests', async () => {
      const playerId = 'player1';
      const rewardId = 'daily_bonus';
      const numRequests = 5;

      // Send concurrent claim requests
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(
          request(app)
            .post(`/v1/rewards/${rewardId}/claim`)
            .send({ playerId })
        );
      }

      const responses = await Promise.allSettled(promises);

      // Count successes and failures
      let successes = 0;
      let failures = 0;
      
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.status === 200) {
            successes++;
          } else {
            failures++;
          }
        } else {
          failures++;
        }
      });

      // Exactly one should succeed
      expect(successes).toBe(1);
      expect(failures).toBe(numRequests - 1);

      // Verify balance is correct
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      expect(wallet.body.balance).toBe(100);
      expect(wallet.body.claimedRewards).toContain(rewardId);
    });
  });

  describe('Mixed concurrent operations', () => {
    test('should handle mixed concurrent operations correctly', async () => {
      const playerId = 'player1';
      
      // Create initial wallet
      await request(app)
        .post(`/v1/wallets/${playerId}/credit`)
        .send({ amount: 200, reason: 'initial' });

      // Send mixed concurrent operations
      const promises = [
        request(app)
          .post(`/v1/wallets/${playerId}/credit`)
          .send({ amount: 50, reason: 'battle_win' }),
        request(app)
          .post(`/v1/wallets/${playerId}/purchase`)
          .send({ itemId: 'sword', price: 30 }),
        request(app)
          .post(`/v1/wallets/${playerId}/purchase`)
          .send({ itemId: 'shield', price: 40 }),
        request(app)
          .post(`/v1/rewards/daily_bonus/claim`)
          .send({ playerId }),
        request(app)
          .get(`/v1/wallets/${playerId}`)
      ];

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect([200, 400]).toContain(response.status);
      });

      // Verify final state
      const wallet = await request(app)
        .get(`/v1/wallets/${playerId}`);
      
      // Initial 200 + credit 50 + reward 100 - sword 30 - shield 40 = 280
      expect(wallet.body.balance).toBe(280);
      expect(wallet.body.inventory.length).toBe(2);
      expect(wallet.body.claimedRewards).toContain('daily_bonus');
    });
  });
});
