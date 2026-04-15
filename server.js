
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const PORT = Number(process.env.PORT || 10000);
const SUNO_API_KEY = process.env.SUNO_API_KEY || '';
const SUNO_BASE_URL = (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/+$/, '');

const SUNO_CREATE_PATH = process.env.SUNO_CREATE_PATH || '/api/v1/generate';
const SUNO_STATUS_PATH = process.env.SUNO_STATUS_PATH || '/api/v1/generate/record-info';
const SUNO_EXTEND_PATH = process.env.SUNO_EXTEND_PATH || '/api/v1/generate/extend';
const SUNO_UPLOAD_COVER_PATH = process.env.SUNO_UPLOAD_COVER_PATH || '/api/v1/generate/upload-cover';
const SUNO_UPLOAD_EXTEND_PATH = process.env.SUNO_UPLOAD_EXTEND_PATH || '/api/v1/generate/upload-extend';
const SUNO_ADD_INSTRUMENTAL_PATH = process.env.SUNO_ADD_INSTRUMENTAL_PATH || '/api/v1/generate/add-instrumental';
const SUNO_REMIX_PATH = process.env.SUNO_REMIX_PATH || SUNO_UPLOAD_COVER_PATH;

const SUNO_ADD_VOCALS_PATH = process.env.SUNO_ADD_VOCALS_PATH || '/api/v1/generate/add-vocals';
const SUNO_GENERATE_PERSONA_PATH = process.env.SUNO_GENERATE_PERSONA_PATH || '/api/v1/generate/generate-persona';
const SUNO_MASHUP_PATH = process.env.SUNO_MASHUP_PATH || '/api/v1/generate/mashup';
const SUNO_LYRICS_PATH = process.env.SUNO_LYRICS_PATH || '/api/v1/lyrics';
const SUNO_LYRICS_STATUS_PATH = process.env.SUNO_LYRICS_STATUS_PATH || '/api/v1/lyrics/record-info';
const SUNO_SOUNDS_PATH = process.env.SUNO_SOUNDS_PATH || '/api/v1/generate/sounds';
const SUNO_WAV_GENERATE_PATH = process.env.SUNO_WAV_GENERATE_PATH || '/api/v1/wav/generate';
const SUNO_WAV_STATUS_PATH = process.env.SUNO_WAV_STATUS_PATH || '/api/v1/wav/record-info';
const SUNO_VOCAL_REMOVAL_PATH = process.env.SUNO_VOCAL_REMOVAL_PATH || '/api/v1/vocal-removal/generate';
const SUNO_VOCAL_REMOVAL_STATUS_PATH = process.env.SUNO_VOCAL_REMOVAL_STATUS_PATH || '/api/v1/vocal-removal/record-info';
const SUNO_MIDI_GENERATE_PATH = process.env.SUNO_MIDI_GENERATE_PATH || '/api/v1/midi/generate';
const SUNO_MIDI_STATUS_PATH = process.env.SUNO_MIDI_STATUS_PATH || '/api/v1/midi/record-info';
const SUNO_MP4_GENERATE_PATH = process.env.SUNO_MP4_GENERATE_PATH || '/api/v1/mp4/generate';
const SUNO_MP4_STATUS_PATH = process.env.SUNO_MP4_STATUS_PATH || '/api/v1/mp4/record-info';
const SUNO_STYLE_BOOST_PATH = process.env.SUNO_STYLE_BOOST_PATH || '/api/v1/style/generate';
const SUNO_MUSIC_COVER_PATH = process.env.SUNO_MUSIC_COVER_PATH || '/api/v1/suno/cover/generate';
const SUNO_MUSIC_COVER_STATUS_PATH = process.env.SUNO_MUSIC_COVER_STATUS_PATH || '/api/v1/suno/cover/record-info';
const SUNO_REPLACE_SECTION_PATH = process.env.SUNO_REPLACE_SECTION_PATH || '/api/v1/generate/replace-section';
const SUNO_TIMESTAMPED_LYRICS_PATH = process.env.SUNO_TIMESTAMPED_LYRICS_PATH || '/api/v1/generate/get-timestamped-lyrics';
const SUNO_CREDITS_PATH = process.env.SUNO_CREDITS_PATH || '/api/v1/generate/credit';

