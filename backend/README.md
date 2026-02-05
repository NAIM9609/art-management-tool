# Art Management Tool - TypeScript Backend

TypeScript/Node.js backend for the Art Management Tool e-commerce platform.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Framework**: Express.js
- **ORM**: TypeORM
- **Database**: PostgreSQL
- **Authentication**: JWT

## Getting Started

### Prerequisites

- Node.js 20 or higher
- PostgreSQL 13+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Environment Variables

See `.env` file in project root for configuration options.

## API Endpoints

- Health: `GET /health`
- Shop API: `/api/shop/*`
- Admin API: `/api/admin/*` (requires authentication)
- Auth: `/api/auth/login`
- Personaggi: `/api/personaggi/*`
- Fumetti: `/api/fumetti/*`

## Docker

```bash
docker build -t art-backend .
docker run -p 8080:8080 art-backend
```

## License

MIT
