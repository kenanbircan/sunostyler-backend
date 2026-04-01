# Fixed Suno backend for BASE3

This version fixes the create-song logic:

- If lyrics are present -> uses `/api/custom_generate`
- If lyrics are empty -> uses `/api/generate`

## Routes
- POST `/api/create-song`
- GET `/api/song-status/:id`
- GET `/api/health`