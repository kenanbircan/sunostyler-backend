const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 10000;
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';
const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/+$/, '');
const SUNO_CREATE_PATH = process.env.SUNO_CREATE_PATH || '/api/v1/generate';
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || '/api/v1/generate/record-info';
const SUNO_CALLBACK_URL = process.env.SUNO_CALLBACK_URL || '';
const SUNO_MODEL = process.env.SUNO_MODEL || 'V3_5';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map(v => v.trim()),
  credentials: false
}));

app.use(express.json({ limit: '2mb' }));

const callbackStore = new Map();

function authHeaders() {
  if (!SUNO_API_KEY) throw new Error('Missing SUNO_API_KEY');
  return {
    Authorization: `Bearer ${SUNO_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

function extractTaskId(data) {
  return (
    data?.data?.task_id ||
    data?.data?.taskId ||
    data?.data?.id ||
    data?.task_id ||
    data?.taskId ||
    data?.id ||
    data?.data?.recordId ||
    data?.data?.record_id ||
    null
  );
}

function extractAudioTracks(data) {
  const sunoData =
    data?.data?.response?.sunoData ||
    data?.response?.sunoData ||
    [];

  if (!Array.isArray(sunoData)) return [];

  return sunoData.map(track => ({
    id: track?.id || null,
    audioUrl: track?.audioUrl || track?.sourceAudioUrl || track?.streamAudioUrl || track?.sourceStreamAudioUrl || null,
    sourceAudioUrl: track?.sourceAudioUrl || null,
    streamAudioUrl: track?.streamAudioUrl || null,
    sourceStreamAudioUrl: track?.sourceStreamAudioUrl || null,
    imageUrl: track?.imageUrl || track?.sourceImageUrl || null,
    sourceImageUrl: track?.sourceImageUrl || null,
    title: track?.title || 'Untitled',
    duration: track?.duration || null,
    modelName: track?.modelName || null,
    prompt: track?.prompt || null,
    tags: track?.tags || null,
    createTime: track?.createTime || null
  }));
}

function extractAudioUrl(data) {
  const tracks = extractAudioTracks(data);
  if (tracks.length && tracks[0].audioUrl) return tracks[0].audioUrl;

  return (
    data?.audioUrl ||
    data?.audio_url ||
    data?.data?.audioUrl ||
    data?.data?.audio_url ||
    data?.data?.sourceAudioUrl ||
    data?.data?.source_audio_url ||
    null
  );
}

function extractStatus(data) {
  const raw = (
    data?.status ||
    data?.state ||
    data?.data?.status ||
    data?.data?.state ||
    ''
  ).toString().toLowerCase();

  if (extractAudioTracks(data).length > 0 || extractAudioUrl(data)) return 'completed';
  if (['complete', 'completed', 'success', 'succeeded', 'done'].includes(raw)) return 'completed';
  if (['failed', 'error', 'failure'].includes(raw)) return 'failed';
  return raw || 'processing';
}

function buildShortStyle(prompt) {
  const clean = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= 450) return clean;
  return clean.slice(0, 450).trim();
}

function normalizeError(responseStatus, data) {
  const upstreamCode = data?.code;
  const upstreamMsg = data?.msg || data?.message || 'Unknown upstream error';

  if (responseStatus === 429 || upstreamCode === 429) {
    return {
      error: 'Suno credits are insufficient. Please top up the API account.',
      code: 429,
      upstream: data
    };
  }

  if (upstreamMsg === 'Please enter callBackUrl.') {
    return {
      error: 'Suno callback URL is missing.',
      code: responseStatus || 400,
      upstream: data
    };
  }

  if (upstreamMsg === 'customMode cannot be null') {
    return {
      error: 'Suno customMode is missing from the request.',
      code: responseStatus || 400,
      upstream: data
    };
  }

  if (String(upstreamMsg).includes('model cannot be null')) {
    return {
      error: 'Suno model is missing or invalid.',
      code: responseStatus || 400,
      upstream: data
    };
  }

  if (String(upstreamMsg).includes('music style cannot exceed 500 characters')) {
    return {
      error: 'Suno music style is too long.',
      code: responseStatus || 400,
      upstream: data
    };
  }

  return {
    error: 'Suno request failed.',
    code: responseStatus || 500,
    upstream: data
  };
}

async function fetchSunoStatusById(id) {
  const candidateUrls = [
    `${SUNO_BASE_URL}${SUNO_STATUS_PATH}?taskId=${encodeURIComponent(id)}`,
    `${SUNO_BASE_URL}${SUNO_STATUS_PATH}?id=${encodeURIComponent(id)}`,
    `${SUNO_BASE_URL}${SUNO_STATUS_PATH}?recordId=${encodeURIComponent(id)}`
  ];

  let lastData = null;
  let lastStatus = 500;

  for (const candidate of candidateUrls) {
    const response = await fetch(candidate, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SUNO_API_KEY}` }
    });

    const data = await response.json().catch(async () => ({ raw: await response.text() }));
    lastData = data;
    lastStatus = response.status;

    if (response.ok) {
      return {
        ok: true,
        statusCode: response.status,
        data
      };
    }
  }

  return {
    ok: false,
    statusCode: lastStatus,
    data: lastData
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'suno-backend',
    createPath: SUNO_CREATE_PATH,
    statusPath: SUNO_STATUS_PATH,
    model: SUNO_MODEL,
    hasApiKey: Boolean(SUNO_API_KEY),
    hasCallbackUrl: Boolean(SUNO_CALLBACK_URL)
  });
});

