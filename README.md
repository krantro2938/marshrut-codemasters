# Маршрут — hackathon MVP

An internal approval flow demo for the Fintech Academy **Эффективность 360** track. It uses a Go API, SQLite and a TanStack Start frontend. The demo data is fictional.

Live demo: https://marshrut.aansl.com

## What works

- Four demo accounts with server-side sessions and role-checked actions.
- Three document types with predefined approval routes.
- Create a request; approve or return it with a reason; revise and resubmit it.
- Status, current owner, deadlines and decision history.
- Manager view of flow counts, overdue stages and completion time.

The MVP deliberately does not upload document files or integrate with a university system. It must not be used for real personal or confidential data.

## Local development

Use Go 1.27+ and Node 26+.

```bash
cd backend
DEMO_PASSWORD='a-local-password-at-least-12-chars' DATABASE_PATH=./data/marshrut.db go run .
```

In another terminal:

```bash
npm ci
API_URL=http://localhost:8080 npm run dev
```

The demo accounts are `initiator@marshrut.demo`, `manager@marshrut.demo`, `legal@marshrut.demo`, and `finance@marshrut.demo`. All use the `DEMO_PASSWORD` value set when the database is first created. Changing the environment variable later will not change existing account hashes; use a fresh demo database to reset them.

## Docker deployment

Create `.env` from `.env.example`, set a long random password and create the external `caddy-net` network if it does not exist. Run `docker compose up -d --build`. SQLite lives in the named `marshrut-data` volume. Put a reverse proxy in front of `marshrut-web:3000` on the `caddy-net` network; TLS should terminate there. The API is not published on a host port.

Health endpoint: `/api/health`. The frontend forwards `/api/*` to the Go service and checks the request origin before forwarding writes.

## Data and limits

The database is initialized with three fictional requests and four fictional users. The shared demo password is for the prototype and should be distributed only to reviewers. Route templates and durations are placeholders for CustDev, not a representation of the university's current process. In a real pilot, replace shared demo accounts with individual identity, refine access rules, add audit retention and back up the SQLite volume.
