# Design Document: Game Economy Service

## Architecture Overview

The economy service is a Node.js application using Express for HTTP handling and SQLite (via sqlite3) for data persistence. The service implements a wallet/economy system with exactly-once semantics and crash durability.

### Components

- **server.js**: HTTP server with Express, routing, and middleware
- **walletService.js**: Core business logic for wallet operations
- **db.js**: Database initialization and connection management
- **validator.js**: Input validation and sanitization

## Datastore Choice: SQLite with sqlite3

### Why SQLite?

I chose SQLite for this implementation because:

1. **ACID Guarantees**: SQLite provides full ACID (Atomicity, Consistency, Isolation, Durability) compliance out of the box. Transactions are atomic - either all operations commit or none do. This is critical for preventing partial states like a debit without an item grant.

2. **Durability**: With `PRAGMA synchronous = FULL`, SQLite ensures data is written to disk before acknowledging transactions. Combined with WAL (Write-Ahead Logging) mode, this provides excellent crash recovery. If the process is killed mid-transaction, SQLite rolls back the incomplete transaction on restart.

3. **Simplicity**: No external database server needed. The database is a single file that persists across process restarts. This matches the requirement for a runnable service without complex infrastructure.

4. **Concurrency**: WAL mode allows multiple readers and a single writer to operate concurrently. For a game economy service, this is sufficient - most operations are reads (wallet checks) with occasional writes.

5. **sqlite3**: This library provides an async API with callback-based operations, which allows for non-blocking database operations. Transactions are handled with explicit BEGIN/COMMIT/ROLLBACK statements, ensuring atomicity.

### Trade-offs

- **Single Writer**: SQLite WAL mode allows only one concurrent writer. For a high-throughput game, this could be a bottleneck. However, for this task's scope, it's acceptable.
- **Scaling**: SQLite doesn't scale horizontally. If the service needs to scale beyond a single instance, PostgreSQL or MySQL would be better choices.

## Exactly-Once Strategy

### Idempotency Keys

The service uses idempotency keys to ensure exactly-once processing:

1. **Key Provision**: Clients provide an idempotency key via the `Idempotency-Key` header. If the header is present, the server validates and caches it. If the header is absent, the request is processed as a standard, non-idempotent transaction (which lets business validation errors trigger naturally on duplicates).

2. **Key Storage**: Keys are stored in the `idempotency_keys` table with:
   - The key itself (primary key)
   - The response body (JSON)
   - The HTTP status code
   - Expiration timestamp (24 hours)

3. **Processing Flow**:
   - On receiving a request, check if the idempotency key exists
   - If it exists, return the cached response immediately
   - If not, process the request, store the response, and return it

4. **Key Retention**: Keys are retained for 24 hours. A background job runs hourly to clean up expired keys.

### Why This Works

- **Duplicate Detection**: The same request (same body) generates the same key, so retries hit the cache
- **Same Response**: The cached response ensures clients get identical responses for retries
- **No Double Effects**: The actual business logic only executes once; subsequent requests return the cached result

### Natural Idempotency for Rewards

For reward claims, there's a secondary idempotency mechanism: the `claimed_rewards` table has a composite primary key on `(player_id, reward_id)`. This naturally prevents duplicate claims at the database level, providing defense in depth.

## Atomicity & Durability Strategy

### What is Atomic?

All mutating operations (credit, purchase, claim) are wrapped in SQLite transactions started explicitly:

```javascript
await runQuery(db, 'BEGIN IMMEDIATE TRANSACTION');
// Multiple operations
await runQuery(db, 'COMMIT');
```

Specifically:
- **Credit**: Balance update + transaction ledger entry
- **Purchase**: Balance debit + inventory insert + transaction ledger entry
- **Claim**: Balance update + claimed_rewards insert + transaction ledger entry

### Kill -9 Mid-Purchase Scenario

If the process is killed mid-purchase:

1. **Before Commit**: If killed before the transaction commits, SQLite rolls back all changes. The balance is not debited, and the item is not granted. No partial state.

2. **After Commit**: If killed after commit, both the debit and grant are durable. On restart, the state is consistent.

3. **During WAL Checkpoint**: WAL mode ensures that even if killed during a checkpoint, the database can recover to a consistent state using the WAL file.

### Isolation Level

The service utilizes an application-level serialization mutex queue and `BEGIN IMMEDIATE TRANSACTION` to lock the write operations during the transaction, ensuring concurrent purchases see a consistent balance.

## API Contract Details

### Endpoints

#### POST /v1/wallets/{playerId}/credit

**Request Body**:
```json
{
  "amount": 100,
  "reason": "battle_win"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "balance": 100
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": "amount must be greater than 0"
}
```

#### POST /v1/wallets/{playerId}/purchase

**Request Body**:
```json
{
  "itemId": "sword",
  "price": 50
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "balance": 150,
  "itemId": "sword"
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": "Insufficient funds"
}
```

#### POST /v1/rewards/{rewardId}/claim

**Request Body**:
```json
{
  "playerId": "player1"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "balance": 100,
  "rewardId": "daily_bonus"
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": "Reward already claimed"
}
```

#### GET /v1/wallets/{playerId}

**Success Response (200)**:
```json
{
  "balance": 250,
  "inventory": ["sword", "shield"],
  "claimedRewards": ["daily_bonus", "welcome"]
}
```

### Status Codes

- **200**: Success
- **400**: Bad request (validation error, insufficient funds, already claimed)
- **500**: Internal server error

### Limits

- **Amount/Price**: Must be positive integers ≤ Number.MAX_SAFE_INTEGER
- **String Lengths**: All string fields (playerId, itemId, rewardId, reason) max 255 characters
- **Request Body**: Max 1MB
- **Idempotency Key Retention**: 24 hours

## Currency Units

Currency is represented as integers in the database. The unit is abstract "coins" - the service doesn't define real-world currency conversion. This is typical for game economies where you have an in-game currency.

## Concurrency Correctness

### Double-Spend Prevention

The purchase operation uses an application-level promise serialization queue to execute sequentially:

```sql
BEGIN IMMEDIATE TRANSACTION;
```

This locks the database for writing immediately at transaction start, serializing concurrent writes.

### Lost Update Prevention

All balance updates use atomic SQL:

```sql
UPDATE wallets SET balance = balance + ? WHERE player_id = ?
```

This is a single atomic operation at the database level, preventing lost updates.

### Race Condition Example

Two concurrent purchases on a wallet with balance 100, each costing 60:

1. Transaction A reads balance = 100, locks row
2. Transaction B waits for lock
3. Transaction A checks 100 >= 60, updates balance to 40, commits
4. Transaction B acquires lock, reads balance = 40
5. Transaction B checks 40 >= 60, fails, rolls back

Result: Exactly one purchase succeeds, balance is 40. No double-spend.

## Audit Trail

The `transaction_ledger` table records all operations for debugging and auditing:

- player_id
- transaction_type (credit, purchase, claim)
- amount (for credits/purchases)
- item_id (for purchases)
- reward_id (for claims)
- idempotency_key
- created_at

This provides a complete history of all economy changes, useful for debugging issues or detecting anomalies.

## Error Handling

All errors are caught and returned with consistent JSON responses:

- **Validation Errors**: 400 with specific error message
- **Business Logic Errors**: 400 with specific error message (e.g., "Insufficient funds")
- **Unexpected Errors**: 500 with generic error message

Input validation happens at the boundary before any business logic, preventing malformed input from reaching the database.
