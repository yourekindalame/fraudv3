# The Fraud (end-to-end)

Web-based multiplayer deduction game.

## Tech

- **Backend**: Node.js + Express + Socket.IO (authoritative server state)
- **Frontend**: Vite + React + TypeScript
- **Deploy**: Fly.io as a **single app** (Express serves the built client; Socket.IO on same origin/port)

Repo layout:

- `server/` (Express + Socket.IO)
- `client/` (Vite + React + TS)
- root `package.json` uses npm workspaces

## Local development

Prereqs: Node.js 20+

Install:

```bash
npm install
```

Run dev (server on `:8080`, client on `:5173` with websocket proxy):

```bash
npm run dev
```

Health check:

```bash
curl -s http://localhost:8080/health
```

## Build + run production locally

Build the client and copy it into `server/public`:

```bash
npm run build
```

Run the server (serves `server/public` + Socket.IO):

```bash
npm run start
```

Open: `http://localhost:8080`

## Fly.io deploy (single app)

1) Install and login:

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

2) Launch (creates the Fly app):

```bash
fly launch
```

3) Deploy:

```bash
fly deploy
fly open
```

### Environment variables (Fly secrets)

If you add any secrets later:

```bash
fly secrets set KEY=value
```

### WebSocket verification checklist

- App is served from a single origin (no separate client host)
- Socket.IO connects to the same origin (no hard-coded URL)
- Fly config uses `internal_port = 8080`
- Server listens on `process.env.PORT || 8080`

### Scaling note

This repo uses **in-memory** lobby state (single instance). To scale horizontally:

- Enable **sticky sessions** (session affinity) on Fly
- Add Redis + Socket.IO Redis adapter so events/state work across instances
