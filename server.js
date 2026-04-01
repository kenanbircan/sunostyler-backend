// server.js
// (copy everything from here ↓ into your file)

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 10000;
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';
const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/+$/, '');
const SUNO_CREATE_PATH = process.env.SUNO_CREATE_PATH || '/api/custom_generate';
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || '/api/get';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map(v => v.trim()),
}));

app.use(express.json());

function authHeaders() {
  return {
    Authorization: `Bearer ${SUNO_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

function extractTaskId(data) {
  return data?.id || data?.taskId || data?.data?.id;
}

function extractAudioUrl(data) {
  return data?.audio_url || data?.data?.[0]?.audio_url || null;
}

function extractStatus(data) {
  if (extractAudioUrl(data)) return 'completed';
  return data?.status || 'processing';
}

app.post('/api/create-song', async (req, res) => {
  try {
    const prompt = req.body.prompt || '';
    let lyrics = req.body.lyrics || '';

    if (!lyrics) {
      lyrics = `[Verse]\n${prompt}\n\n[Chorus]\n${prompt}`;
    }

    const payload = {
      title: 'Generated Song',
      prompt,
      tags: prompt,
      lyrics,
      make_instrumental: false,
      model: 'chirp-v3-5'
    };

    const r = await fetch(`${SUNO_BASE_URL}${SUNO_CREATE_PATH}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    res.json({
      taskId: extractTaskId(data),
      upstream: data
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/song-status/:id', async (req, res) => {
  const id = req.params.id;

  const url = `${SUNO_BASE_URL}${SUNO_STATUS_PATH}?ids=${id}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${SUNO_API_KEY}` }
  });

  const data = await r.json();

  res.json({
    status: extractStatus(data),
    audioUrl: extractAudioUrl(data),
    upstream: data
  });
});

app.listen(PORT, () => console.log('Server running'));
