import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

// ===============================
// 🎵 CREATE SONG (Generate Music)
// ===============================
app.post("/generate-song", async (req, res) => {
  try {
    const {
      prompt,
      style,
      title,
      instrumental = false,
      model = "V4_5ALL"
    } = req.body;

    if (!prompt || !style || !title) {
      return res.status(400).json({
        error: "Missing required fields: prompt, style, title"
      });
    }

    const response = await fetch(`${SUNO_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUNO_API_KEY}`
      },
      body: JSON.stringify({
        customMode: true,
        instrumental,
        model,
        callBackUrl: "", // optional (we will poll instead)
        prompt,   // used as lyrics in custom mode
        style,
        title
      })
    });

    const data = await response.json();

    console.log("Suno Generate Response:", data);

    // 🚨 FIX: Handle missing taskId issue
    if (!data || data.code !== 200) {
      return res.status(500).json({
        error: "Suno API error",
        details: data
      });
    }

    // Suno usually returns taskId inside data.data
    const taskId = data?.data?.taskId || data?.taskId;

    if (!taskId) {
      return res.status(500).json({
        error: "No task ID returned",
        raw: data
      });
    }

    res.json({
      success: true,
      taskId
    });

  } catch (err) {
    console.error("Generate Song Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// =======================================
// 🔎 GET SONG TRACKS / STATUS (Polling)
// =======================================
app.get("/song-tracks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: "Task ID required" });
    }

    // Suno polling endpoint (IMPORTANT)
    const response = await fetch(`${SUNO_BASE_URL}/music/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${SUNO_API_KEY}`
      }
    });

    const data = await response.json();

    console.log("Track Status:", data);

    if (!data || data.code !== 200) {
      return res.status(500).json({
        error: "Failed to fetch track",
        details: data
      });
    }

    const tracks = data?.data?.tracks || [];

    // Extract clean track info
    const formattedTracks = tracks.map(track => ({
      id: track.id,
      title: track.title,
      audioUrl: track.audioUrl,
      streamUrl: track.streamUrl,
      duration: track.duration,
      status: track.status
    }));

    res.json({
      success: true,
      status: data?.data?.status, // text / first / complete
      tracks: formattedTracks
    });

  } catch (err) {
    console.error("Track Fetch Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// ===============================
// 🧪 HEALTH CHECK	
// ===============================
app.get("/", (req, res) => {
  res.send("Suno AI backend running 🚀");
});


// ===============================
// 🚀 START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
