# Romaa Backend - CLAUDE.md

## Project Overview

Romaa Backend is a construction/project management system built for managing tenders, projects, HR, purchases, assets, and site operations.

## Tech Stack

- **Runtime**: Node.js with ES Modules (`"type": "module"` in package.json)
- **Framework**: Express v5
- **Database**: MongoDB via Mongoose v8
- **Auth**: JWT (access + refresh tokens), stored in HTTP-only cookies or `Authorization: Bearer` header
- **File Storage**: AWS S3 (`@aws-sdk/client-s3`)
- **Logging**: Winston + Morgan (daily rotate files in `logs/`)
- **Scheduling**: node-cron (daily absenteeism cron)
- **Email**: nodemailer
- **Dev server**: `npm run dev` (nodemon)

## Entry Point

`app.js` — registers all routes, connects DB, starts cron jobs.

## Project Structure

```
Romaa_BE/
├── app.js                         # Main entry: routes, middleware, server
├── src/
│   ├── common/
│   │   ├── App.const.js           # Enums: PERMISSIONS, UserLevel, PageConst, Status
│   │   ├── App.helperFunction.js  # Shared helpers
│   │   ├── App.message.js         # Shared response messages
│   │   ├── App.pagination.js      # Pagination utility
│   │   ├── Auth.middlware.js      # verifyJWT, verifyPermission middlewares
│   │   └── Route.filter.js        # Route filtering
│   ├── config/
│   │   ├── db.js                  # MongoDB connection + auto-seed on connect
│   │   ├── logger.js              # Winston logger config
│   │   └── cookies.js             # Cookie config
│   └── module/
│       ├── auth/                  # Login, logout, refresh token
│       ├── user/                  # User management
│       ├── role/                  # RBAC role management
│       ├── clients/               # Client master
│       ├── idcode/                # Auto ID generation (e.g. EMP-001, ROL-001)
│       ├── hr/
│       │   ├── employee/          # Employee (also the auth user model)
│       │   ├── contractors/       # Contractor companies
│       │   ├── contractemployee/  # Contract workers
│       │   ├── userAttendance/    # Punch in/out, geofencing
│       │   ├── holidays/          # Holiday calendar
│       │   └── leave/             # Leave requests
│       ├── tender/
│       │   ├── tender/            # Tender master
│       │   ├── boq/               # Bill of Quantities
│       │   ├── bid/               # Bid management
│       │   ├── emd/               # Earnest Money Deposit
│       │   ├── materials/         # Material master (HSN/SAC linked)
│       │   ├── penalties/         # Penalty tracking
│       │   ├── rateAnalysis/      # Rate analysis
│       │   ├── rateanalyisquantites/ # Rate analysis quantities
│       │   ├── detailedestimate/  # Detailed cost estimate
│       │   ├── siteoverheads/     # Site overhead costs
│       │   ├── contractworker/    # Permitted contract workers for tender
│       │   └── vendorpermitted/   # Permitted vendors for tender
│       ├── project/
│       │   ├── schedule/          # Project schedule (legacy)
│       │   ├── scheduleNew/       # Schedule lite + task models
│       │   ├── workorderReqIssue/ # Work order requests/issues
│       │   └── clientbilling/
│       │       ├── billing/       # Client billing
│       │       ├── estimate/      # Billing estimate
│       │       └── steelestimate/ # Steel estimate
│       ├── purchase/
│       │   ├── vendor/            # Vendor master
│       │   └── purchaseorderReqIssue/ # Purchase requests, quotations, orders
│       ├── assets/
│       │   ├── machinery/         # Machinery asset master
│       │   └── machinerylogs/     # Machinery usage logs
│       ├── site/
│       │   └── workdone/          # Site work done entries
│       ├── documents/
│       │   ├── tenderdocuments/   # Tender document uploads
│       │   └── workorderdocuments/ # Work order document uploads
│       └── master/
│           └── hsnmaster/         # HSN/SAC master (tax codes)
└── utils/
    ├── seed.js                    # DB seeder (DEV role + admin user)
    ├── awsBucket.js               # S3 upload helpers
    ├── dailyAbsenteeism.js        # Cron: marks absent employees daily
    ├── emailSender.js             # Email utility
    ├── geofunction.js             # Haversine distance for geofencing
    ├── helperfunction.js          # Misc helpers
    ├── parseFileToJson.js         # CSV/file parser
    └── shiftRules.js              # Shift timing rules
```

## Module File Pattern

Each module follows: `{name}.model.js`, `{name}.service.js`, `{name}.controller.js`, `{name}.route.js`

Services use **static class methods**:
```js
class SomeService {
  static async createSomething(data) { ... }
  static async getAll() { ... }
}
```

