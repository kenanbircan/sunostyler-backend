const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const PORT = process.env.PORT || 3000;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

// Render should use Node 18+ or 20+ so global fetch is available.
if (typeof fetch !== "function") {
  throw new Error("Global fetch is not available. Use Node 18+ or newer.");
}

if (!SUNO_API_KEY) {
  console.warn("WARNING: SUNO_API_KEY is not set. Suno requests will fail until it is added.");
}

function normalizeGenerateTaskId(payload) {
  return (
    payload?.data?.taskId ||
    payload?.data?.id ||
    payload?.taskId ||
    payload?.id ||
    null
  );
}

function normalizeTrackList(payload) {
  const data = payload?.data || {};
  const rawTracks =
    data?.tracks ||
    data?.items ||
    data?.songs ||
    [];

  return rawTracks.map((track, index) => ({
    id: track?.id || track?.audioId || `track_${index + 1}`,
    title: track?.title || track?.name || `Track ${index + 1}`,
    audioUrl:
      track?.audioUrl ||
      track?.audio_url ||
      track?.songUrl ||
      track?.song_url ||
      null,
    streamUrl:
      track?.streamUrl ||
      track?.stream_url ||
      track?.playUrl ||
      track?.play_url ||
      null,
    imageUrl:
      track?.imageUrl ||
      track?.image_url ||
      null,
    duration: track?.duration || null,
    status: track?.status || data?.status || payload?.status || null,
    raw: track
  }));
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return { rawText: text };
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Suno backend is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    node: process.version,
    hasApiKey: Boolean(SUNO_API_KEY)
  });
});

app.post("/generate-song", async (req, res) => {
  try {
    const {
      prompt = "",
      style = "",
      title = "",
      instrumental = false,
      model = "V4_5ALL",
      negativeTags,
      vocalGender,
      styleWeight,
      weirdnessConstraint,
      audioWeight,
      personaId,
      personaModel,
      callBackUrl
    } = req.body || {};

    // Suno custom mode requirements:
    // - customMode true
    // - if instrumental true => style and title required
    // - if instrumental false => style, prompt, and title required
    // The docs also show callBackUrl as required in the schema. :contentReference[oaicite:0]{index=0}
    if (!style || !title || (!instrumental && !prompt)) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields for custom mode. Required: style, title, and prompt unless instrumental is true."
      });
    }

    const requestBody = {
      customMode: true,
      instrumental: Boolean(instrumental),
      model,
      callBackUrl: callBackUrl || "https://example.com/suno-callback",
      prompt,
      style,
      title
    };

    if (negativeTags) requestBody.negativeTags = negativeTags;
    if (vocalGender) requestBody.vocalGender = vocalGender;
    if (typeof styleWeight === "number") requestBody.styleWeight = styleWeight;
    if (typeof weirdnessConstraint === "number") {
      requestBody.weirdnessConstraint = weirdnessConstraint;
    }
    if (typeof audioWeight === "number") requestBody.audioWeight = audioWeight;
    if (personaId) requestBody.personaId = personaId;
    if (personaModel) requestBody.personaModel = personaModel;

    const response = await fetch(`${SUNO_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUNO_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await safeJson(response);
    const taskId = normalizeGenerateTaskId(data);

    if (!response.ok || data?.code !== 200 || !taskId) {
      return res.status(502).json({
        success: false,
        error: "Suno generate request failed",
        httpStatus: response.status,
        suno: data
      });
    }

    return res.json({
      success: true,
      taskId,
      suno: data
    });
  } catch (error) {
    console.error("generate-song error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/song-tracks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: "taskId is required"
      });
    }

    // Polling fits Suno's staged generation flow.
    // The doc says stream URL is usually ready in 30–40 seconds and downloadable URL in 2–3 minutes. :contentReference[oaicite:1]{index=1}
    const response = await fetch(
      `${SUNO_BASE_URL}/music/${encodeURIComponent(taskId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SUNO_API_KEY}`
        }
      }
    );

    const data = await safeJson(response);
    const tracks = normalizeTrackList(data);
    const status = data?.data?.status || data?.status || null;

    if (!response.ok || data?.code !== 200) {
      return res.status(502).json({
        success: false,
        error: "Suno track lookup failed",
        httpStatus: response.status,
        suno: data
      });
    }

    return res.json({
      success: true,
      taskId,
      status,
      tracks,
      suno: data
    });
  } catch (error) {
    console.error("song-tracks error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
