# Suno Song Studio backend

This backend is made for the patched HTML page. It exposes:

- `POST /api/create-song`
- `GET /api/song-status/:id`
- `GET /health`

## 1) Install

```bash
npm install
```

## 2) Configure

Copy `.env.example` to `.env` and fill in your real values.

Important:
- `SUNO_CREATE_PATH` and `SUNO_STATUS_PATH` must match the exact endpoints used by your `sunoapi.org` account.
- Keep `SUNO_API_KEY` only in `.env`.

## 3) Run

```bash
npm start
```

or

```bash
npm run dev
```

## 4) Connect the HTML page

In Song Studio > Create Song:
- set **Backend API Base** to your backend URL, for example `https://your-app.onrender.com`
- or leave it blank if the backend is hosted on the same domain and proxied through `/api`

## 5) Request shape from the HTML

The page sends this JSON to `/api/create-song`:

```json
{
  "title": "My Song",
  "tags": "cinematic folk, emotional",
  "prompt": "...",
  "lyrics": "..."
}
```

The HTML expects the backend to return one or more of these fields:
- `taskId` or `id` or `jobId`
- `status`
- `audioUrl` when finished

## 6) Deploy on Render

Use a **Web Service**.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```
