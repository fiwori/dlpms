# DLPMS: Digital Land and Property Management System

A web system for the Dire Dawa Land Administration. Citizens can view their land parcels, apply to transfer a parcel to a buyer, pay property tax and book appointments. Land officers review and approve transfers, tax officials assess and collect tax, GIS officers draw parcel boundaries, and administrators manage users, tax rates and the audit trail.

Final-year project, Dire Dawa University Institute of Technology, Department of Information Technology.

---

## 1. Technology

| Part | Technology |
|---|---|
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 16 with PostGIS 3.6 |
| Database access | Prisma 5.22 |
| Login | JSON Web Tokens (JWT), passwords hashed with bcrypt (cost 12) |
| PDFs | pdfkit (certificates and receipts), qrcode (QR codes) |
| Security extras | helmet, cors, express-rate-limit |
| Web app | React 18, Vite 5, Tailwind CSS 3, React Router 6 |
| Map | Leaflet with OpenStreetMap tiles |

## 2. Project layout

```
dlpms-project/
├── backend/
│   ├── prisma/schema.prisma        database design
│   ├── scripts/
│   │   ├── seed.js                 creates the staff accounts
│   │   ├── token.js                prints a login token for testing
│   │   ├── backup.js               database backup
│   │   ├── step18-schema.js        one-time schema patch (already applied)
│   │   └── test-step18.js          automatic tax and payment test
│   └── src/
│       ├── app.js                  routes, security, error handling
│       ├── server.js               starts the server and background jobs
│       ├── lib/                    database client and small helpers
│       ├── middleware/auth.js      login check and role check
│       ├── routes/                 URL definitions
│       ├── controllers/            request handling
│       └── services/               business rules
└── web/
    └── src/
        ├── App.jsx                 menu and page routing by role
        ├── api.js                  talks to the backend
        ├── auth.jsx, i18n.jsx      login state, English and Amharic
        ├── ui.jsx                  shared buttons, tables, forms
        └── pages/                  one file per screen
```

## 3. How to run it

You need Node.js, Git and PostgreSQL 16 with PostGIS installed, and a database named `dlpms`.

**Backend** (in one cmd window):

```
cd backend
npm install
npm run dev
```

It prints `DLPMS API running on http://localhost:4000`. The settings live in `backend/.env`:
`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` and `TELEBIRR_SECRET`. This file is never committed.

**Web app** (in a second cmd window):

```
cd web
npm install
npm run dev
```

Open http://localhost:5173. The web app forwards every `/api` request to the backend, so both must be running.

**Handy commands** (in the `backend` folder):

| Command | What it does |
|---|---|
| `npm run seed` | Creates the four staff accounts (safe to repeat) |
| `node scripts\token.js <phone> <password>` | Prints a login token for command-line tests |
| `npm run test18` | Runs the tax and payment test (needs the backend running) |
| `npm run backup` | Saves a database dump into `backend/backups/` |

### Demo accounts

| Role | Phone | Password |
|---|---|---|
| Citizen | 0911000001 | Test12345 |
| Administrator | 0911000100 | Staff12345 |
| Land officer | 0911000200 | Staff12345 |
| Tax official | 0911000300 | Staff12345 |
| GIS officer | 0911000400 | Staff12345 |

Login has two steps: password, then a six-digit one-time code. In demo mode the code is shown on the login screen and printed in the backend window. These accounts and the development database password exist for local work only.

---

## 4. Work completed, step by step

### Steps 1 to 5: Environment and database
- Installed and checked Node.js, Git and PostgreSQL 16.
- Reset the PostgreSQL password, installed PostGIS 3.6.2 and turned it on inside the `dlpms` database.
- Result: a working spatial database.

### Step 6: Project folders and Git
- Created `backend`, `web` and `docs`, started the Git repository, and wrote a `.gitignore` that keeps `.env`, `node_modules` and backups out of Git.

