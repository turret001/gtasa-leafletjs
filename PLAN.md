# GTA:SA Map Editor SaaS — Implementation Plan

## Overview

Turn the current single-file map editor into a multi-tenant SaaS where MTA server owners can register, draw map data (markers, lines, polygons), save it, and retrieve it via API.

---

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────┐
│   Frontend (SPA)    │──────▶│   Backend API        │──────▶│  Database   │
│   Leaflet + Vanilla │       │   Node/Express       │       │  SQLite/    │
│   or React/Vue      │       │                      │       │  PostgreSQL │
└─────────────────────┘       │  - Auth (JWT)        │       └─────────────┘
                              │  - CRUD map data     │
┌─────────────────────┐       │  - API key mgmt      │
│  MTA Server (Lua)   │──────▶│  - Public read API   │
│  HTTP fetch w/ key  │       └──────────────────────┘
└─────────────────────┘
```

---

## Phase 1: Backend API + Database

### 1.1 Project Setup
- Initialize Node.js project with Express
- Set up project structure:
  ```
  /server
    /routes       — auth, maps, api-keys, public-api
    /middleware    — auth middleware, rate limiter
    /models       — DB models/schema
    /db           — migrations, seed
    server.js     — entry point
  /public         — frontend (current index.html, evolved)
  ```
- SQLite for dev simplicity (swap to PostgreSQL for production)

### 1.2 Database Schema
```
users
  id              INTEGER PRIMARY KEY
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT NOT NULL
  created_at      DATETIME

api_keys
  id              INTEGER PRIMARY KEY
  user_id         INTEGER FK → users
  key             TEXT UNIQUE NOT NULL (generated UUID/random)
  label           TEXT (e.g. "My MTA Server")
  created_at      DATETIME
  last_used_at    DATETIME

projects
  id              INTEGER PRIMARY KEY
  user_id         INTEGER FK → users
  name            TEXT NOT NULL
  created_at      DATETIME
  updated_at      DATETIME

map_objects
  id              INTEGER PRIMARY KEY
  project_id      INTEGER FK → projects
  type            TEXT NOT NULL ("polygon", "polyline", "marker")
  name            TEXT
  color           TEXT
  positions       TEXT (JSON array of [lat, lng] pairs)
  metadata        TEXT (JSON, optional extra data)
  created_at      DATETIME
  updated_at      DATETIME
