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
