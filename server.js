import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').split(',').map(v => v.trim()).filter(Boolean);
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';
const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/$/, '');
const SUNO_CREATE_PATH = process.env.SUNO_CREATE_PATH || '/api/v1/generate';
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || '/api/v1/generate/{id}';
const SUNO_AUTH_HEADER = process.env.SUNO_AUTH_HEADER || 'Authorization';
const SUNO_AUTH_PREFIX = process.env.SUNO_AUTH_PREFIX || 'Bearer';

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGIN.includes('*') || ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} is not allowed by CORS`));
  }
}));
app.use(express.json({ limit: '2mb' }));

function withAuth(headers = {}) {
  if (!SUNO_API_KEY) throw new Error('SUNO_API_KEY is missing in environment variables.');
  return {
    'Content-Type': 'application/json',
    ...headers,
    [SUNO_AUTH_HEADER]: SUNO_AUTH_PREFIX ? `${SUNO_AUTH_PREFIX} ${SUNO_API_KEY}`.trim() : SUNO_API_KEY
  };
}

function resolveTaskId(payload) {
  return payload?.taskId || payload?.id || payload?.jobId || payload?.data?.taskId || payload?.data?.id || payload?.data?.jobId || '';
}

function resolveAudioUrl(payload) {
  return payload?.audioUrl || payload?.audio_url || payload?.data?.audioUrl || payload?.data?.audio_url || payload?.data?.songUrl || payload?.songUrl || '';
}

function resolveStatus(payload) {
  return payload?.status || payload?.state || payload?.data?.status || payload?.data?.state || 'queued';
}

async function callSuno(path, options = {}) {
  const url = `${SUNO_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { ok: response.ok, status: response.status, payload, url };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'suno-songstudio-backend', hasApiKey: Boolean(SUNO_API_KEY) });
});

app.post('/api/create-song', async (req, res) => {
  const { title = '', tags = '', prompt = '', lyrics = '' } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const outbound = {
    title,
    tags,
    prompt,
    lyrics
  };

  try {
    const result = await callSuno(SUNO_CREATE_PATH, {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(outbound)
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.payload?.error || result.payload?.message || 'Suno create request failed.',
        upstream: result.payload,
        upstreamUrl: result.url
      });
    }

    return res.json({
      ok: true,
      taskId: resolveTaskId(result.payload),
      status: resolveStatus(result.payload),
      audioUrl: resolveAudioUrl(result.payload),
      upstream: result.payload
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected backend error.' });
  }
});

app.get('/api/song-status/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Task ID is required.' });

  try {
    const path = SUNO_STATUS_PATH.replace('{id}', encodeURIComponent(id));
    const result = await callSuno(path, {
      method: 'GET',
      headers: withAuth({ Accept: 'application/json' })
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.payload?.error || result.payload?.message || 'Suno status request failed.',
        upstream: result.payload,
        upstreamUrl: result.url
      });
    }

    return res.json({
      ok: true,
      taskId: resolveTaskId(result.payload) || id,
      status: resolveStatus(result.payload),
      audioUrl: resolveAudioUrl(result.payload),
      upstream: result.payload
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected backend error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Suno Song Studio backend listening on port ${PORT}`);
});