```

### 1.3 Auth Routes (`/api/auth`)
| Method | Endpoint         | Description              |
|--------|------------------|--------------------------|
| POST   | `/api/auth/register` | Create account (email + password) |
| POST   | `/api/auth/login`    | Returns JWT token        |
| GET    | `/api/auth/me`       | Get current user profile |

- Passwords hashed with bcrypt
- JWT tokens for session management
- Middleware to protect authenticated routes

### 1.4 API Key Routes (`/api/keys`)
| Method | Endpoint         | Description                  |
|--------|------------------|------------------------------|
| POST   | `/api/keys`      | Generate a new API key       |
| GET    | `/api/keys`      | List user's API keys         |
| DELETE | `/api/keys/:id`  | Revoke an API key            |

### 1.5 Project Routes (`/api/projects`)
| Method | Endpoint                          | Description                    |
|--------|-----------------------------------|--------------------------------|
| POST   | `/api/projects`                   | Create a new project           |
| GET    | `/api/projects`                   | List user's projects           |
| GET    | `/api/projects/:id`               | Get project with all map data  |
| PUT    | `/api/projects/:id`               | Update project name            |
| DELETE | `/api/projects/:id`               | Delete project and its data    |

### 1.6 Map Object Routes (`/api/projects/:id/objects`)
| Method | Endpoint                                  | Description              |
|--------|-------------------------------------------|--------------------------|
| POST   | `/api/projects/:projectId/objects`        | Create map object        |
| GET    | `/api/projects/:projectId/objects`        | List all objects         |
| PUT    | `/api/projects/:projectId/objects/:objId` | Update a map object      |
| DELETE | `/api/projects/:projectId/objects/:objId` | Delete a map object      |

---

## Phase 2: Public API (for MTA Servers)

### 2.1 Public API Endpoint
| Method | Endpoint                    | Auth         | Description                          |
|--------|-----------------------------|--------------|--------------------------------------|
| GET    | `/public/v1/map-data`       | API key (header or query) | Returns all map objects for the project linked to this key |

**Request:**
```
GET /public/v1/map-data
Header: X-API-Key: <key>
```

**Response:**
```json
{
  "project": "My Server Map",
  "objects": [
    {
      "id": 1,
      "type": "polygon",
      "name": "Los Santos",
      "color": "#e94560",
      "positions": [[lat, lng], ...]
    },
    {
      "id": 2,
      "type": "marker",
      "name": "Base",
      "positions": [[lat, lng]]
    }
  ]
}
```

### 2.2 API Key Middleware
- Look up key in `api_keys` table
- Resolve to user → project
- Update `last_used_at` timestamp
- Rate limit: e.g. 100 requests/minute per key

### 2.3 MTA Integration Example (Lua)
```lua
fetchRemote("https://yourapp.com/public/v1/map-data",
  { headers = { ["X-API-Key"] = "your-api-key-here" } },
  function(responseData, error)
    if error == 0 then
      local data = fromJSON(responseData)
      -- use data.objects to create blips, markers, zones
    end
  end
)
```

---

## Phase 3: Frontend Evolution

### 3.1 Auth Pages
- **Register page** — email + password form
- **Login page** — email + password form, stores JWT in localStorage
- **Dashboard** — list projects, manage API keys

### 3.2 Map Editor Upgrades
- Save/load from API instead of hardcoded arrays
- Project selector dropdown
- Support drawing **polylines** (not just polygons)
- Support placing **markers** with custom names
- Object list sidebar — select, edit, delete existing objects
- Auto-save or explicit save button

### 3.3 Dashboard
- Project management (create, rename, delete)
- API key management (generate, view, revoke)
- Usage stats (API calls per key)

---

## Phase 4: Production Concerns

### 4.1 Security
- Input validation/sanitization on all endpoints
- CORS configuration (allow frontend origin + MTA server origins)
- Rate limiting on public API and auth endpoints
- Helmet.js for HTTP headers
- API key hashing in database (store hash, show full key only once on creation)

### 4.2 Deployment
- Dockerize the app (Node backend + static frontend)
- PostgreSQL for production database
- Environment variables for secrets (JWT_SECRET, DB_URL)
- HTTPS via reverse proxy (nginx/Caddy)

### 4.3 Optional Future Features
- Team/org accounts (multiple users per project)
- Webhooks (notify MTA server when map data changes)
- Map data versioning/history
- Import/export (GeoJSON, KML)
- Custom tile layer uploads
- Billing/subscription tiers

---

## Suggested Tech Stack

| Layer      | Technology                    | Why                                    |
|------------|-------------------------------|----------------------------------------|
| Frontend   | Vanilla JS (current) or Vue  | Keep it simple, Leaflet works with anything |
| Backend    | Node.js + Express            | JS everywhere, fast to build           |
| Database   | SQLite (dev) → PostgreSQL    | Simple start, easy to scale later      |
| Auth       | JWT + bcrypt                 | Stateless, simple                      |
| ORM        | better-sqlite3 / Knex.js     | Lightweight, works with both DBs       |
| Deployment | Docker + Caddy               | Simple containerized deploy            |

---

## Implementation Order

1. `npm init` + Express server + serve static frontend
2. Database schema + migrations (SQLite)
3. Auth system (register, login, JWT middleware)
4. Project CRUD routes
5. Map object CRUD routes
6. Connect frontend to API (save/load map data)
7. API key generation + management
8. Public API endpoint (for MTA servers)
9. Dashboard UI (projects, API keys)
10. Polish, rate limiting, input validation, error handling
