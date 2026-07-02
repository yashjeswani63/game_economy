const express = require('express');
const { initDatabase, cleanupExpiredIdempotencyKeys, getDb } = require('./db');
const { errorHandler } = require('./middleware/errorHandler');
const walletRoutes = require('./routes/walletRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

async function ensureDbInitialized() {
  await getDb();
}

app.use(express.json({ limit: '1mb' }));

app.use('/v1', walletRoutes);

app.use(errorHandler);

if (require.main === module) {
  (async () => {
    try {
      await ensureDbInitialized();
      setInterval(async () => {
        try {
          const deleted = await cleanupExpiredIdempotencyKeys();
          if (deleted > 0) {
            console.log(`Cleaned up ${deleted} expired idempotency keys`);
          }
        } catch (error) {
          console.error('Error cleaning up idempotency keys:', error);
        }
      }, 60 * 60 * 1000);

      app.listen(PORT, () => {
        console.log(`Economy service running on port ${PORT}`);
      });
    } catch (error) {
      console.error('Failed to initialize database:', error);
      process.exit(1);
    }
  })();
}

module.exports = { app, ensureDbInitialized };