const SUNO_CALLBACK_URL = process.env.SUNO_CALLBACK_URL || '';
const SUNO_MODEL = process.env.SUNO_MODEL || 'V5_5';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '2mb';
const CALLBACK_TTL_MS = Number(process.env.CALLBACK_TTL_MS || 24 * 60 * 60 * 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const ENABLE_VERBOSE_LOGS = String(process.env.ENABLE_VERBOSE_LOGS || 'false').toLowerCase() === 'true';

app.use(cors({
  origin: ALLOWED_ORIGIN === '*'
    ? true
    : ALLOWED_ORIGIN.split(',').map(v => v.trim()).filter(Boolean),
  credentials: false
}));

app.use(express.json({ limit: JSON_BODY_LIMIT }));

const callbackStore = new Map();

const MODEL_LIMITS = {
  V4: { promptMax: 3000, styleMax: 200, titleMax: 80 },
  V4_5: { promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V4_5PLUS: { promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V4_5ALL: { promptMax: 5000, styleMax: 1000, titleMax: 80 },
  V5: { promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V5_5: { promptMax: 5000, styleMax: 1000, titleMax: 100 }
};

const ADD_INSTRUMENTAL_MODELS = ['V4_5PLUS', 'V5', 'V5_5'];
const SEPARATION_TYPES = ['separate_vocal', 'split_stem'];

function nowIso() {
  return new Date().toISOString();
}

function log(...args) {
  if (ENABLE_VERBOSE_LOGS) console.log(...args);
}

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function authHeaders() {
  if (!SUNO_API_KEY) throw new Error('Missing SUNO_API_KEY');
  return {
    Authorization: `Bearer ${SUNO_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function cleanString(value, fallback = '') {
  return safeString(value, fallback).replace(/\s+/g, ' ').trim();
}

function isValidUrl(value) {
  const str = cleanString(value);
  if (!str) return false;
  try {
    const url = new URL(str);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function getModelLimits(model) {
  return MODEL_LIMITS[model] || MODEL_LIMITS[SUNO_MODEL] || MODEL_LIMITS.V5_5;
}

function clamp01(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) return undefined;
  return Math.round(num * 100) / 100;
}

function parseNonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function truncate(value, max) {
  const str = safeString(value, '').trim();
  if (!max || str.length <= max) return str;
  return str.slice(0, max).trim();
}

function cleanupCallbackStore() {
  const cutoff = Date.now() - CALLBACK_TTL_MS;
  for (const [key, value] of callbackStore.entries()) {
    const createdAt = Number(value?._storedAt || 0);
    if (createdAt && createdAt < cutoff) callbackStore.delete(key);
  }
}

setInterval(
  cleanupCallbackStore,
  Math.max(60_000, Math.min(CALLBACK_TTL_MS, 10 * 60 * 1000))
).unref();

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
  const callbackArray = Array.isArray(data?.data?.data) ? data.data.data : null;
  if (callbackArray) {
    return callbackArray.map(track => ({
      id: track?.id || null,
      audioUrl:
        track?.audio_url ||
        track?.audioUrl ||
        track?.source_audio_url ||
        track?.sourceAudioUrl ||
        track?.stream_audio_url ||
        track?.streamAudioUrl ||
        track?.source_stream_audio_url ||
        track?.sourceStreamAudioUrl ||
        null,
      sourceAudioUrl: track?.source_audio_url || track?.sourceAudioUrl || null,
      streamAudioUrl: track?.stream_audio_url || track?.streamAudioUrl || null,
      sourceStreamAudioUrl: track?.source_stream_audio_url || track?.sourceStreamAudioUrl || null,
      imageUrl: track?.image_url || track?.imageUrl || track?.source_image_url || track?.sourceImageUrl || null,
      sourceImageUrl: track?.source_image_url || track?.sourceImageUrl || null,
      title: track?.title || 'Untitled',
      duration: track?.duration || null,
      modelName: track?.model_name || track?.modelName || null,
      prompt: track?.prompt || null,
      tags: track?.tags || null,
      createTime: track?.createTime || null,
      lyric: track?.lyric || null
    }));
  }

  const sunoData =
    data?.data?.response?.sunoData ||
    data?.response?.sunoData ||
    data?.data?.sunoData ||
    data?.sunoData ||
    [];

  if (!Array.isArray(sunoData)) return [];

  return sunoData.map(track => ({
    id: track?.id || null,
    audioUrl:
      track?.audioUrl ||
      track?.sourceAudioUrl ||
      track?.streamAudioUrl ||
      track?.sourceStreamAudioUrl ||
      track?.audio_url ||
      track?.source_audio_url ||
      track?.stream_audio_url ||
      track?.source_stream_audio_url ||
      null,
    sourceAudioUrl: track?.sourceAudioUrl || track?.source_audio_url || null,
    streamAudioUrl: track?.streamAudioUrl || track?.stream_audio_url || null,
    sourceStreamAudioUrl: track?.sourceStreamAudioUrl || track?.source_stream_audio_url || null,
    imageUrl: track?.imageUrl || track?.sourceImageUrl || track?.image_url || track?.source_image_url || null,
    sourceImageUrl: track?.sourceImageUrl || track?.source_image_url || null,
    title: track?.title || 'Untitled',
    duration: track?.duration || null,
    modelName: track?.modelName || track?.model_name || null,
    prompt: track?.prompt || null,
    tags: track?.tags || null,
    createTime: track?.createTime || null,
    lyric: track?.lyric || null
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
    data?.data?.audioWavUrl ||
    data?.audioWavUrl ||
    data?.data?.video_url ||
    data?.video_url ||
    null
  );
}

function extractStatus(data) {
  const callbackType = (
    data?.data?.callbackType ||
    data?.callbackType ||
    data?.data?.callback_type ||
    data?.callback_type ||
    ''
  ).toString().toLowerCase();

  if (callbackType) {
    if (callbackType === 'complete') return 'completed';
    if (callbackType === 'error') return 'failed';
    return callbackType;
  }

  const raw = (
    data?.status ||
    data?.state ||
    data?.data?.status ||
    data?.data?.state ||
    data?.msg ||
    ''
  ).toString().toLowerCase();

  if (extractAudioTracks(data).length > 0 || extractAudioUrl(data)) return 'completed';
  if (['complete', 'completed', 'success', 'succeeded', 'done'].includes(raw)) return 'completed';
  if (['failed', 'error', 'failure'].includes(raw)) return 'failed';
  return raw || 'processing';
}

function normalizeError(responseStatus, data) {
  const upstreamCode = data?.code;
  const upstreamMsg = data?.msg || data?.message || data?.error || 'Unknown upstream error';
  const normalizedMsg = String(upstreamMsg).toLowerCase();

  if (responseStatus === 429 || upstreamCode === 429) {
    return { error: 'Suno credits are insufficient. Please top up the API account.', code: 429, upstream: data };
  }
  if (responseStatus === 430 || upstreamCode === 430) {
    return { error: 'Suno request frequency is too high. Please retry shortly.', code: 430, upstream: data };
  }
  if (responseStatus === 455 || upstreamCode === 455) {
    return { error: 'Suno is under maintenance.', code: 455, upstream: data };
  }
  if (responseStatus === 405 || upstreamCode === 405) {
    return { error: 'Suno rate limit exceeded.', code: 405, upstream: data };
  }
  if (responseStatus === 409 || upstreamCode === 409) {
    return { error: upstreamMsg || 'A record for this request already exists.', code: 409, upstream: data };
  }
  if (upstreamMsg === 'Please enter callBackUrl.') {
    return { error: 'Suno callback URL is missing.', code: responseStatus || 400, upstream: data };
  }
  if (upstreamMsg === 'customMode cannot be null') {
    return { error: 'Suno customMode is missing from the request.', code: responseStatus || 400, upstream: data };
  }
  if (normalizedMsg.includes('model cannot be null')) {
    return { error: 'Suno model is missing or invalid.', code: responseStatus || 400, upstream: data };
  }
  if (normalizedMsg.includes('music style cannot exceed')) {
    return { error: 'Suno music style is too long.', code: responseStatus || 400, upstream: data };
  }
  if (normalizedMsg.includes('title cannot exceed')) {
    return { error: 'Suno title is too long.', code: responseStatus || 400, upstream: data };
  }
  if (normalizedMsg.includes('prompt cannot exceed') || normalizedMsg.includes('theme or prompt too long')) {
    return { error: 'Suno prompt is too long.', code: responseStatus || 400, upstream: data };
  }
  if (normalizedMsg.includes('insufficient credits')) {
    return { error: 'Suno credits are insufficient. Please top up the API account.', code: 429, upstream: data };
  }
  if (responseStatus === 413 || upstreamCode === 413) {
    return { error: 'Prompt, style, or title is too long for the selected model.', code: 413, upstream: data };
  }
  return { error: 'Suno request failed.', code: responseStatus || 500, upstream: data };
}

function validateWeights(body) {
  const errors = [];
  const styleWeight = clamp01(body.styleWeight);
  const weirdnessConstraint = clamp01(body.weirdnessConstraint);
  const audioWeight = clamp01(body.audioWeight);

  if (body.styleWeight !== undefined && styleWeight === undefined) errors.push('styleWeight must be a number between 0 and 1.');
  if (body.weirdnessConstraint !== undefined && weirdnessConstraint === undefined) errors.push('weirdnessConstraint must be a number between 0 and 1.');
  if (body.audioWeight !== undefined && audioWeight === undefined) errors.push('audioWeight must be a number between 0 and 1.');

  return { errors, styleWeight, weirdnessConstraint, audioWeight };
}

function validateCommonGenerationOptions(body, model) {
  const errors = [];
  const personaId = cleanString(body.personaId || '');
  const personaModel = cleanString(body.personaModel || 'style_persona');
  const negativeTags = cleanString(body.negativeTags || '');
  const vocalGender = cleanString(body.vocalGender || '');

  const weightValidation = validateWeights(body);
  errors.push(...weightValidation.errors);

  if (personaModel && !['style_persona', 'voice_persona'].includes(personaModel)) {
    errors.push('personaModel must be "style_persona" or "voice_persona".');
  }
  if (vocalGender && !['m', 'f'].includes(vocalGender)) {
    errors.push('vocalGender must be "m" or "f".');
  }

  return {
    errors,
    values: {
      personaId,
      personaModel,
      negativeTags,
      vocalGender,
      styleWeight: weightValidation.styleWeight,
      weirdnessConstraint: weightValidation.weirdnessConstraint,
      audioWeight: weightValidation.audioWeight
    }
  };
}

function validateCreateSongRequest(body) {
  const customMode = body.customMode !== undefined ? Boolean(body.customMode) : true;
  const instrumental = body.instrumental !== undefined ? Boolean(body.instrumental) : false;
  const model = cleanString(body.model || SUNO_MODEL);
  const limits = getModelLimits(model);

  const title = cleanString(body.title || 'Untitled Song');
  const prompt = safeString(body.prompt || '').trim();
  const lyrics = safeString(body.lyrics || '').trim();
  const style = cleanString(body.style || '');
  const errors = [];

  if (!MODEL_LIMITS[model]) {
    errors.push(`Unsupported model "${model}". Supported models: ${Object.keys(MODEL_LIMITS).join(', ')}`);
  }

  if (!customMode) {
    const ideaPrompt = prompt || lyrics;
    if (!ideaPrompt) errors.push('prompt is required when customMode is false.');
    if (ideaPrompt.length > 500) errors.push('prompt must be 500 characters or fewer when customMode is false.');
  }

  if (customMode) {
    if (!title) errors.push('title is required when customMode is true.');
    if (title.length > limits.titleMax) errors.push(`title exceeds ${limits.titleMax} characters for model ${model}.`);
    if (!style) errors.push('style is required when customMode is true.');
    if (style.length > limits.styleMax) errors.push(`style exceeds ${limits.styleMax} characters for model ${model}.`);
    if (!instrumental) {
      const effectiveLyrics = prompt || lyrics;
      if (!effectiveLyrics) errors.push('prompt or lyrics is required when customMode is true and instrumental is false.');
      if (effectiveLyrics.length > limits.promptMax) errors.push(`prompt/lyrics exceeds ${limits.promptMax} characters for model ${model}.`);
    }
  }

  const commonValidation = validateCommonGenerationOptions(body, model);
  errors.push(...commonValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
    values: {
      customMode, instrumental, model, title, prompt, lyrics, style,
      personaId: commonValidation.values.personaId,
      personaModel: commonValidation.values.personaModel,
      negativeTags: commonValidation.values.negativeTags,
      vocalGender: commonValidation.values.vocalGender,
      styleWeight: commonValidation.values.styleWeight,
      weirdnessConstraint: commonValidation.values.weirdnessConstraint,
      audioWeight: commonValidation.values.audioWeight,
      limits
    }
  };
}

function validateExtendSongRequest(body) {
  const defaultParamFlag = body.defaultParamFlag !== undefined ? Boolean(body.defaultParamFlag) : false;
  const instrumental = body.instrumental !== undefined ? Boolean(body.instrumental) : false;
  const model = cleanString(body.model || SUNO_MODEL);
  const title = cleanString(body.title || 'Untitled Extension');
  const prompt = safeString(body.prompt || '').trim();
  const style = cleanString(body.style || '');
  const audioId = cleanString(body.audioId || '');
  const continueAt = parsePositiveNumber(body.continueAt);

  const errors = [];
  if (!MODEL_LIMITS[model]) errors.push(`Unsupported model "${model}". Supported models: ${Object.keys(MODEL_LIMITS).join(', ')}`);
  if (!audioId) errors.push('audioId is required.');

  const limits = getModelLimits(model);

  if (defaultParamFlag) {
    if (!prompt) errors.push('prompt is required when defaultParamFlag is true.');
    if (!style) errors.push('style is required when defaultParamFlag is true.');
    if (!title) errors.push('title is required when defaultParamFlag is true.');
    if (continueAt === undefined) errors.push('continueAt must be a number greater than 0 when defaultParamFlag is true.');
    if (prompt.length > limits.promptMax) errors.push(`prompt exceeds ${limits.promptMax} characters for model ${model}.`);
    if (style.length > limits.styleMax) errors.push(`style exceeds ${limits.styleMax} characters for model ${model}.`);
    if (title.length > limits.titleMax) errors.push(`title exceeds ${limits.titleMax} characters for model ${model}.`);
  }

  const commonValidation = validateCommonGenerationOptions(body, model);
  errors.push(...commonValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
    values: {
      defaultParamFlag, instrumental, model, audioId, prompt, style, title, continueAt,
      personaId: commonValidation.values.personaId,
      personaModel: commonValidation.values.personaModel,
      negativeTags: commonValidation.values.negativeTags,
      vocalGender: commonValidation.values.vocalGender,
      styleWeight: commonValidation.values.styleWeight,
      weirdnessConstraint: commonValidation.values.weirdnessConstraint,
      audioWeight: commonValidation.values.audioWeight
    }
  };
}

function validateUploadCoverRequest(body) {
  const customMode = body.customMode !== undefined ? Boolean(body.customMode) : true;
  const instrumental = body.instrumental !== undefined ? Boolean(body.instrumental) : false;
  const model = cleanString(body.model || SUNO_MODEL);
  const uploadUrl = cleanString(body.uploadUrl || '');
  const prompt = safeString(body.prompt || '').trim();
  const style = cleanString(body.style || '');
  const title = cleanString(body.title || 'Untitled Cover');
  const errors = [];
  if (!MODEL_LIMITS[model]) errors.push(`Unsupported model "${model}". Supported models: ${Object.keys(MODEL_LIMITS).join(', ')}`);
  if (!isValidUrl(uploadUrl)) errors.push('uploadUrl must be a valid public http or https URL.');

  const limits = getModelLimits(model);

  if (customMode) {
    if (!style) errors.push('style is required when customMode is true.');
    if (!title) errors.push('title is required when customMode is true.');
    if (style.length > limits.styleMax) errors.push(`style exceeds ${limits.styleMax} characters for model ${model}.`);
    if (title.length > limits.titleMax) errors.push(`title exceeds ${limits.titleMax} characters for model ${model}.`);
    if (!instrumental) {
      if (!prompt) errors.push('prompt is required when customMode is true and instrumental is false.');
      if (prompt.length > limits.promptMax) errors.push(`prompt exceeds ${limits.promptMax} characters for model ${model}.`);
    }
  } else {
    if (!prompt) errors.push('prompt is required when customMode is false.');
    if (prompt.length > 500) errors.push('prompt must be 500 characters or fewer when customMode is false.');
  }

  const commonValidation = validateCommonGenerationOptions(body, model);
  errors.push(...commonValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
    values: {
      uploadUrl, customMode, instrumental, model, prompt, style, title,
      personaId: commonValidation.values.personaId,
      personaModel: commonValidation.values.personaModel,
      negativeTags: commonValidation.values.negativeTags,
      vocalGender: commonValidation.values.vocalGender,
      styleWeight: commonValidation.values.styleWeight,
      weirdnessConstraint: commonValidation.values.weirdnessConstraint,
      audioWeight: commonValidation.values.audioWeight
    }
  };
}

function validateUploadExtendRequest(body) {
  const defaultParamFlag = body.defaultParamFlag !== undefined ? Boolean(body.defaultParamFlag) : true;
  const instrumental = body.instrumental !== undefined ? Boolean(body.instrumental) : false;
  const model = cleanString(body.model || SUNO_MODEL);
  const uploadUrl = cleanString(body.uploadUrl || '');
  const prompt = safeString(body.prompt || '').trim();
  const style = cleanString(body.style || '');
  const title = cleanString(body.title || 'Untitled Upload Extension');
  const continueAt = parsePositiveNumber(body.continueAt);

  const errors = [];
  if (!MODEL_LIMITS[model]) errors.push(`Unsupported model "${model}". Supported models: ${Object.keys(MODEL_LIMITS).join(', ')}`);
  if (!isValidUrl(uploadUrl)) errors.push('uploadUrl must be a valid public http or https URL.');

  const limits = getModelLimits(model);

  if (defaultParamFlag) {
    if (!style) errors.push('style is required when defaultParamFlag is true.');
    if (!title) errors.push('title is required when defaultParamFlag is true.');
    if (continueAt === undefined) errors.push('continueAt must be a number greater than 0 when defaultParamFlag is true.');
    if (!instrumental && !prompt) errors.push('prompt is required when defaultParamFlag is true and instrumental is false.');
    if (prompt.length > limits.promptMax) errors.push(`prompt exceeds ${limits.promptMax} characters for model ${model}.`);
    if (style.length > limits.styleMax) errors.push(`style exceeds ${limits.styleMax} characters for model ${model}.`);
    if (title.length > limits.titleMax) errors.push(`title exceeds ${limits.titleMax} characters for model ${model}.`);
  } else {
    if (!prompt) errors.push('prompt is required when defaultParamFlag is false.');
  }

  const commonValidation = validateCommonGenerationOptions(body, model);
  errors.push(...commonValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
    values: {
      uploadUrl, defaultParamFlag, instrumental, model, prompt, style, title, continueAt,
      personaId: commonValidation.values.personaId,
      personaModel: commonValidation.values.personaModel,
      negativeTags: commonValidation.values.negativeTags,
      vocalGender: commonValidation.values.vocalGender,
      styleWeight: commonValidation.values.styleWeight,
      weirdnessConstraint: commonValidation.values.weirdnessConstraint,
      audioWeight: commonValidation.values.audioWeight
    }
  };
}

function validateAddInstrumentalRequest(body) {
  const uploadUrl = cleanString(body.uploadUrl || '');
  const title = cleanString(body.title || 'Untitled Instrumental');
  const negativeTags = cleanString(body.negativeTags || '');
  const tags = cleanString(body.tags || '');
  const vocalGender = cleanString(body.vocalGender || '');
  const styleWeight = clamp01(body.styleWeight);
  const weirdnessConstraint = clamp01(body.weirdnessConstraint);
  const audioWeight = clamp01(body.audioWeight);
  const model = cleanString(body.model || 'V4_5PLUS');

  const errors = [];
  if (!isValidUrl(uploadUrl)) errors.push('uploadUrl must be a valid public http or https URL.');
  if (!title) errors.push('title is required.');
  if (!negativeTags) errors.push('negativeTags is required.');
  if (!tags) errors.push('tags is required.');
  if (vocalGender && !['m', 'f'].includes(vocalGender)) errors.push('vocalGender must be "m" or "f".');
  if (!ADD_INSTRUMENTAL_MODELS.includes(model)) errors.push(`Unsupported model "${model}". Supported models: ${ADD_INSTRUMENTAL_MODELS.join(', ')}`);
  if (body.styleWeight !== undefined && styleWeight === undefined) errors.push('styleWeight must be a number between 0 and 1.');
  if (body.weirdnessConstraint !== undefined && weirdnessConstraint === undefined) errors.push('weirdnessConstraint must be a number between 0 and 1.');
  if (body.audioWeight !== undefined && audioWeight === undefined) errors.push('audioWeight must be a number between 0 and 1.');

  return {
    ok: errors.length === 0,
    errors,
    values: { uploadUrl, title, negativeTags, tags, vocalGender, styleWeight, weirdnessConstraint, audioWeight, model }
  };
}

function validateRemixRequest(body) {
  return validateUploadCoverRequest(body);
}

function stripEmptyFields(payload) {
  const out = { ...payload };
  Object.keys(out).forEach(key => {
    if (out[key] === undefined || out[key] === '') delete out[key];
  });
  return out;
}

function resolveCallbackUrl(body) {
  const explicit = cleanString(body?.callBackUrl || '');
  return explicit || SUNO_CALLBACK_URL || '';
}

function validateRequiredString(body, field, errors, label = field) {
  const value = cleanString(body?.[field] || '');
  if (!value) errors.push(`${label} is required.`);
  return value;
}

function validateOptionalStringMax(body, field, max, errors) {
  const value = cleanString(body?.[field] || '');
  if (value && value.length > max) errors.push(`${field} must be ${max} characters or fewer.`);
  return value;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponseBody(response) {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return { raw: text };
    } catch {
      return { raw: null };
    }
  }
}

async function performSunoPost({ path, payload, requestId, actionName }) {
  log(`[${actionName} REQUEST]`, requestId, payload);
  const response = await fetchWithTimeout(`${SUNO_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await parseResponseBody(response);
  log(`[${actionName} RESPONSE]`, requestId, { status: response.status, body: data });

  if (!response.ok || (data?.code && data.code !== 200)) {
    const normalized = normalizeError(response.status, data);
    return {
      ok: false,
      statusCode: normalized.code === 429 ? 200 : (response.status || normalized.code),
      body: {
        ok: false,
        requestId,
        taskId: null,
        ...normalized,
        attemptedUrl: `${SUNO_BASE_URL}${path}`,
        sentPayload: payload
      }
    };
  }

  return {
    ok: true,
    statusCode: 200,
    body: {
      ok: true,
      requestId,
      taskId: extractTaskId(data),
      status: 'submitted',
      upstream: data
    }
  };
}

async function performSunoGet({ path, query = {}, requestId, actionName }) {
  const url = new URL(`${SUNO_BASE_URL}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  log(`[${actionName} REQUEST]`, requestId, url.toString());

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${SUNO_API_KEY}` }
  });

  const data = await parseResponseBody(response);
  log(`[${actionName} RESPONSE]`, requestId, { status: response.status, body: data });

  if (!response.ok || (data?.code && ![200, '200'].includes(data.code))) {
    const normalized = normalizeError(response.status, data);
    return {
      ok: false,
      statusCode: response.status || normalized.code || 500,
      body: { ok: false, requestId, ...normalized, attemptedUrl: url.toString() }
    };
  }

  return { ok: true, statusCode: 200, body: { ok: true, requestId, upstream: data } };
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
    const response = await fetchWithTimeout(candidate, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SUNO_API_KEY}` }
    });

    const data = await parseResponseBody(response);
    lastData = data;
    lastStatus = response.status;

    if (response.ok && (data?.code === undefined || data?.code === 200)) {
      return { ok: true, statusCode: response.status, data, attemptedUrl: candidate };
    }
  }

  return { ok: false, statusCode: lastStatus, data: lastData };
}

function handlerError(res, requestId, error) {
  const isAbort = error?.name === 'AbortError';
  return res.status(isAbort ? 504 : 500).json({
    ok: false,
    requestId,
    taskId: null,
    error: isAbort ? `Upstream request timed out after ${REQUEST_TIMEOUT_MS}ms` : (error.message || 'Unknown server error')
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'suno-backend',
    time: nowIso(),
    createPath: SUNO_CREATE_PATH,
    statusPath: SUNO_STATUS_PATH,
    extendPath: SUNO_EXTEND_PATH,
    uploadCoverPath: SUNO_UPLOAD_COVER_PATH,
    uploadExtendPath: SUNO_UPLOAD_EXTEND_PATH,
    addInstrumentalPath: SUNO_ADD_INSTRUMENTAL_PATH,
    remixPath: SUNO_REMIX_PATH,
    addVocalsPath: SUNO_ADD_VOCALS_PATH,
    generatePersonaPath: SUNO_GENERATE_PERSONA_PATH,
    mashupPath: SUNO_MASHUP_PATH,
    lyricsPath: SUNO_LYRICS_PATH,
    lyricsStatusPath: SUNO_LYRICS_STATUS_PATH,
    soundsPath: SUNO_SOUNDS_PATH,
    wavGeneratePath: SUNO_WAV_GENERATE_PATH,
    wavStatusPath: SUNO_WAV_STATUS_PATH,
    vocalRemovalPath: SUNO_VOCAL_REMOVAL_PATH,
    vocalRemovalStatusPath: SUNO_VOCAL_REMOVAL_STATUS_PATH,
    midiGeneratePath: SUNO_MIDI_GENERATE_PATH,
    midiStatusPath: SUNO_MIDI_STATUS_PATH,
    mp4GeneratePath: SUNO_MP4_GENERATE_PATH,
    mp4StatusPath: SUNO_MP4_STATUS_PATH,
    styleBoostPath: SUNO_STYLE_BOOST_PATH,
    musicCoverPath: SUNO_MUSIC_COVER_PATH,
    musicCoverStatusPath: SUNO_MUSIC_COVER_STATUS_PATH,
    replaceSectionPath: SUNO_REPLACE_SECTION_PATH,
    timestampedLyricsPath: SUNO_TIMESTAMPED_LYRICS_PATH,
    creditsPath: SUNO_CREDITS_PATH,
    defaultModel: SUNO_MODEL,
    supportedModels: Object.keys(MODEL_LIMITS),
    addInstrumentalModels: ADD_INSTRUMENTAL_MODELS,
    hasApiKey: Boolean(SUNO_API_KEY),
    hasCallbackUrl: Boolean(SUNO_CALLBACK_URL)
  });
});

app.get('/api/models', (_req, res) => {
  res.json({
    ok: true,
    defaultModel: SUNO_MODEL,
    models: MODEL_LIMITS,
    addInstrumentalModels: ADD_INSTRUMENTAL_MODELS
  });
});

app.post('/api/suno-callback', (req, res) => {
  try {
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
      callbackStore.set(String(taskId), { ...body, _storedAt: Date.now() });
      log('[SUNO CALLBACK STORED]', { taskId, status: extractStatus(body) });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Callback processing failed' });
  }
});

app.post('/api/create-song', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateCreateSongRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const {
      customMode, instrumental, model, title, prompt, lyrics, style,
      personaId, personaModel, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight
    } = validation.values;

    const payload = {
      customMode,
      instrumental,
      model,
      callBackUrl: SUNO_CALLBACK_URL || undefined,
      personaId: personaId || undefined,
      personaModel: personaId ? personaModel : undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight
    };

    if (customMode) {
      if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });
      payload.title = title;
      payload.style = style;
      if (!instrumental) payload.prompt = prompt || lyrics;
    } else {
      payload.prompt = truncate(prompt || lyrics || '', 500);
    }

    const result = await performSunoPost({ path: SUNO_CREATE_PATH, payload: stripEmptyFields(payload), requestId, actionName: 'CREATE SONG' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/extend-song', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateExtendSongRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const {
      defaultParamFlag, instrumental, model, audioId, prompt, style, title, continueAt,
      personaId, personaModel, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight
    } = validation.values;

    if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });

    const payload = stripEmptyFields({
      defaultParamFlag,
      audioId,
      model,
      callBackUrl: SUNO_CALLBACK_URL,
      instrumental,
      prompt: defaultParamFlag ? prompt : undefined,
      style: defaultParamFlag ? style : undefined,
      title: defaultParamFlag ? title : undefined,
      continueAt: defaultParamFlag ? continueAt : undefined,
      personaId: personaId || undefined,
      personaModel: personaId ? personaModel : undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight
    });

    const result = await performSunoPost({ path: SUNO_EXTEND_PATH, payload, requestId, actionName: 'EXTEND SONG' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/upload-cover', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateUploadCoverRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const {
      uploadUrl, customMode, instrumental, model, prompt, style, title,
      personaId, personaModel, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight
    } = validation.values;

    if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });

    const payload = stripEmptyFields({
      uploadUrl,
      customMode,
      instrumental,
      model,
      callBackUrl: SUNO_CALLBACK_URL,
      prompt: customMode ? (!instrumental ? prompt : undefined) : truncate(prompt, 500),
      style: customMode ? style : undefined,
      title: customMode ? title : undefined,
      personaId: personaId || undefined,
      personaModel: personaId ? personaModel : undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight
    });

    const result = await performSunoPost({ path: SUNO_UPLOAD_COVER_PATH, payload, requestId, actionName: 'UPLOAD COVER' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/upload-extend', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateUploadExtendRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const {
      uploadUrl, defaultParamFlag, instrumental, model, prompt, style, title, continueAt,
      personaId, personaModel, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight
    } = validation.values;

    if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });

    const payload = stripEmptyFields({
      uploadUrl,
      defaultParamFlag,
      instrumental,
      model,
      callBackUrl: SUNO_CALLBACK_URL,
      prompt,
      style: defaultParamFlag ? style : undefined,
      title: defaultParamFlag ? title : undefined,
      continueAt: defaultParamFlag ? continueAt : undefined,
      personaId: personaId || undefined,
      personaModel: personaId ? personaModel : undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight
    });

    const result = await performSunoPost({ path: SUNO_UPLOAD_EXTEND_PATH, payload, requestId, actionName: 'UPLOAD EXTEND' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/add-instrumental', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateAddInstrumentalRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const { uploadUrl, title, negativeTags, tags, vocalGender, styleWeight, weirdnessConstraint, audioWeight, model } = validation.values;
    if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });

    const payload = stripEmptyFields({
      uploadUrl,
      title,
      negativeTags,
      tags,
      callBackUrl: SUNO_CALLBACK_URL,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight,
      model
    });

    const result = await performSunoPost({ path: SUNO_ADD_INSTRUMENTAL_PATH, payload, requestId, actionName: 'ADD INSTRUMENTAL' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/remix-song', async (req, res) => {
  const requestId = createRequestId();
  try {
    const validation = validateRemixRequest(req.body || {});
    if (!validation.ok) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: validation.errors });

    const {
      uploadUrl, customMode, instrumental, model, prompt, style, title,
      personaId, personaModel, negativeTags, vocalGender, styleWeight, weirdnessConstraint, audioWeight
    } = validation.values;

    if (!SUNO_CALLBACK_URL) return res.status(500).json({ ok: false, requestId, error: 'Missing SUNO_CALLBACK_URL' });

    const payload = stripEmptyFields({
      uploadUrl,
      customMode,
      instrumental,
      model,
      callBackUrl: SUNO_CALLBACK_URL,
      prompt: customMode ? (!instrumental ? prompt : undefined) : truncate(prompt, 500),
      style: customMode ? style : undefined,
      title: customMode ? title : undefined,
      personaId: personaId || undefined,
      personaModel: personaId ? personaModel : undefined,
      negativeTags: negativeTags || undefined,
      vocalGender: vocalGender || undefined,
      styleWeight,
      weirdnessConstraint,
      audioWeight
    });

    const result = await performSunoPost({ path: SUNO_REMIX_PATH, payload, requestId, actionName: 'REMIX SONG' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

// Advanced endpoints

app.post('/api/add-vocals', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const uploadUrl = validateRequiredString(body, 'uploadUrl', errors);
    const title = validateRequiredString(body, 'title', errors);
    const prompt = validateRequiredString(body, 'prompt', errors);
    const style = validateRequiredString(body, 'style', errors);
    const negativeTags = validateRequiredString(body, 'negativeTags', errors);
    const callBackUrl = resolveCallbackUrl(body);
    if (!isValidUrl(uploadUrl)) errors.push('uploadUrl must be a valid public http or https URL.');
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');

    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({
      ...body,
      uploadUrl,
      title,
      prompt,
      style,
      negativeTags,
      callBackUrl
    });

    const result = await performSunoPost({ path: SUNO_ADD_VOCALS_PATH, payload, requestId, actionName: 'ADD VOCALS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/generate-persona', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    const name = validateRequiredString(body, 'name', errors);
    const description = validateRequiredString(body, 'description', errors);
    const vocalStart = parseNonNegativeNumber(body.vocalStart);
    const vocalEnd = parseNonNegativeNumber(body.vocalEnd);
    if (body.vocalStart !== undefined && vocalStart === undefined) errors.push('vocalStart must be a number greater than or equal to 0.');
    if (body.vocalEnd !== undefined && vocalEnd === undefined) errors.push('vocalEnd must be a number greater than or equal to 0.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, audioId, name, description, vocalStart, vocalEnd });
    const result = await performSunoPost({ path: SUNO_GENERATE_PERSONA_PATH, payload, requestId, actionName: 'GENERATE PERSONA' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/mashup', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const uploadUrlList = Array.isArray(body.uploadUrlList) ? body.uploadUrlList.map(v => cleanString(v)).filter(Boolean) : [];
    if (uploadUrlList.length !== 2) errors.push('uploadUrlList must contain exactly 2 valid audio URLs.');
    uploadUrlList.forEach(url => { if (!isValidUrl(url)) errors.push('Each uploadUrlList item must be a valid public http or https URL.'); });

    const customMode = body.customMode !== undefined ? Boolean(body.customMode) : true;
    const instrumental = body.instrumental !== undefined ? Boolean(body.instrumental) : false;
    const model = cleanString(body.model || SUNO_MODEL);
    const prompt = safeString(body.prompt || '').trim();
    const style = cleanString(body.style || '');
    const title = cleanString(body.title || '');

    if (!MODEL_LIMITS[model]) errors.push(`Unsupported model "${model}". Supported models: ${Object.keys(MODEL_LIMITS).join(', ')}`);
    const limits = getModelLimits(model);
    if (customMode) {
      if (!style) errors.push('style is required when customMode is true.');
      if (!title) errors.push('title is required when customMode is true.');
      if (!instrumental && !prompt) errors.push('prompt is required when customMode is true and instrumental is false.');
      if (style.length > limits.styleMax) errors.push(`style exceeds ${limits.styleMax} characters for model ${model}.`);
      if (title.length > limits.titleMax) errors.push(`title exceeds ${limits.titleMax} characters for model ${model}.`);
      if (!instrumental && prompt.length > limits.promptMax) errors.push(`prompt exceeds ${limits.promptMax} characters for model ${model}.`);
    } else {
      if (!prompt) errors.push('prompt is required when customMode is false.');
      if (prompt.length > 500) errors.push('prompt must be 500 characters or fewer when customMode is false.');
    }

    const callBackUrl = resolveCallbackUrl(body);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, uploadUrlList, customMode, instrumental, model, prompt, style, title, callBackUrl });
    const result = await performSunoPost({ path: SUNO_MASHUP_PATH, payload, requestId, actionName: 'GENERATE MASHUP' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/lyrics', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const prompt = validateRequiredString(body, 'prompt', errors);
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, prompt });
    const result = await performSunoPost({ path: SUNO_LYRICS_PATH, payload, requestId, actionName: 'GENERATE LYRICS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/lyrics-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_LYRICS_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'LYRICS STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/sounds', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const prompt = validateRequiredString(body, 'prompt', errors);
    const callBackUrl = cleanString(body.callBackUrl || '');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, prompt, callBackUrl: callBackUrl || undefined });
    const result = await performSunoPost({ path: SUNO_SOUNDS_PATH, payload, requestId, actionName: 'GENERATE SOUNDS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/wav-generate', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    const callBackUrl = resolveCallbackUrl(body);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, audioId, callBackUrl });
    const result = await performSunoPost({ path: SUNO_WAV_GENERATE_PATH, payload, requestId, actionName: 'WAV GENERATE' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/wav-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_WAV_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'WAV STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/vocal-removal', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    const callBackUrl = resolveCallbackUrl(body);
    const type = cleanString(body.type || 'separate_vocal');
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (!SEPARATION_TYPES.includes(type)) errors.push(`type must be one of: ${SEPARATION_TYPES.join(', ')}`);
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, audioId, type, callBackUrl });
    const result = await performSunoPost({ path: SUNO_VOCAL_REMOVAL_PATH, payload, requestId, actionName: 'VOCAL REMOVAL' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/vocal-removal-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_VOCAL_REMOVAL_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'VOCAL REMOVAL STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/midi-generate', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = cleanString(body.audioId || '');
    const callBackUrl = resolveCallbackUrl(body);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, audioId: audioId || undefined, callBackUrl });
    const result = await performSunoPost({ path: SUNO_MIDI_GENERATE_PATH, payload, requestId, actionName: 'MIDI GENERATE' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/midi-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_MIDI_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'MIDI STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/mp4-generate', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    const callBackUrl = resolveCallbackUrl(body);
    const author = validateOptionalStringMax(body, 'author', 50, errors);
    const domainName = validateOptionalStringMax(body, 'domainName', 50, errors);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, audioId, callBackUrl, author: author || undefined, domainName: domainName || undefined });
    const result = await performSunoPost({ path: SUNO_MP4_GENERATE_PATH, payload, requestId, actionName: 'MP4 GENERATE' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/mp4-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_MP4_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'MP4 STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/style-boost', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const content = validateRequiredString(body, 'content', errors);
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ content });
    const result = await performSunoPost({ path: SUNO_STYLE_BOOST_PATH, payload, requestId, actionName: 'STYLE BOOST' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/music-cover', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const callBackUrl = resolveCallbackUrl(body);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ ...body, taskId, callBackUrl });
    const result = await performSunoPost({ path: SUNO_MUSIC_COVER_PATH, payload, requestId, actionName: 'MUSIC COVER' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/music-cover-status/:id', async (req, res) => {
  const requestId = createRequestId();
  try {
    const id = cleanString(req.params.id || '');
    if (!id) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: ['id is required.'] });
    const result = await performSunoGet({ path: SUNO_MUSIC_COVER_STATUS_PATH, query: { taskId: id }, requestId, actionName: 'MUSIC COVER STATUS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/replace-section', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    const prompt = validateRequiredString(body, 'prompt', errors);
    const callBackUrl = resolveCallbackUrl(body);
    if (!callBackUrl) errors.push('Missing SUNO_CALLBACK_URL or callBackUrl.');
    if (callBackUrl && !isValidUrl(callBackUrl)) errors.push('callBackUrl must be a valid public http or https URL.');

    const startTime = parseNonNegativeNumber(body.startTime ?? body.startSecond);
    const endTime = parseNonNegativeNumber(body.endTime ?? body.endSecond);
    if ((body.startTime !== undefined || body.startSecond !== undefined) && startTime === undefined) errors.push('startTime/startSecond must be a number greater than or equal to 0.');
    if ((body.endTime !== undefined || body.endSecond !== undefined) && endTime === undefined) errors.push('endTime/endSecond must be a number greater than or equal to 0.');

    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({
      ...body,
      taskId,
      audioId,
      prompt,
      callBackUrl,
      startTime: startTime ?? undefined,
      endTime: endTime ?? undefined
    });

    const result = await performSunoPost({ path: SUNO_REPLACE_SECTION_PATH, payload, requestId, actionName: 'REPLACE SECTION' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.post('/api/timestamped-lyrics', async (req, res) => {
  const requestId = createRequestId();
  try {
    const body = req.body || {};
    const errors = [];
    const taskId = validateRequiredString(body, 'taskId', errors);
    const audioId = validateRequiredString(body, 'audioId', errors);
    if (errors.length) return res.status(400).json({ ok: false, requestId, error: 'Validation failed.', details: errors });

    const payload = stripEmptyFields({ taskId, audioId });
    const result = await performSunoPost({ path: SUNO_TIMESTAMPED_LYRICS_PATH, payload, requestId, actionName: 'TIMESTAMPED LYRICS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

app.get('/api/credits', async (_req, res) => {
  const requestId = createRequestId();
  try {
    const result = await performSunoGet({ path: SUNO_CREDITS_PATH, query: {}, requestId, actionName: 'CREDITS' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return handlerError(res, requestId, error);
  }
});

// Original status helpers for music generation task ids
app.get('/api/song-status/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing task id' });

    if (callbackStore.has(id)) {
      const cb = callbackStore.get(id);
      return res.json({
        ok: true,
        source: 'callback-cache',
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
        source: 'suno-api',
        taskId: id,
        status: extractStatus(result.data),
        audioUrl: extractAudioUrl(result.data),
        tracks: extractAudioTracks(result.data),
        upstream: result.data
      });
    }

    return res.status(result.statusCode || 500).json({ ok: false, error: 'Suno status request failed', upstream: result.data });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return res.status(isAbort ? 504 : 500).json({
      ok: false,
      error: isAbort ? `Status request timed out after ${REQUEST_TIMEOUT_MS}ms` : (error.message || 'Unknown server error')
    });
  }
});

app.get('/api/song-tracks/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing task id' });

    if (callbackStore.has(id)) {
      const cb = callbackStore.get(id);
      return res.json({ ok: true, source: 'callback-cache', taskId: id, tracks: extractAudioTracks(cb), upstream: cb });
    }

    const result = await fetchSunoStatusById(id);
    if (result.ok) {
      return res.json({ ok: true, source: 'suno-api', taskId: id, tracks: extractAudioTracks(result.data), upstream: result.data });
    }

    return res.status(result.statusCode || 500).json({ ok: false, error: 'Suno track request failed', upstream: result.data });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return res.status(isAbort ? 504 : 500).json({
      ok: false,
      error: isAbort ? `Track request timed out after ${REQUEST_TIMEOUT_MS}ms` : (error.message || 'Unknown server error')
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found', method: req.method, path: req.originalUrl });
});

app.use((error, _req, res, _next) => {
  console.error('[UNHANDLED ERROR]', error);
  res.status(500).json({ ok: false, error: error?.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Suno backend listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