## API Response Format

Always use this consistent structure:
```js
res.status(200).json({ status: true, data })
res.status(201).json({ status: true, message: "Created", data })
res.status(400).json({ status: false, message: "Error reason" })
res.status(500).json({ status: false, message: error.message })
```

## Authentication & Authorization

- JWT token from cookie (`accessToken`) or `Authorization: Bearer <token>` header
- `verifyJWT` middleware populates `req.user` (Employee with role populated)
- `verifyPermission(module, subModule, action)` for RBAC checks
- Actions: `read`, `create`, `edit`, `delete`

Permission modules (from seed): `dashboard`, `tender`, `project`, `purchase`, `site`, `hr`, `finance`, `report`, `settings`

Usage:
```js
router.post('/', verifyJWT, verifyPermission('tender', 'tenders', 'create'), controller)
```

## ID Generation

All entities use `IdcodeServices` for sequential custom IDs (e.g. `EMP-001`, `ROL-001`, `TND-001`).

```js
await IdcodeServices.addIdCode("EMPLOYEE", "EMP");
const emp_id = await IdcodeServices.generateCode("EMPLOYEE");
```

## Environment Variables Required

```
PORT
MONGO_URI
ACCESS_TOKEN_SECRET
ACCESS_TOKEN_EXPIRY
REFRESH_TOKEN_SECRET
REFRESH_TOKEN_EXPIRY
FRONTEND_URL
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

## Route Prefixes

| Prefix | Module |
|--------|--------|
| `/auth` | Authentication |
| `/user` | User management |
| `/role` | RBAC roles |
| `/client` | Clients |
| `/employee` | HR employees |
| `/contractor` | Contractors |
| `/contractworker` | Contract employees |
| `/attendance` | Attendance punch |
| `/calendar` | Holiday calendar |
| `/leave` | Leave requests |
| `/tender` | Tender master |
| `/boq` | Bill of Quantities |
| `/bid` | Bids |
| `/emd` | EMD |
| `/permittedvendor` | Tender permitted vendors |
| `/permittedcontractor` | Tender permitted contractors |
| `/penalty` | Penalties |
| `/rateanalysis` | Rate analysis |
| `/raquantities` | Rate analysis quantities |
| `/detailedestimate` | Detailed estimate |
| `/material` | Material master |
| `/siteoverhead` | Site overheads |
| `/vendor` | Purchase vendors |
| `/purchaseorderrequest` | Purchase requests |
| `/schedule` | Project schedule (legacy) |
| `/schedulelite` | Schedule lite |
| `/workorderrequest` | Work order request/issue |
| `/billing` | Billing estimate |
| `/clientbilling` | Client billing |
| `/steelestimate` | Steel estimate |
| `/machineryasset` | Machinery assets |
| `/machinerylogs` | Machinery logs |
| `/workdone` | Site work done |
| `/document` | Tender documents |
| `/workorderdocument` | Work order documents |
| `/hsn` | HSN/SAC master |

## Key Models

- **Employee** (`src/module/hr/employee/employee.model.js`) — the primary auth user; has `role`, `leaveBalance`, `payroll`, `shiftType`, `userType` (Office/Site), `accessMode` (WEBSITE/MOBILE/BOTH)
- **Tender** (`src/module/tender/tender/tender.model.js`) — central project entity; tracks full lifecycle from bid to agreement with embedded EMD, process steps, preliminary site work
- **Role** — RBAC with nested permissions object (module > subModule > action)

## AWS S3

Use `uploadFileToS3(file, bucketName)` or `uploadMultiFilesToS3(files, bucketName)` from `utils/awsBucket.js`. Returns `{ Key, Bucket }` — construct public URL separately.

## Database Seeding

Runs automatically on every `connectDB()` call. Creates:
1. DEV role with all permissions
2. Admin employee user (if not exists)

## Attendance System

- Geofence-based punch in/out with photo upload to S3
- Shift rules in `utils/shiftRules.js` (General, Night, Morning, Flexible)
- Daily absenteeism cron in `utils/dailyAbsenteeism.js` marks employees absent if no punch
- Tracks permissions (short leaves), regularization

## Naming Conventions

- Files: `camelCase` with dot-separated type (`employee.service.js`)
- Models: PascalCase + `Model` suffix (`EmployeeModel`)
- Routes: kebab-case URL paths
- Collections: Mongoose model names used as-is (e.g. `"Tenders"`, `"Employee"`)
- Some typos exist in existing filenames (e.g. `shedule.service.js`, `workerorderdoc.service.js`, `idcode.mode.js`) — do not rename without checking all imports
