# Security Policy

## Supported Versions

The following versions of ClusterGate are currently receiving security updates:

| Version | Supported          |
|---------|--------------------|
| `main`  | ✅ Active support  |
| Others  | ❌ No support      |

We recommend always running the latest version from the `main` branch or the most recent Docker image tag.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in ClusterGate, please disclose it responsibly by following these steps:

1. **Open a private security advisory** via GitHub:  
   [https://github.com/No749ah/ClusterGate/security/advisories/new](https://github.com/No749ah/ClusterGate/security/advisories/new)

2. Include as much of the following information as possible to help us triage and fix the issue quickly:
   - Type of vulnerability (e.g. SQL injection, XSS, authentication bypass, privilege escalation)
   - Full path of the affected source file(s)
   - Location of the affected code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Potential impact of the vulnerability

---

## Response Timeline

| Stage                          | Target time   |
|--------------------------------|---------------|
| Acknowledgement of report      | ≤ 72 hours    |
| Initial triage & severity assessment | ≤ 7 days |
| Fix & patch release            | ≤ 30 days (critical), ≤ 60 days (high) |
| Public disclosure              | After fix is released |

---

## Security Best Practices for Operators

When deploying ClusterGate in production, please follow these recommendations:

- **Use a strong admin password** when completing the initial setup wizard.
- **Generate a strong `JWT_SECRET`** — use `openssl rand -base64 64` and store it securely (e.g. Kubernetes Secret, Vault).
- **Restrict the admin UI** — do not expose port `3000` (frontend) or `3001` (backend) directly to the public internet; place them behind a firewall or VPN.
- **Enable IP allowlists** per route where possible, using the built-in allowlist feature.
- **Rotate database credentials** regularly and use a dedicated PostgreSQL user with minimal privileges.
- **Keep Docker images up to date** — rebuild from the latest base images to receive OS-level security patches.
- **Review proxy routes** — each route maps a public path to an internal Kubernetes service; audit regularly to ensure only intended services are exposed.

---

## Scope

This policy covers the ClusterGate source code in this repository, including:

- Backend API (`/backend`)
- Frontend UI (`/frontend`)
- Docker Compose configuration (`docker-compose.yml`)
- Kubernetes manifests and Helm chart (`/k8s`, `/helm`)

Third-party dependencies are not in scope; please report vulnerabilities in dependencies directly to their respective maintainers.

---

## Acknowledgements

We appreciate the security research community's efforts in responsibly disclosing vulnerabilities. Confirmed reporters will be credited in the release notes unless they prefer to remain anonymous.
