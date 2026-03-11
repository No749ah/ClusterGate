<div align="center">

<img src="frontend/public/favicon.svg" alt="ClusterGate Logo" width="96"/>

<br/>

**Kubernetes Routing Gateway Platform**

Expose internal Kubernetes services over public domains with a beautiful, secure management UI.

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm%20%2B%20kubectl-326CE5?logo=kubernetes&logoColor=white)](k8s/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

<br/>

[![Get Started](https://img.shields.io/badge/🚀%20Get%20Started-Quick%20Start-22c55e?style=for-the-badge)](#quick-start-local)
[![API Docs](https://img.shields.io/badge/📖%20API%20Docs-Swagger%20UI-3b82f6?style=for-the-badge)](#api-documentation)
[![Report Bug](https://img.shields.io/badge/🐛%20Report%20Bug-Issues-ef4444?style=for-the-badge)](https://github.com/No749ah/ClusterGate/issues/new?template=bug_report.md)
[![Request Feature](https://img.shields.io/badge/✨%20Request%20Feature-Issues-a855f7?style=for-the-badge)](https://github.com/No749ah/ClusterGate/issues/new?template=feature_request.md)

</div>

---

```
clustergate.example.com/r/webhook/XYZ  →  http://n8n.default.svc.cluster.local/webhook/XYZ
clustergate.example.com/r/langflow     →  http://langflow.default.svc.cluster.local
clustergate.example.com/r/api/v1       →  http://myservice.production.svc.cluster.local/v1
```

---

## Features

- **Routing Gateway** — Transparent HTTP proxy for Kubernetes internal services under `/r/` prefix
- **Route Management** — Create, test, publish, version, duplicate, import/export routes via UI
- **Two-Factor Authentication** — TOTP-based 2FA with recovery codes for user accounts
- **Analytics Dashboard** — Latency trends (p50/p95/p99), error rates, traffic heatmap, status distribution
- **Security** — JWT auth (httpOnly cookies, 7-day sessions), bcrypt, per-route auth (API key / Basic / Bearer), rate limiting, IP allowlists, webhook secrets, CORS
- **Monitoring** — Request logs, error tracking, Prometheus metrics, automated health checks
- **Database Backups** — Create, download, restore, and manage PostgreSQL backups from the UI
- **API Documentation** — Interactive Swagger/OpenAPI docs at `/api/docs`
- **Dark Mode UI** — Modern, responsive Next.js frontend with shadcn/ui
- **Kubernetes-native** — Kubernetes manifests + Helm chart + HPE PCAI support

---

## Tech Stack

| Layer       | Technology                               |
|-------------|------------------------------------------|
| Frontend    | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend     | Node.js 22, TypeScript, Express.js, Prisma |
| Database    | PostgreSQL 16                            |
| Auth        | JWT (httpOnly cookies, 7 days), bcrypt, TOTP 2FA |
| Proxy       | axios-based transparent forwarder        |
| Docs        | Swagger UI (swagger-jsdoc + swagger-ui-express) |
| Metrics     | Prometheus (prom-client)                 |
| Logging     | Winston + daily rotate                   |
| Infra       | Docker, Kubernetes, Helm                 |

---

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Node.js 22+
- npm

### 1. Clone & configure

```bash
git clone https://github.com/No749ah/ClusterGate.git
cd ClusterGate

cp .env.example .env
# Edit .env — at minimum set:
#   JWT_SECRET (generate: openssl rand -base64 64)
#   POSTGRES_PASSWORD
```

### 2. Start with Docker Compose

```bash
docker compose up -d

# Wait for postgres to be healthy, then run migrations:
docker compose exec backend npm run db:migrate
```

### 3. Open the UI

| Service       | URL                                    |
|---------------|----------------------------------------|
| Frontend      | http://localhost:3000                  |
| Backend API   | http://localhost:3001                  |
| API Docs      | http://localhost:3001/api/docs         |
| Health        | http://localhost:3001/api/health/ready |

### First-time Setup

On the first visit, a **Setup Wizard** will prompt you to create your administrator account. There are no default credentials — you choose your own email and password during setup.

---

## Local Development (without Docker)

### Backend

```bash
cd backend
npm install
cp ../.env.example .env.local   # set DATABASE_URL etc.

# Run migrations
npx prisma migrate dev
npx prisma generate

# Start dev server (hot reload)
npm run dev
```

### Frontend

```bash
cd frontend
npm install

# Start dev server
npm run dev
```

---

## Architecture

```
Internet
    |
    v
Ingress (nginx / Istio)
    |
    +---> /api/*  ---------> clustergate-backend:3001
    |                            |
    |                            +-- Auth API (login, 2FA, setup)
    |                            +-- Route Management API
    |                            +-- Analytics API
    |                            +-- Logs / Audit API
    |                            +-- Users / Notifications API
    |                            +-- Backup API
    |                            +-- System / Update API
    |                            +-- Swagger UI (/api/docs)
    |
    +---> /r/*  -----------> clustergate-backend:3001
    |                            |
    |                            +-- Proxy Engine
    |                                   |
    |                                   v
    |                         Internal K8s Services
    |                         (*.svc.cluster.local)
    |
    +---> /*  -------------> clustergate-frontend:3000
                                (Next.js UI)
```

### Proxy Route Prefix

All proxy routes use the `/r/` prefix to cleanly separate proxied traffic from API and frontend routes:

- `/r/my-service/*` — proxied to the target Kubernetes service
- `/api/*` — backend API endpoints
- `/*` — frontend UI

This ensures correct routing through Kubernetes ingress, Istio, and enterprise security policies.

### Proxy Flow

```
Public Request
  clustergate.example.com/r/webhook/xyz
        |
        v
  Ingress routes /r/* to backend
        |
        v
  Match route by path prefix (longest match)
        |
        +-- Check: isActive, status=PUBLISHED
        +-- Check: maintenance mode
        +-- Check: IP allowlist
        +-- Check: rate limit (if enabled)
        +-- Enforce: route-level auth (API key / Basic / Bearer)
        +-- Validate: webhook secret (if configured)
        +-- Apply: header add/remove rules
        +-- Apply: path rewrite rules
        +-- Forward to target URL
              |
              v
        n8n.default.svc.cluster.local/webhook/xyz
              |
              v
        Return response (status, headers, body)
```

---

## Configuration

### Environment Variables (Backend)

| Variable              | Required | Default   | Description                          |
|-----------------------|----------|-----------|--------------------------------------|
| `DATABASE_URL`        | Yes      | —         | PostgreSQL connection string         |
| `JWT_SECRET`          | Yes      | —         | JWT signing secret (min 32 chars)    |
| `JWT_EXPIRES_IN`      | No       | `7d`      | JWT token lifetime                   |
| `PORT`                | No       | `3001`    | Backend HTTP port                    |
| `NODE_ENV`            | No       | `development` | Environment                     |
| `ALLOWED_ORIGINS`     | No       | `http://localhost:3000` | CORS origins (comma-sep) |
| `PROXY_TIMEOUT`       | No       | `30000`   | Proxy timeout in ms                  |
| `LOG_LEVEL`           | No       | `info`    | Winston log level                    |
| `METRICS_ENABLED`     | No       | `true`    | Enable Prometheus metrics            |
| `METRICS_SECRET`      | No       | —         | Secret for /metrics endpoint         |
| `LOG_RETENTION_DAYS`  | No       | `90`      | Days to keep request logs            |

---

## Route Configuration Reference

### Basic Route

```json
{
  "name": "n8n Webhooks",
  "publicPath": "/r/webhook",
  "targetUrl": "http://n8n.default.svc.cluster.local/webhook",
  "methods": ["POST"],
  "status": "PUBLISHED",
  "isActive": true
}
```

### Advanced Route with Headers & Auth

```json
{
  "name": "Protected Internal API",
  "publicPath": "/r/api/v1",
  "targetUrl": "http://myservice.production.svc.cluster.local/v1",
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "timeout": 15000,
  "retryCount": 3,
  "retryDelay": 1000,
  "stripPrefix": false,
  "addHeaders": {
    "X-Forwarded-By": "ClusterGate",
    "X-Internal-Auth": "my-internal-token"
  },
  "removeHeaders": ["X-User-Id"],
  "requireAuth": true,
  "authType": "BEARER",
  "authValue": "my-api-token",
  "ipAllowlist": ["10.0.0.0/8", "192.168.1.100"],
  "corsEnabled": true,
  "corsOrigins": ["https://app.example.com"],
  "webhookSecret": "wh_secret_abc123",
  "status": "PUBLISHED",
  "isActive": true,
  "tags": ["production", "v1"]
}
```

---

## API Documentation

ClusterGate provides interactive API documentation via Swagger UI:

- **Swagger UI**: `/api/docs` — interactive API explorer
- **OpenAPI JSON**: `/api/docs.json` — raw OpenAPI spec

### API Endpoints Overview

#### Authentication
```
GET  /api/auth/setup-status       Check if initial setup is complete
POST /api/auth/setup              Create first admin account (first-run only)
POST /api/auth/login              Login with email/password
POST /api/auth/2fa/verify         Verify 2FA code during login
POST /api/auth/2fa/setup          Initiate 2FA setup (authenticated)
POST /api/auth/2fa/enable         Verify and enable 2FA (authenticated)
POST /api/auth/2fa/disable        Disable 2FA (requires password)
POST /api/auth/logout             Logout (clears session)
GET  /api/auth/me                 Get current user
POST /api/auth/change-password    Change password
```

#### Routes
```
GET    /api/routes                 List routes (with filters, pagination, tag search)
POST   /api/routes                 Create route
GET    /api/routes/:id             Get route details
PUT    /api/routes/:id             Update route
DELETE /api/routes/:id             Delete route (soft)
POST   /api/routes/:id/publish     Publish route
POST   /api/routes/:id/deactivate  Deactivate route
POST   /api/routes/:id/duplicate   Duplicate route
POST   /api/routes/:id/test        Test route (with optional auth skip)
GET    /api/routes/:id/health      Check target health
GET    /api/routes/:id/versions    Version history
POST   /api/routes/:id/versions/:vId/restore  Restore version
GET    /api/routes/:id/logs        Request logs for route
GET    /api/routes/:id/stats       Stats for route
GET    /api/routes/:id/uptime      Uptime statistics
POST   /api/routes/import          Import routes JSON
GET    /api/routes/export          Export routes JSON
GET    /api/routes/check-path      Check if public path is available
```

#### Analytics
```
GET /api/analytics/overview            Overview metrics (p50/p95/p99, error rate)
GET /api/analytics/latency-trend       Latency time-series
GET /api/analytics/error-trend         Error rate time-series
GET /api/analytics/heatmap             Traffic heatmap (day x hour)
GET /api/analytics/slowest             Slowest routes
GET /api/analytics/status-distribution Status code distribution
```

#### Logs
```
GET    /api/logs                All logs (filterable)
GET    /api/logs/errors         Recent errors
DELETE /api/logs/cleanup        Cleanup old logs (admin)
```

#### Users
```
GET    /api/users               List users (admin)
POST   /api/users               Create user (admin)
PUT    /api/users/:id           Update user (admin)
DELETE /api/users/:id           Delete user (admin)
POST   /api/users/:id/reset-password  Reset password (admin)
```

#### Audit Logs
```
GET    /api/audit                Audit log entries (admin, filterable)
```

#### API Keys
```
GET    /api/routes/:id/api-keys          List API keys for route
POST   /api/routes/:id/api-keys          Create API key
POST   /api/routes/:id/api-keys/:kid/revoke  Revoke API key
DELETE /api/routes/:id/api-keys/:kid     Delete API key
```

#### Backups
```
POST   /api/backups                  Create backup
GET    /api/backups                  List backups
POST   /api/backups/:name/restore    Restore backup
GET    /api/backups/:name/download   Download backup
DELETE /api/backups/:name            Delete backup
```

#### Notifications
```
GET    /api/notifications            List notifications
GET    /api/notifications/count      Unread notification count
POST   /api/notifications/:id/read   Mark notification as read
POST   /api/notifications/read-all   Mark all as read
```

#### System
```
GET  /api/system/update-status   Check for updates (cached)
POST /api/system/update-check    Force update check
POST /api/system/update          Apply update (SSE streaming progress)
```

#### Health & Metrics
```
GET /api/health/live    Liveness probe (always 200)
GET /api/health/ready   Readiness probe (checks DB)
GET /api/health/status  System status (version, uptime, memory, routes)
GET /metrics            Prometheus metrics
```

---

## Kubernetes Deployment

### Using kubectl

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Configure secrets (IMPORTANT: update values first!)
vi k8s/secrets.yaml
kubectl apply -f k8s/secrets.yaml

# 3. Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# 4. Deploy PostgreSQL
kubectl apply -f k8s/postgres/
kubectl wait --for=condition=ready pod -l app=postgres -n clustergate --timeout=120s

# 5. Run database migrations (one-time job)
kubectl run migrate \
  --image=ghcr.io/no749ah/clustergate-backend:latest \
  --namespace=clustergate \
  --env="DATABASE_URL=$(kubectl get secret clustergate-secrets -n clustergate -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
  --command -- npm run db:migrate
# 6. Deploy backend + frontend
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/

# 7. Apply RBAC
kubectl apply -f k8s/rbac.yaml

# 8. Configure ingress (update host in ingress.yaml first)
vi k8s/ingress/ingress.yaml
kubectl apply -f k8s/ingress/

# 9. Watch rollout
kubectl rollout status deployment/clustergate-backend -n clustergate
kubectl rollout status deployment/clustergate-frontend -n clustergate
```

### Using Helm

```bash
# Add to your cluster:
helm upgrade --install clustergate ./helm/clustergate \
  --namespace clustergate \
  --create-namespace \
  --set ingress.host=clustergate.example.com \
  --set backend.secrets.jwtSecret=$(openssl rand -base64 64) \
  --set backend.secrets.metricsSecret=$(openssl rand -base64 32) \
  --set postgres.credentials.password=$(openssl rand -base64 32) \
  --wait

# Check status
helm status clustergate -n clustergate
```

---

## Security

### Two-Factor Authentication

ClusterGate supports TOTP-based two-factor authentication:

1. Enable 2FA from **Settings** — scan QR code with any authenticator app (Google Authenticator, Authy, 1Password, etc.)
2. 10 recovery codes are generated (shown once, store them safely)
3. Login requires both password and 6-digit TOTP code
4. Recovery codes can be used as fallback (each code is single-use)
5. Disable 2FA requires password confirmation

### Production Checklist

- [ ] Create a strong admin password via the setup wizard
- [ ] Enable 2FA for all admin accounts
- [ ] Set a strong `JWT_SECRET` (min 64 chars, random)
- [ ] Set a strong `POSTGRES_PASSWORD`
- [ ] Enable TLS via cert-manager or bring your own certs
- [ ] Apply NetworkPolicies (`k8s/ingress/networkpolicy.yaml`)
- [ ] Apply RBAC (`k8s/rbac.yaml`)
- [ ] Configure `ALLOWED_ORIGINS` to your exact frontend URL
- [ ] Use Sealed Secrets or External Secrets Operator instead of plain k8s Secrets
- [ ] Enable audit logging (enabled by default)
- [ ] Set up monitoring alerts on error rate metrics
- [ ] Review IP allowlists for sensitive routes
- [ ] Enable route-level auth (API key / Basic / Bearer) for sensitive endpoints
- [ ] Enable webhook secrets for webhook routes
- [ ] Set up regular database backups

### Secret Management Recommendations

For production, use one of:
- **Sealed Secrets** (`kubeseal`) — encrypt secrets into Git
- **External Secrets Operator** — pull from Vault, AWS SSM, GCP Secret Manager
- **Vault Agent Injector** — inject secrets as files

---

## Monitoring

### Prometheus Metrics

Available at `/metrics` (protect with `METRICS_SECRET` header or IP allowlist):

| Metric                            | Type      | Description                    |
|-----------------------------------|-----------|--------------------------------|
| `http_requests_total`             | Counter   | HTTP requests by method/status |
| `http_request_duration_seconds`   | Histogram | HTTP request duration          |
| `proxy_requests_total`            | Counter   | Proxy requests by route/status |
| `proxy_request_duration_seconds`  | Histogram | Proxy request duration         |
| `active_routes_total`             | Gauge     | Active published routes        |

### Analytics Dashboard

The built-in Analytics page provides:
- **Latency trends** — p50/p95/p99 percentiles over time
- **Error rate trends** — hourly error rate visualization
- **Traffic heatmap** — 7-day x 24-hour request volume matrix
- **Status distribution** — 2xx/3xx/4xx/5xx breakdown
- **Slowest routes** — ranked by average and p95 response time

Filter by specific route and time period (7/14/30 days).

---

## Directory Structure

```
clustergate/
+-- backend/                    # Express.js backend
|   +-- src/
|   |   +-- app.ts              # Application entry point
|   |   +-- config/             # Configuration
|   |   +-- cron/               # Scheduled jobs (health checks, updates, log cleanup)
|   |   +-- lib/                # Utilities (logger, jwt, metrics, swagger)
|   |   +-- middleware/         # Express middleware (auth, rate limit, audit)
|   |   +-- prisma/             # Schema, migrations, seed
|   |   +-- proxy/              # Proxy handler (/r/ prefix)
|   |   +-- routes/             # API route handlers
|   |   +-- services/           # Business logic (analytics, backup, 2FA, etc.)
|   +-- Dockerfile
|   +-- package.json
|   +-- tsconfig.json
|
+-- frontend/                   # Next.js frontend
|   +-- src/
|   |   +-- app/                # Next.js App Router pages
|   |   |   +-- (auth)/         # Login page
|   |   |   +-- (dashboard)/    # Dashboard, Routes, Analytics, Settings, etc.
|   |   +-- components/         # React components
|   |   |   +-- ui/             # shadcn/ui base components
|   |   |   +-- layout/         # Sidebar, Header, CommandPalette
|   |   |   +-- routes/         # Route management (form, test panel, etc.)
|   |   |   +-- dashboard/      # Dashboard widgets
|   |   |   +-- common/         # Shared components
|   |   +-- hooks/              # Custom React hooks (TanStack Query)
|   |   +-- lib/                # API client, utilities
|   |   +-- types/              # TypeScript types
|   +-- Dockerfile
|   +-- package.json
|   +-- next.config.ts
|
+-- k8s/                        # Kubernetes manifests
|   +-- namespace.yaml
|   +-- configmap.yaml
|   +-- secrets.yaml
|   +-- rbac.yaml
|   +-- postgres/
|   +-- backend/
|   +-- frontend/
|   +-- ingress/
|
+-- helm/                       # Helm chart
|   +-- clustergate/
|       +-- Chart.yaml
|       +-- values.yaml
|       +-- templates/
|
+-- docker-compose.yml          # Local development
+-- .env.example                # Environment template
+-- .github/workflows/          # CI/CD (Docker build + publish)
+-- LICENSE                     # MIT License
+-- CODE_OF_CONDUCT.md
+-- CONTRIBUTING.md
+-- SECURITY.md
+-- README.md
```

---

## Development

### Database Commands

```bash
cd backend

# Create new migration
npx prisma migrate dev --name your-migration-name

# Apply migrations
npm run db:migrate

# Open Prisma Studio (DB browser)
npm run db:studio

# Regenerate Prisma client (after schema changes)
npm run db:generate
```

### Building for Production

```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

### Building Docker Images

```bash
# Backend
docker build -t ghcr.io/no749ah/clustergate-backend:latest ./backend --target production

# Frontend
docker build -t ghcr.io/no749ah/clustergate-frontend:latest ./frontend --target production

# Push
docker push ghcr.io/no749ah/clustergate-backend:latest
docker push ghcr.io/no749ah/clustergate-frontend:latest
```

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before opening an issue or pull request.

[![Open Issues](https://img.shields.io/github/issues/No749ah/ClusterGate?color=ef4444)](https://github.com/No749ah/ClusterGate/issues)
[![Open PRs](https://img.shields.io/github/issues-pr/No749ah/ClusterGate?color=3b82f6)](https://github.com/No749ah/ClusterGate/pulls)

---

## Security Policy

Found a vulnerability? Please **do not** open a public issue. Follow the [Security Policy](SECURITY.md) to report it privately.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
