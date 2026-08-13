# Amtrix Admin Backend

Node.js (ES modules) + Express + Mongoose REST API for the Amtrix admin UI. Entry point `src/index.js`, Express app in `src/app.js`, routes under `src/routes/`, models under `src/models/`. See `README.md` for the full API list.

## Cursor Cloud specific instructions

### Running the service
- Dev server: `npm run dev` (nodemon, hot reload) — serves on `http://localhost:5000`. Production-style: `npm start`. There is no build step, no lint config, and no test suite in this repo.
- Database: with no `MONGODB_URI` set, the backend auto-starts an in-memory MongoDB (`mongodb-memory-server`) — this is the default zero-config dev path. To use a persistent DB instead, set `MONGODB_URI` in a `.env` file (gitignored; see `README.md`).

### MongoDB on Ubuntu 24.04 (important gotcha)
- The default `mongodb-memory-server` binary (MongoDB 5.0.x) links `libcrypto.so.1.1`, which does NOT exist on Ubuntu 24.04 (noble ships OpenSSL 3). The server crashes on startup with a `libcrypto.so.1.1` error unless overridden.
- Fix (already applied on this VM via `~/.bashrc`): `MONGOMS_VERSION=6.0.14` and `MONGOMS_DISTRO=ubuntu-22.04`. MongoDB 6.0.x ships an OpenSSL-3 build and still supports the `ephemeralForTest` storage engine that this version of `mongodb-memory-server` requests. Newer MongoDB (7.0+) removed `ephemeralForTest`, so do NOT bump to 7.x with this mongodb-memory-server version.
- Run `npm run dev` from a login shell so these exports are picked up. The downloaded mongod binary is cached under `~/.cache/mongodb-binaries/`.

### Seeding / logging in (gotcha)
- `src/seed/seedData.js` exports `seedDefaultData`, but it is NOT wired into startup and there is no `src/data/` directory, so the database starts empty. User creation (`POST /api/users`) requires an auth token, and login requires an existing user — so out of the box there is no way to log in.
- To exercise auth/CRUD end-to-end, insert a user directly first, e.g. run a one-off script that connects with the `src/models/User.js` model and creates a user (fields: `id`, `email`, `password`, `name`, `role`), then `POST /api/auth/login` with that email/password to get a JWT and call the authenticated routes with `Authorization: Bearer <token>`.
