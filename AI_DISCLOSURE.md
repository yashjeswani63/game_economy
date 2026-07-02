# AI Tool Disclosure

I used Gemini (an AI coding assistant) as a helper while building this economy service. Here's a breakdown of how AI was used:

## Work Distribution

- **Human Work (80%)**: Full design and implementation of the application code logic, including wallet services, database transactions, concurrency control, and serialization.
- **AI Assistance (20%)**: Gemini was used for generating documentation, drafting test cases, debugging assistance, and setting up the project folder structure.

## Human Contributions

- **Core Code Logic**: Designed and implemented all business rules, database queries, transactions (`BEGIN IMMEDIATE`), and serialization layers in `src/services/walletService.js`, `src/db.js`, `src/server.js`, and `src/middleware/errorHandler.js`.
- **Database Schema & Integrity**: Designed the schema and transaction model ensuring SQLite WAL mode consistency.
- **Architecture**: Designed the application-level promise queue and transaction synchronization.

## AI Assistance (Gemini)

- **Documentation**: Aided in formatting and detailing `DESIGN.md`, `RESILIENCE.md`, and `README.md`.
- **Test Development**: Assisted in drafting the initial structure and assertions of test suites (`tests/wallet.test.js`, `tests/concurrency.test.js`, and `tests/crash-recovery.test.js`).
- **Debugging**: Assisted in identifying and resolving concurrency bottlenecks, syntax closures, and database locking issues during test execution.
- **Project Structure**: Suggested the standard folder organization and setup templates.

## AI Tool Details

- **Tool**: Gemini
- **Usage**: Restricted to documentation, project structure, test suites, and debugging assistance.
- **Role**: Code helper for structure, testing, debugging, and docs.

## Integrity Statement

This disclosure accurately represents the AI's involvement in this project. The core application logic was entirely written by the human developer, with Gemini assisting with documentation, tests, debugging, and file structures.
