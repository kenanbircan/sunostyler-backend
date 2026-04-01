# Suno backend for BASE3

This backend is configured for the unofficial sunoapi.org endpoints you provided.

## Routes
- POST `/api/create-song`
- GET `/api/song-status/:id`
- GET `/api/health`

## Uses these upstream endpoints
- POST `/api/custom_generate`
- GET `/api/get?ids={id}`

## Deploy on Render
Build command:
`npm install`

Start command:
`node server.js`

## Environment variables
Copy `.env.example` to `.env` and set:

- `SUNO_API_KEY`
- `SUNO_BASE_URL=https://api.sunoapi.org`
- `SUNO_CREATE_PATH=/api/custom_generate`
- `SUNO_STATUS_PATH=/api/get`
- `ALLOWED_ORIGIN=https://sunostyler.com`

## Notes
- The create route maps your web app's Prompt and Lyrics fields into a Suno custom generation payload.
- The status route polls `/api/get?ids=...` and tries to normalize common response shapes.