app.post('/api/suno-callback', (req, res) => {
  const body = req.body || {};
  const taskId =
    body?.taskId ||
    body?.task_id ||
    body?.id ||
    body?.data?.taskId ||
    body?.data?.task_id ||
    body?.data?.id ||
    body?.data?.recordId ||
    body?.data?.record_id;

  if (taskId) {
    callbackStore.set(String(taskId), body);
  }

  res.json({ ok: true });
});

app.post('/api/create-song', async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '').trim();
    let lyrics = String(req.body.lyrics || '').trim();
    const title = String(req.body.title || 'Untitled Song').trim();

    if (!prompt && !lyrics) {
      return res.status(400).json({ error: 'Prompt or lyrics is required.' });
    }

    if (!lyrics) {
      lyrics = `[Verse]
${prompt}

[Chorus]
${prompt}

[Outro]
${prompt}`;
    }

    if (!SUNO_CALLBACK_URL) {
      return res.status(500).json({ error: 'Missing SUNO_CALLBACK_URL' });
    }

    const shortStyle = buildShortStyle(prompt);

    const payload = {
      title,
      prompt,
      lyrics,
      customMode: true,
      instrumental: false,
      style: shortStyle,
      model: SUNO_MODEL,
      callBackUrl: SUNO_CALLBACK_URL
    };

    const response = await fetch(`${SUNO_BASE_URL}${SUNO_CREATE_PATH}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(async () => ({ raw: await response.text() }));

    if (!response.ok || (data?.code && data.code !== 200)) {
      const normalized = normalizeError(response.status, data);
      return res.status(normalized.code === 429 ? 200 : (response.status || normalized.code)).json({
        ok: false,
        taskId: null,
        ...normalized,
        attemptedUrl: `${SUNO_BASE_URL}${SUNO_CREATE_PATH}`,
        sentPayload: payload
      });
    }

    const taskId = extractTaskId(data);

    return res.json({
      ok: true,
      taskId,
      upstream: data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      taskId: null,
      error: error.message || 'Unknown server error'
    });
  }
});

app.get('/api/song-status/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing task id' });
    }

    if (callbackStore.has(id)) {
      const cb = callbackStore.get(id);
      return res.json({
        ok: true,
        taskId: id,
        status: extractStatus(cb),
        audioUrl: extractAudioUrl(cb),
        tracks: extractAudioTracks(cb),
        upstream: cb
      });
    }

    const result = await fetchSunoStatusById(id);

    if (result.ok) {
      return res.json({
        ok: true,
        taskId: id,
        status: extractStatus(result.data),
        audioUrl: extractAudioUrl(result.data),
        tracks: extractAudioTracks(result.data),
        upstream: result.data
      });
    }

    return res.status(result.statusCode).json({
      ok: false,
      error: 'Suno status request failed',
      upstream: result.data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Unknown server error'
    });
  }
});

app.get('/api/song-tracks/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing task id' });
    }

    if (callbackStore.has(id)) {
      const cb = callbackStore.get(id);
      return res.json({
        ok: true,
        taskId: id,
        tracks: extractAudioTracks(cb),
        upstream: cb
      });
    }

    const result = await fetchSunoStatusById(id);

    if (result.ok) {
      return res.json({
        ok: true,
        taskId: id,
        tracks: extractAudioTracks(result.data),
        upstream: result.data
      });
    }

    return res.status(result.statusCode).json({
      ok: false,
      error: 'Suno track request failed',
      upstream: result.data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Unknown server error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Suno backend listening on port ${PORT}`);
});
