const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'economy.db');

let db;
let initPromise = null;

function initDatabase() {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        initPromise = null;
        reject(err);
        return;
      }

      db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) {
          console.error('Error setting WAL mode:', err);
        }
        
        db.run('PRAGMA busy_timeout = 10000', (err) => {
          if (err) {
            console.error('Error setting busy timeout:', err);
          }
          
          db.run('PRAGMA synchronous = FULL', (err) => {
            if (err) {
              console.error('Error setting synchronous mode:', err);
            }
            
            createTables().then(() => {
              resolve(db);
            }).catch((err) => {
              initPromise = null;
              reject(err);
            });
          });
        });
      });
    });
  });

  return initPromise;
}

function createTables() {
  return new Promise((resolve, reject) => {
    const tables = [
      `CREATE TABLE IF NOT EXISTS wallets (
        player_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`,

      `CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        UNIQUE(player_id, item_id),
        FOREIGN KEY (player_id) REFERENCES wallets(player_id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS claimed_rewards (
        player_id TEXT NOT NULL,
        reward_id TEXT NOT NULL,
        claimed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (player_id, reward_id),
        FOREIGN KEY (player_id) REFERENCES wallets(player_id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        response_body TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL
      )`,

      `CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
       ON idempotency_keys(expires_at)`,

      `CREATE TABLE IF NOT EXISTS transaction_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER,
        item_id TEXT,
        reward_id TEXT,
        reason TEXT,
        idempotency_key TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`,

      `CREATE INDEX IF NOT EXISTS idx_ledger_player 
       ON transaction_ledger(player_id, created_at)`
    ];

    let index = 0;
    
    function executeNext() {
      if (index >= tables.length) {
        resolve();
        return;
      }
      
      db.exec(tables[index], (err) => {
        if (err) {
          reject(err);
          return;
        }
        index++;
        executeNext();
      });
    }
    
    executeNext();
  });
}

async function getDb() {
  if (!db) {
    await initDatabase();
  }
  return db;
}

async function cleanupExpiredIdempotencyKeys() {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM idempotency_keys WHERE expires_at < ?',
      [now],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

async function closeDatabase() {
  if (initPromise) {
    try {
      await initPromise;
    } catch (e) {}
  }

  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          db = null;
          initPromise = null;
          resolve();
        }
      });
    } else {
      db = null;
      initPromise = null;
      resolve();
    }
  });
}

async function clearDatabase() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM transaction_ledger');
      db.run('DELETE FROM claimed_rewards');
      db.run('DELETE FROM inventory');
      db.run('DELETE FROM wallets');
      db.run('DELETE FROM idempotency_keys', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

module.exports = {
  initDatabase,
  getDb,
  cleanupExpiredIdempotencyKeys,
  closeDatabase,
  clearDatabase
};