### Steps 7 and 8: Backend packages and Prisma
- Installed Express 4, Prisma 5 and the supporting packages. Removed `nodemon` because of a security warning and used Node's built-in `--watch` instead.
- Connected Prisma to the database.

### Steps 9 and 10: Database design
Tables created from the project document (section 4.8):

| Table | Purpose |
|---|---|
| `users` | Login accounts and roles |
| `owners` | People who own land (with national ID) |
| `land_parcels` | Parcels, area, land use, optional PostGIS boundary, version number |
| `transfer_requests` | Ownership transfer applications and their status |
| `registry_entries` | Ownership history and certificate numbers |
| `tax_records` | Tax assessed per parcel per year |
| `tax_rates` | Rate per square metre for each land use |
| `payment_transactions` | Online and counter payments |
| `audit_logs` | Tamper-evident record of every important action |
| `appointments` | Office visits |

A spatial (GiST) index speeds up boundary searches.

### Step 11: First server
- Express app with security headers, request logging and a central error handler.
- `GET /api/health` confirms the server and database are working.

### Steps 12 and 13: Login and roles (FR-01, 02, 25, 29)
- **Register** always creates a citizen together with an owner profile. A role is never accepted from the request, so nobody can register as an administrator.
- **Login** checks the password, then issues a one-time code (printed to the console in this prototype). **Verify** returns a JWT valid for 8 hours.
- Five roles: Citizen, Land Officer, Tax Official, GIS Officer, System Admin.
- Every request re-reads the user from the database, so deactivating an account or changing a role takes effect immediately.
- Staff accounts are created by `npm run seed` and, later, by the administrator in the web app.

### Step 14: Audit log with a hash chain (FR-34)
- Every important action is recorded: who, what, when, from which address, and the old and new values.
- Each entry stores a SHA-256 hash that includes the hash of the previous entry, so editing or deleting an entry breaks the chain.
- `GET /api/admin/audit-logs/verify` rechecks the whole chain and names the first broken entry.
- Tested by editing an entry directly in the database: the check reported the break, and reported the chain valid again after restoring it.

### Step 15: Owners and land parcels (FR-03, 10, 11, 16, 35)
- Land officers and administrators register owners and parcels; all staff can search by parcel number, kebele, sub-city or owner name.
- Citizens see only their own parcels. Asking for someone else’s returns “not found”.
- Editing a parcel needs the version number you loaded. If someone else changed it first, the edit is refused (optimistic locking).

### Step 16: Transfer workflow (FR-04, 12, 13, 14, 35)
Follows Table 24 of the project document.

| From | To | Triggered by |
|---|---|---|
| Draft | Submitted | Citizen submits (at least one document needed) |
| Submitted | Tax Verified or Tax Hold | Automatic tax check |
| Tax Hold | Submitted, then Tax Verified | Tax paid and re-checked |
| Tax Verified | Under Review | A land officer takes the request |
| Under Review | Documents Requested, Approved or Rejected | Officer decision |
| Documents Requested | Under Review | Citizen adds documents |
| Any active state | Cancelled | Citizen (or admin) cancels |

Rules worth knowing:
- A citizen can only transfer a parcel they currently own, to a buyer who is already registered.
- A parcel can have only one active transfer at a time.
- **Approval is one all-or-nothing database transaction:** it re-checks that the seller still owns the parcel and that tax is cleared, changes the owner, writes the registry entry and certificate number, sets the status and writes the audit entries. If any part fails, nothing is saved. Tested with a stale version number: the approval was refused and the owner stayed unchanged.
- Each request keeps a full history of its steps.

### Step 17: Certificates (FR-07, 32)
- `GET /api/transfers/:id/certificate` returns a PDF with the certificate number, parcel details, both parties, a watermark and a QR code. Only the people involved, and staff, may download it, and only after approval.
- The QR code leads to the public page `GET /api/verify/<certificate number>`, which says whether the certificate is still the latest entry for that parcel and shows only a partly hidden owner name.

