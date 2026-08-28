# MentorQ — On-Demand Mentorship & Queue Platform

MentorQ bridges real-time matching between mentees and experienced industry mentors.

## Core Architecture

- **Frontend**: Next.js, React, TailwindCSS
- **Backend**: Node.js, Express, Socket.io
- **Database Layer**: PostgreSQL via Prisma ORM
- **Cache & Event Bus**: Redis & Redis Streams

## Key Capabilities

- **Automated Queue Routing**: Dynamic matching based on domain expertise and availability.
- **Real-Time Collaboration**: Interactive code scratchpad and WebRTC video integration.
- **Role-Based Access Control**: Discrete scopes for Mentees, Mentors, and Administrators.

## System Architecture Overview

```text
[Client Browser] <---> [Next.js Web UI]
                          |
                 (REST / WebSockets)
                          v
                   [API Gateway]
                    /         \
         [Auth Service]   [Queue Engine]
                |                |
         [PostgreSQL]        [Redis]
```

## Local Development Prerequisites

Ensure the following runtimes and services are available locally:

- Node.js `>= 20.x`
- npm `>= 10.x` or pnpm `>= 9.x`
- PostgreSQL `>= 15`
- Redis `>= 7.x`

## Environment Configuration

Create a local environment configuration file:

```bash
cp .env.example .env
```

Configure required keys:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:password@localhost:5432/mentorq_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-development-secret-key"
```

## Quickstart & Installation

1. Install project dependencies:
   ```bash
   npm install
   ```
2. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```
3. Seed initial development fixtures:
   ```bash
   npm run db:seed
   ```

## Starting Services

Run the development servers across micro-workspaces:

```bash
# Start backend service
npm run dev:server

# Start frontend client
npm run dev:client
```

## Database & Schema Management

- Generate Prisma Client: `npx prisma generate`
- Deploy migrations: `npx prisma migrate deploy`
- Launch visual database inspector: `npx prisma studio`

## Test Suite & Verification

Run automated unit and integration tests:

```bash
# Execute unit tests
npm run test

# Execute end-to-end integration tests
npm run test:e2e
```

## Contributing Workflow

1. Branch off `main` following conventions: `feat/<scope>` or `fix/<scope>`.
2. Write concise, atomic commits using Conventional Commits.
3. Ensure all test suites pass prior to opening a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` for complete details.
