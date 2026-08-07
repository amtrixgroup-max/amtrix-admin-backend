# Amtrix Admin Backend

This backend provides a Node.js + MongoDB API for the Amtrix admin UI.

## Available APIs

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/profile`
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PUT /api/users/:id`
- `GET /api/roles`
- `GET /api/customers`
- `GET /api/customers/:id`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `GET /api/dashboard`
- `GET /api/activity-logs`
- `GET /api/settings`
- `GET /api/onboarding/user-types`
- `GET /api/onboarding/careers`
- `GET /api/onboarding/customers`
- `GET /api/onboarding/all`

## Setup

1. Install dependencies

   ```bash
   cd backend
   npm install
   ```

2. Create a `.env` file if you want to override defaults:

   ```ini
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/amtrix-admin-backend
   JWT_SECRET=supersecretkey
   ```

3. Run the server:

   ```bash
   npm start
   ```

The server seeds default users, roles, and customers on first startup if the database is empty. If `MONGODB_URI` is not configured, the backend automatically falls back to an in-memory MongoDB instance for local development.
