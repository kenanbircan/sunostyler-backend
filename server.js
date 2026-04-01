const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 10000;
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';
const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/+$/, '');
const SUNO_CREATE_PATH = process.env.SUNO_CREATE_PATH || '/api/custom_generate';
const SUNO_SIMPLE_CREATE_PATH = process.env.SUNO_SIMPLE_CREATE_PATH || '/api/generate';
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || '/api/get';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map(v => v.trim()),
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));

function authHeaders() {
  if (!SUNO_API_KEY) throw new Error('Missing SUNO_API_KEY');
  return {
    'Authorization': `Bearer ${SUNO_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

function extractTaskId(data) {
  return (
    data?.id ||
    data?.taskId ||
    data?.task_id ||
    data?.data?.id ||
    data?.data?.taskId ||
    data?.data?.task_id ||
    null
  );
}

function extractAudioUrl(data) {
  if (!data) return null;

  const direct = [
    data?.audioUrl,
    data?.audio_url,
    data?.streamAudioUrl,
    data?.stream_audio_url,
    data?.data?.audioUrl,
    data?.data?.audio_url
  ].filter(Boolean);
  if (direct.length) return direct[0];

  const clips = []
    .concat(Array.isArray(data?.clips) ? data.clips : [])
    .concat(Array.isArray(data?.data?.clips) ? data.data.clips : [])
    .concat(Array.isArray(data?.data) ? data.data : []);

  for (const clip of clips) {
    const url = clip?.audio_url || clip?.audioUrl || clip?.stream_audio_url || clip?.streamAudioUrl;
    if (url) return url;
  }

  return null;
}

function extractStatus(data) {
  const raw = (
    data?.status ||
    data?.data?.status ||
    data?.state ||
    data?.data?.state ||
    ''
  ).toString().toLowerCase();

  if (extractAudioUrl(data)) return 'completed';
  if (['complete', 'completed', 'success', 'succeeded', 'done'].includes(raw)) return 'completed';
  if (['error', 'failed', 'failure'].includes(raw)) return 'failed';
  if (['pending', 'queued', 'processing', 'running', 'streaming', 'submitted'].includes(raw)) return raw;
  return raw || 'processing';
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'suno-backend',
    createPath: SUNO_CREATE_PATH,
    simpleCreatePath: SUNO_SIMPLE_CREATE_PATH,
    statusPath: SUNO_STATUS_PATH,
    hasApiKey: Boolean(SUNO_API_KEY)
  });
});

app.post('/api/create-song', async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '').trim();
    const lyrics = String(req.body.lyrics || '').trim();
    const title = String(req.body.title || 'Untitled Song').trim();
    const style = String(req.body.style || req.body.tags || prompt || '').trim();
    const makeInstrumental = Boolean(req.body.make_instrumental || req.body.instrumental || false);

    if (!prompt && !lyrics) {
      return res.status(400).json({ error: 'Prompt or lyrics is required.' });
    }

    const useCustomMode = !!lyrics;
    const upstreamPath = useCustomMode ? SUNO_CREATE_PATH : SUNO_SIMPLE_CREATE_PATH;

    const payload = useCustomMode
      ? {
          title,
          prompt: style || prompt,
          tags: style || '',
          lyrics,
          make_instrumental: makeInstrumental,
          model: req.body.model || 'chirp-v3-5',
          wait_audio: false
        }
      : {
          prompt: style || prompt,
          make_instrumental: makeInstrumental,
          model: req.body.model || 'chirp-v3-5',
          wait_audio: false
        };

    const response = await fetch(`${SUNO_BASE_URL}${upstreamPath}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(async () => ({ raw: await response.text() }));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Suno create request failed',
        mode: useCustomMode ? 'custom_generate' : 'generate',
        sentPayload: payload,
        upstream: data
      });
    }

    const taskId = extractTaskId(data);

    res.json({
      ok: true,
      mode: useCustomMode ? 'custom_generate' : 'generate',
      taskId,
      upstream: data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Unknown server error'
    });
  }
});

app.get('/api/song-status/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing task id' });

    const url = new URL(`${SUNO_BASE_URL}${SUNO_STATUS_PATH}`);
    url.searchParams.set('ids', id);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` }
    });

    const data = await response.json().catch(async () => ({ raw: await response.text() }));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Suno status request failed',
        upstream: data
      });
    }

    res.json({
      ok: true,
      taskId: id,
      status: extractStatus(data),
      audioUrl: extractAudioUrl(data),
      upstream: data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Unknown server error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Suno backend listening on port ${PORT}`);
});