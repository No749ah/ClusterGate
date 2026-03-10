# Contributing to ClusterGate

Thank you for your interest in contributing to **ClusterGate**! 🎉  
Whether it's a bug fix, new feature, documentation improvement, or feedback — all contributions are welcome.

Please take a moment to read these guidelines before opening an issue or pull request.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Requesting Features](#requesting-features)
  - [Submitting a Pull Request](#submitting-a-pull-request)
- [Development Setup](#development-setup)
- [Branch & Commit Conventions](#branch--commit-conventions)
- [Code Style](#code-style)
- [Security Issues](#security-issues)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/ClusterGate.git
   cd ClusterGate
   ```
3. Add the upstream remote so you can keep your fork in sync:
   ```bash
   git remote add upstream https://github.com/No749ah/ClusterGate.git
   ```

---

## How to Contribute

### Reporting Bugs

Before filing a bug report, please search [existing issues](https://github.com/No749ah/ClusterGate/issues) to avoid duplicates.

When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected behaviour vs. actual behaviour
- Relevant logs, screenshots, or error messages
- Environment details (OS, Docker version, Node.js version, browser if applicable)

Use the **Bug Report** issue template when available.

### Requesting Features

Feature requests are welcome! Please open an issue using the **Feature Request** template and describe:

- The problem you're trying to solve
- The proposed solution / behaviour
- Any alternatives you've considered

### Submitting a Pull Request

1. **Create a branch** from `main` for your change:
   ```bash
   git checkout -b feat/my-new-feature
   # or
   git checkout -b fix/issue-123-route-bug
   ```
2. **Make your changes** (see [Development Setup](#development-setup) below).
3. **Write / update tests** if applicable.
4. **Commit** your changes following the [commit conventions](#branch--commit-conventions).
5. **Push** your branch and open a Pull Request against `main`.
6. Fill in the PR description explaining *what* changed and *why*.
7. Ensure CI checks pass before requesting a review.

A maintainer will review your PR as soon as possible. Please be patient and responsive to feedback.

---

## Development Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- npm

### Backend

```bash
cd backend
npm install
cp ../.env.example .env.local   # configure DATABASE_URL, JWT_SECRET, etc.

npx prisma migrate dev
npx prisma generate
npm run db:seed

npm run dev          # starts on :3001 with hot reload
```

### Frontend

```bash
cd frontend
npm install

npm run dev          # starts on :3000 with hot reload
```

### Full Stack (Docker Compose)

```bash
cp .env.example .env   # edit as needed

docker compose up -d
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed
```

---

## Branch & Commit Conventions

### Branch naming

| Type       | Pattern                        | Example                        |
|------------|--------------------------------|--------------------------------|
| Feature    | `feat/<short-description>`     | `feat/ip-allowlist-ui`         |
| Bug fix    | `fix/<issue-or-description>`   | `fix/401-on-token-refresh`     |
| Docs       | `docs/<topic>`                 | `docs/helm-values-reference`   |
| Chore      | `chore/<topic>`                | `chore/update-dependencies`    |
| Refactor   | `refactor/<topic>`             | `refactor/proxy-middleware`    |

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(optional scope): <short summary>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Examples:**
```
feat(routes): add per-route IP allowlist support
fix(auth): prevent JWT refresh loop on 401
docs(readme): update quick-start instructions
chore(deps): bump prisma to 5.x
```

---

## Code Style

- **TypeScript** is used throughout — avoid `any` where possible.
- **Backend** — Express.js; keep controllers thin, business logic in service files.
- **Frontend** — Next.js 14 App Router; use shadcn/ui components; Tailwind for styling.
- **Formatting** — Follow the existing code style. If a linter/formatter config is present (`eslint`, `prettier`), run it before committing:
  ```bash
  # backend or frontend
  npm run lint
  ```
- Keep functions small and focused; add JSDoc comments to public-facing utilities.

---

## Security Issues

**Do not open a public issue for security vulnerabilities.**  
Please follow the [Security Policy](SECURITY.md) and report via the private GitHub security advisory.

---

Thank you for helping make ClusterGate better! 🚀
