# Game Economy Service

A wallet/economy service for games that ensures exactly-once semantics and crash durability. The service handles currency credits, item purchases, and one-time reward claims with strong consistency guarantees.

## Features

- **Exactly-once processing**: Duplicate requests produce exactly one effect
- **Crash durability**: Survives kill -9 at any point with ACID guarantees
- **Concurrency safety**: Prevents double-spends under concurrent access
- **Input validation**: Rejects malformed or malicious inputs at the boundary
- **Audit trail**: Complete transaction ledger for debugging and reconciliation

## Tech Stack

- **Runtime**: Node.js 18+
- **HTTP Server**: Express
- **Database**: SQLite with sqlite3 (ACID compliant)
- **Testing**: Jest + Supertest

## Build & Run Instructions

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- **Alternative**: Use Docker (recommended - no build tools required)

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will start on port 3000 (configurable via PORT environment variable).

### Docker

1. Build the Docker image:
```bash
docker build -t economy-service .
```

2. Run the container:

use docker-compose:
```bash
docker-compose up
```

### Running Tests

Run the full test suite:
```bash
npm test
```

The test suite includes:
- Basic API functionality tests
- Concurrency tests (simulates concurrent requests)
- Crash recovery tests (simulates server restart)

## API Usage

### Credit Currency

Add currency to a player's wallet (simulates a battle payout):

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/credit \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "reason": "battle_win"}'
```

Response:
```json
{
  "success": true,
  "balance": 100
}
```

### Purchase Item

Atomically debit balance and grant an item:

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/purchase \
  -H "Content-Type: application/json" \
  -d '{"itemId": "sword", "price": 50}'
```

Response:
```json
{
  "success": true,
  "balance": 50,
  "itemId": "sword"
}
```

If insufficient funds:
```json
{
  "success": false,
  "error": "Insufficient funds"
}
```

### Claim Reward

Claim a one-time reward (100 coins):

```bash
curl -X POST http://localhost:3000/v1/rewards/daily_bonus/claim \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player1"}'
```

Response:
```json
{
  "success": true,
  "balance": 150,
  "rewardId": "daily_bonus"
}
```

If already claimed:
```json
{
  "success": false,
  "error": "Reward already claimed"
}
```

### Get Wallet State

Retrieve a player's current balance, inventory, and claimed rewards:

```bash
curl http://localhost:3000/v1/wallets/player1
```

Response:
```json
{
  "balance": 150,
  "inventory": ["sword"],
  "claimedRewards": ["daily_bonus"]
}
```

## Idempotency

The service automatically handles duplicate requests. Send the same request twice:

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/credit \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "reason": "battle_win"}'

# Send again - same response, balance only credited once
curl -X POST http://localhost:3000/v1/wallets/player1/credit \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "reason": "battle_win"}'
```

Both requests return the same response, and the balance is only credited once.

You can also provide a custom idempotency key via header:

```bash
curl -X POST http://localhost:3000/v1/wallets/player1/credit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-custom-key-123" \
  -d '{"amount": 100, "reason": "battle_win"}'
```

## Error Handling

The service returns consistent error responses:

- **400**: Bad request (validation error, insufficient funds, already claimed)
- **500**: Internal server error

Example error response:
```json
{
  "success": false,
  "error": "amount must be greater than 0"
}
```

## Data Persistence

The SQLite database is stored in `data/economy.db`. This file persists across server restarts. When running in Docker, mount this directory as a volume to persist data.

## Architecture & Design Decisions

See [DESIGN.md](DESIGN.md) for:
- Datastore choice and justification
- Exactly-once strategy
- Atomicity and durability guarantees
- API contract details
- Concurrency handling

## Distributed System Resilience

See [RESILIENCE.md](RESILIENCE.md) for:
- Handling separate inventory service (outbox pattern)
- Detecting and correcting double-grant bugs
- Invariant-based reconciliation

## Health Check

Check if the service is running:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy"
}
```

## Limits

- **Amount/Price**: Positive integers ≤ Number.MAX_SAFE_INTEGER
- **String Lengths**: Max 255 characters for all string fields
- **Request Body**: Max 1MB
- **Idempotency Key Retention**: 24 hours

## License

ISC