### Step 18: Tax and payments (FR-09, 17, 18, 20, 27, 33)
- **Tax rates:** the administrator sets a rate per square metre per land use, optionally for one kebele.
- **Tax records:** a tax official creates one record per parcel per year; the amount is area × rate.
- **Online payment with a mock telebirr:** Initiated → Pending → Processing → Completed or Failed (and Refunded). The gateway’s confirmation message is signed (HMAC-SHA256); the server checks the signature, the amount and the age of the message. Replays are harmless. A payment still pending after 15 minutes becomes Failed.
- **Counter payments:** a tax official records cash, never more than the balance.
- **Receipts:** a PDF for both kinds of payment.
- **Refunds:** an administrator can reverse a completed payment.
- **Automatic tax hold release:** when a payment clears the dues, any transfer on tax hold for that parcel moves on by itself.
- `npm run test18` runs the whole scenario automatically.

### Step 19: GIS boundaries (FR-22, 23, 24)
- GIS officers and administrators save a parcel boundary as a GeoJSON polygon.
- The server refuses shapes that cross themselves and shapes that overlap a neighbouring parcel. Neighbours may share an edge.
- Boundaries can be read back as GeoJSON, with the measured area, or all at once for the map.

### Step 20: Appointments and notifications (FR-08, 30, 31, 36)
- Office hours: Monday to Friday, six one-hour slots a day, bookable up to 30 days ahead.
- A citizen books a slot and the system assigns a free land officer. The database makes double booking impossible.
- Cancelling frees the slot. Officers mark visits completed or no-show.
- An hourly job sends a reminder for appointments in the next 24 hours.
- SMS and email are printed to the backend window in this prototype.

### Step 21: Administration, reports and backup (FR-15, 19, 21, 25, 26, 28)
- **Users:** the administrator creates staff accounts, changes roles, deactivates accounts and resets passwords. An administrator cannot change their own role or status.
- **Reports:** a dashboard summary (parcels, owners, transfers by status, tax assessed, collected and outstanding, payments by method) and CSV downloads of transfers and payments.
- **Backup:** `npm run backup` writes a SQL dump to `backend/backups/`.

### Steps 22 to 24: Web application
Log in once and the menu adapts to your role.

| Role | Pages |
|---|---|
| Citizen | My parcels, Transfers (new request, detail with history and actions), Tax and payments, Appointments |
| Land officer | Dashboard, Transfer requests, Registry, Map, Appointments |
| Tax official | Dashboard, Transfer requests, Registry, Tax desk |
| GIS officer | Registry, Map (draw boundaries) |
| Administrator | All of the above plus Users and Settings (tax rates and audit log with a hash-chain check) |

English and Amharic can be switched from the menu bar. The menus and the login pages are translated so far.

---

## 5. API summary

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Login | `POST /api/auth/register`, `/login`, `/verify-otp`; `GET /api/auth/me` |
| Land | `POST` and `GET /api/owners`; `GET /api/owners/:id`; `POST` and `GET /api/parcels`; `GET /api/parcels/mine`; `GET` and `PATCH /api/parcels/:id` |
| Transfers | `POST /api/transfers`; `GET /api/transfers`, `/mine`, `/:id`; `POST /api/transfers/:id/` followed by `documents`, `submit`, `recheck-tax`, `cancel`, `assign`, `request-documents`, `approve` or `reject` |
| Certificates | `GET /api/transfers/:id/certificate`; public `GET /api/verify/:number` |
| Tax | `POST` and `GET /api/tax/records`; `GET /api/tax/mine`; `GET` and `PUT /api/tax/rates` |
| Payments | `POST /api/payments`; `GET /api/payments`, `/mine`, `/:id`, `/:id/receipt`; `POST /api/payments/offline`; `POST /api/payments/:id/refund`; `POST /api/payments/:id/mock-gateway` (demo only); public signed `POST /api/payments/webhook` |
| GIS | `GET /api/gis/parcels`; `GET` and `PUT /api/gis/parcels/:id/boundary` |
| Appointments | `GET /api/appointments/slots`, `/mine`, and (staff) `/`; `POST /api/appointments`; `DELETE` and `PATCH /api/appointments/:id` |
| Admin | `GET /api/admin/audit-logs`, `/audit-logs/verify`; `GET` and `POST /api/admin/users`; `PATCH /api/admin/users/:id`; `POST /api/admin/users/:id/reset-password` |
| Reports | `GET /api/reports/summary`, `/transfers.csv`, `/payments.csv` |

