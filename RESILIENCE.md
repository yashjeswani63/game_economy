# Resilience: Distributed System Scenarios

## Scenario: Separate Inventory Service

### The Problem

The item grant operation moves to a separate inventory service, reachable over HTTP. This service can:
- Time out
- Return errors (5xx, 4xx)
- Process requests twice (due to its own retries)
- Be unavailable entirely

Critically, the inventory service **cannot share a database transaction** with the currency store. This breaks the atomicity guarantee we had with a single database.

### The Partial-Failure Window

The partial-failure window is the time between:
1. **Debiting the player's balance** (in currency service)
2. **Granting the item** (in inventory service)

If the process crashes, network fails, or inventory service times out during this window, we can have:
- Balance debited but item not granted (player loses money, gets nothing)
- Item granted but balance not debited (player gets free item)

### Solution: Outbox Pattern with Idempotency

I would implement the **outbox pattern** to ensure exactly-once semantics end-to-end:

#### Architecture

1. **Outbox Table**: Add an `outbox_events` table to the currency database:
   ```sql
   CREATE TABLE outbox_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     event_type TEXT NOT NULL,
     payload TEXT NOT NULL,
     target_service TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     idempotency_key TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     processed_at INTEGER,
     UNIQUE(idempotency_key)
   );
   ```

2. **Purchase Flow**:
   - Start transaction in currency database
   - Debit balance
   - Insert outbox event (status: pending) with item grant details
   - Commit transaction (both debit and outbox are atomic)
   - Return success to client

3. **Event Processor** (background worker):
   - Polls outbox table for pending events
   - For each pending event:
     - Call inventory service API with idempotency key
     - On success: mark event as processed
     - On retryable error: leave pending for retry
     - On permanent error: mark as failed, trigger compensation

4. **Idempotency in Inventory Service**:
   - Inventory service must also implement idempotency keys
   - Duplicate grant requests with same key return same result
   - This handles the case where the event processor retries

#### Why This Works

- **Atomicity**: Debit and outbox insert are in the same transaction. Either both happen or neither.
- **Durability**: Outbox event persists even if process crashes. Event processor will retry.
- **Exactly-Once**: Inventory service's idempotency ensures duplicate grant requests don't double-grant.
- **No Lost Updates**: If inventory service is temporarily down, events stay pending and retry later.

#### Failure Scenarios

| Failure Point | State | Recovery |
|---|---|---|
| After debit, before outbox insert | Transaction rolls back, no debit | No action needed |
| After outbox insert, before inventory call | Balance debited, event pending | Event processor retries |
| During inventory call (timeout) | Balance debited, event pending | Event processor retries with idempotency key |
| After inventory success, before marking processed | Item granted, event pending | Event processor retries, inventory service returns cached response, event marked processed |
| Inventory service processes request twice | Idempotency key prevents double-grant | No issue |

#### Compensation

If the inventory service permanently fails (e.g., item doesn't exist), the event processor marks the event as failed. A separate compensation process can:
- Credit the player's balance back
- Notify operators for manual intervention
- Move to a dead-letter queue for investigation

### Alternative: Saga Pattern

For more complex multi-step operations, a saga pattern could be used:
1. Execute step 1 (debit balance)
2. Execute step 2 (grant item)
3. If step 2 fails, execute compensating transaction (credit balance back)

However, sagas are more complex and the outbox pattern is sufficient for this use case.

## Sub-Question: Detecting and Correcting Double-Grant Bug

### Scenario

A bug last week double-granted currency to some players. We need to detect and correct this without downtime.

### Detection

1. **Invariant-Based Detection**:
   - Define invariant: `sum(credits) - sum(debits) = current_balance` for each player
   - Run a reconciliation job that:
     - Sums all credit transactions from `transaction_ledger`
     - Sums all debit transactions (purchases) from `transaction_ledger`
     - Compares to current balance in `wallets` table
   - Flag players where the invariant doesn't hold

2. **Audit Trail Analysis**:
   - Query `transaction_ledger` for duplicate idempotency keys
   - Look for multiple credit transactions with same key but different amounts
   - Check for credits without corresponding idempotency entries

3. **Real-Time Monitoring**:
   - Add a check that runs after each transaction
   - Verify the invariant holds
   - Alert if violated

### Correction

1. **Immediate Correction**:
   - For affected players, calculate the correct balance from the ledger
   - Update the balance in the `wallets` table
   - Log the correction in a separate `corrections` table for audit

2. **Rollback Strategy**:
   - If the bug was in a specific time window, identify all credits in that window
   - Verify which were duplicated (via idempotency key analysis)
   - Revert the excess credits

3. **Prevention**:
   - Add a database constraint: `CHECK(balance >= 0)` (already present)
   - Add application-level invariant checks
   - Improve idempotency key handling to prevent the bug

### What Would Have Caught It Sooner

1. **Invariant Checking in Tests**:
   - Add a test that verifies the balance invariant after random sequences of operations
   - This would catch bugs that violate the invariant

2. **Idempotency Key Uniqueness Constraint**:
   - The current implementation has a unique constraint on idempotency keys
   - If the bug bypassed this, we need to ensure all code paths use idempotency keys

3. **Audit Trail Monitoring**:
   - A real-time monitor that checks for duplicate idempotency keys
   - Alerts when a key is used twice with different effects

4. **Comprehensive Integration Tests**:
   - Tests that simulate the exact bug scenario
   - Tests that verify idempotency under various failure modes

### Implementation Example

```javascript
// Reconciliation job
function reconcilePlayerBalances() {
  const db = getDb();
  
  const players = db.prepare('SELECT player_id FROM wallets').all();
  
  for (const player of players) {
    const credits = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transaction_ledger 
      WHERE player_id = ? AND transaction_type = 'credit'
    `).get(player.player_id).total;
    
    const debits = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transaction_ledger 
      WHERE player_id = ? AND transaction_type = 'purchase'
    `).get(player.player_id).total;
    
    const expectedBalance = credits - debits;
    const actualBalance = db.prepare(
      'SELECT balance FROM wallets WHERE player_id = ?'
    ).get(player.player_id).balance;
    
    if (expectedBalance !== actualBalance) {
      console.error(`Invariant violation for ${player.player_id}: expected ${expectedBalance}, actual ${actualBalance}`);
      
      // Correct the balance
      db.prepare(
        'UPDATE wallets SET balance = ? WHERE player_id = ?'
      ).run(expectedBalance, player.player_id);
      
      // Log the correction
      db.prepare(`
        INSERT INTO balance_corrections (player_id, old_balance, new_balance, corrected_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
      `).run(player.player_id, actualBalance, expectedBalance);
    }
  }
}
```

### Summary

For distributed systems where transactions can't span services, the outbox pattern provides exactly-once semantics with idempotency. For detecting bugs like double-grants, invariant checking and audit trail analysis are essential, and these should be implemented as both reactive corrections and proactive monitoring.
