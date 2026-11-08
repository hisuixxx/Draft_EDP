# ServeSync

ServeSync is a MySQL-backed restaurant digital menu and ordering system built on the existing XianFire-style Express application structure.

## Stack

- Node.js 24+
- Express
- Sequelize with MySQL
- Handlebars-compatible `.xian` views
- Laragon MySQL

## Local setup

1. Start **Apache** (optional) and **MySQL** in Laragon.
2. Copy `.env.example` to `.env`.
3. Set `DB_USER`, `DB_PASSWORD`, and `SESSION_SECRET` in `.env`.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Initialize the database and default administrator:

   ```bash
   npm run migrate
   ```

   The migration creates `servesync_db` when it does not exist and synchronizes the Sequelize tables without dropping existing records.

6. Start the application:

   ```bash
   npm start
   ```

Open <http://localhost:3000>.

The migration prints a one-time initial administrator password when it creates the first administrator. Set `ADMIN_PASSWORD` in `.env` if you want to choose it explicitly, and change it after signing in.

## Current roles

- **Administrator:** menu, users, orders, reports, and account controls.
- **Staff:** order intake and status processing.
- **Customer:** registration, menu browsing, checkout, and order history.

All role checks are enforced by server middleware. Payment methods that are not verified online remain unpaid until a real payment workflow is added.

## Database

The current schema includes users, categories, menu items, restaurant settings, orders, order items, payments, order status history, inventory transactions, and audit logs, with Sequelize relationships and transactional order creation/inventory changes.

Administrators can manage categories and restaurant settings, export completed-sales reports as CSV, review audit logs, and adjust tracked inventory. Existing legacy menu records remain supported through their original category text; new products can be assigned to active category records.

## Development

Run route inspection with:

```bash
npm run route:list
```

Use Git history for verified feature commits and test results. A local development log may be maintained separately from the deployable application files.