## 6. Security measures

- Passwords are hashed with bcrypt (cost 12) and never returned.
- The role is read from the database on every request.
- Login and one-time-code attempts are limited, and each code allows five tries and lasts five minutes.
- All database queries use parameters, so user input is never pasted into SQL.
- Payment callbacks are checked with a timing-safe signature comparison.
- Every sensitive action is written to the hash-chained audit log.
- CSV exports neutralise spreadsheet formulas.
- Demo-only features (the on-screen code and the mock gateway) switch off when `NODE_ENV=production`.

## 7. Testing status

**Confirmed on the development computer:** the environment and database, the health check, registration, login with a one-time code, roles, the audit chain (including tamper detection), owners and parcels with search, the version check, citizen privacy, the full transfer workflow including the failed approval that rolled back, and certificate PDF download with public verification.

**Written and checked for syntax, but not yet confirmed by running:** the tax and payment test (`npm run test18`), GIS boundaries, appointments, user management, reports, backup, rate limiting and the React web application.

## 8. Limitations and next steps

- Documents record names only; real file upload is not built yet.
- SMS, email and telebirr are simulated. A real gateway needs its own credentials and the same signature rules.
- Connection to the Central Information System (CIS) is not built.
- Amharic covers the menus and login pages only, and the PDF fonts cannot show Amharic yet.
- Not done yet: automated tests, a load test against the response-time targets, deployment (Nginx, PM2, HTTPS) and screenshots for the report.
- Before any real use: change the database password, `JWT_SECRET` and `TELEBIRR_SECRET`, delete the demo accounts, set `NODE_ENV=production` and serve over HTTPS.

## 9. Differences from the original project document

- **Web only.** The document mentions both a React Native app and a progressive web app; this build is a responsive web app.
- Section 1.7.2 names PHP, Laravel and MySQL. That is a leftover from an earlier draft; the system uses Node.js and PostgreSQL.
- Payment states follow section 4.5.2: Initiated, Pending, Processing, Completed, Failed, Refunded.
- A transfer can also be Cancelled, so there are nine statuses.
- The tenth table, `registry_entries`, is inferred from the approval description; `tax_rates` was added for FR-27.
- A callback with a bad signature is logged and rejected but does not mark the payment failed, because anyone could send fake callbacks. A valid callback with the wrong amount does mark it failed.
- Cancelling an appointment removes it, so the slot can be booked again. The audit log keeps the history.
- Requirement numbers in this file are my reading of the document; check them against its requirements table.

## 10. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Stray empty files named `curl`, `git`, `{` appear in the project | Text from the cmd prompt, or code, was pasted into cmd instead of Notepad. Delete the files. Copy only commands into cmd and code into Notepad. |
| `fetch failed` or `ECONNRESET` | The backend is stopped or restarting. Start it with `npm run dev` in `backend` and try again. |
| `psql` is not recognized | New cmd window. Run `set PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin`. |
| `Invalid or expired token` | Tokens last 8 hours. Log in again, or rerun `scripts\token.js`. |
| One-time code rejected | Codes last 5 minutes and allow 5 attempts. Log in again for a new one. |
| `prisma init` crashes on Node 24 | Known problem with Prisma 5. Create `prisma/schema.prisma` by hand. |
| `prisma db push` fails with a file-in-use error | Stop the backend first, then push, then restart it. |
| Web app shows a proxy error | The backend is not running on port 4000. |
