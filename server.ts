import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const app = express();
const PORT = 3000;

// Increase payload limits for video/audio base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Lazy Gemini client helper
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Generate SRT for uploaded media (Video / Audio)
app.post("/api/generate-srt", async (req, res) => {
  try {
    const { fileBase64, mimeType, mode = "translate" } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const ai = getGeminiClient();
    const model = "gemini-3.8-flash";

    const prompt = mode === "translate"
      ? `
      Analyze this media (audio or video).
      1. Transcribe the speech.
      2. Translate it into English if it is in another language.
      3. Output the result strictly in SRT (SubRip Subtitle) format with accurate timestamp intervals (e.g. 00:00:01,000 --> 00:00:04,500).
      4. Ensure the timestamps are synchronized with the media.
      5. Do not include any other text, greetings, or explanations, only the raw SRT content.
    `
      : `
      Analyze this media (audio or video).
      1. Transcribe the speech in its original language.
      2. Do NOT translate the speech. Keep it strictly in the original language spoken in the media.
      3. Output the result strictly in SRT (SubRip Subtitle) format with accurate timestamp intervals (e.g. 00:00:01,000 --> 00:00:04,500).
      4. Ensure the timestamps are synchronized with the media.
      5. Do not include any other text, greetings, or explanations, only the raw SRT content.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
    });

    const srtText = response.text || "";
    return res.json({ srt: srtText });
  } catch (error: any) {
    console.error("Error generating SRT:", error);
    return res.status(500).json({ error: error.message || "Failed to generate SRT" });
  }
});

// Detect spoken language in uploaded media file before translation/transcription
app.post("/api/detect-media-language", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const ai = getGeminiClient();
    const model = "gemini-3.8-flash";

    const prompt = `You are an expert computational linguist and audio analysis system.
Analyze the speech in this media file (audio or video) to detect the spoken language before transcription:
1. Determine if recognizable human speech is present.
   - If the media contains only silence, music without singing, sound effects, or background noise:
     Set "hasSpeech": false, "detectedLanguage": null, "snippet": "", "snippetTranslation": "", "summary": "No clear human speech detected."
2. If human speech is detected:
   - Set "hasSpeech": true.
   - Identify the exact primary spoken language. Return:
       - "name": English name of language (e.g. "Spanish", "Japanese", "French", "German", "Hindi", "Mandarin Chinese", "Arabic", "Portuguese", "Italian", "Korean", "Russian", "English", etc.)
       - "code": ISO 639-1 code (e.g. "es", "ja", "fr", "de", "hi", "zh", "ar", "pt", "it", "ko", "ru", "en")
       - "nativeName": Endonym in native script (e.g. "Español", "日本語", "Français", "Deutsch", "हिन्दी", "中文", "العربية", "Português", "Italiano", "한국어", "Русский", "English")
       - "flagEmoji": Representative country or region flag emoji for this language (e.g. "🇪🇸", "🇯🇵", "🇫🇷", "🇩🇪", "🇮🇳", "🇨🇳", "🇸🇦", "🇧🇷", "🇮🇹", "🇰🇷", "🇷🇺", "🇺🇸")
   - "confidence": "high" | "medium" | "low" based on audio clarity and vocal distinctiveness.
   - "snippet": A brief transcription (first 1-2 spoken sentences) in the original language.
   - "snippetTranslation": Natural English translation of the snippet. (If original is already English, match the snippet).
   - "summary": A brief 1-sentence note about the spoken content and dialect/accent if discernible.

Output strictly valid JSON with this exact schema:
{
  "hasSpeech": boolean,
  "detectedLanguage": {
    "name": string,
    "code": string,
    "nativeName": string,
    "flagEmoji": string
  } | null,
  "confidence": "high" | "medium" | "low",
  "snippet": string,
  "snippetTranslation": string,
  "summary": string
}`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    let result;
    try {
      result = JSON.parse(response.text || "{}");
    } catch {
      const clean = (response.text || "").replace(/```json/g, "").replace(/```/g, "").trim();
      result = JSON.parse(clean);
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Error detecting media language:", error);
    return res.status(500).json({ error: error.message || "Failed to detect media language" });
  }
});

// Transcribe live audio segment with Language Detection & Translation
app.post("/api/transcribe-live", async (req, res) => {
  try {
    const { audioBase64, mimeType = "audio/webm", translateToEnglish = true } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64 in request body" });
    }

    const ai = getGeminiClient();
    const model = "gemini-3.8-flash";

    const prompt = `You are an expert multilingual audio transcriber and computational linguist.
Analyze the provided live audio recording:
1. Detect whether recognizable human speech is present.
   - If the audio contains only silence, breathing, microphone static, ambient background noise, or clicks:
     Set "hasSpeech": false, "detectedLanguage": null, "transcript": "", "translation": "".
2. If human speech is detected:
   - Set "hasSpeech": true.
   - "detectedLanguage": Identify the exact spoken language. Return:
       - "name": English name of language (e.g. "Spanish", "French", "Japanese", "Hindi", "German", "Mandarin Chinese", "Arabic", "Portuguese", "Italian", "Korean", "Russian", "English", etc.)
       - "code": ISO 639-1 code (e.g. "es", "fr", "ja", "hi", "de", "zh", "ar", "pt", "it", "ko", "ru", "en")
       - "nativeName": Endonym in native script (e.g. "Español", "Français", "日本語", "हिन्दी", "Deutsch", "中文", "العربية", "Português", "Italiano", "한국어", "Русский", "English")
       - "flagEmoji": Country/region flag emoji for this language (e.g. "🇪🇸", "🇫🇷", "🇯🇵", "🇮🇳", "🇩🇪", "🇨🇳", "🇸🇦", "🇧🇷", "🇮🇹", "🇰🇷", "🇷🇺", "🇺🇸")
   - "transcript": The accurate, word-for-word transcription in the original detected language, with proper punctuation and capital letters.
   - "translation": Natural English translation of the spoken words. If the speech is already in English, repeat the transcription.
   - "confidence": "high" | "medium" | "low" depending on speech clarity.

Output strictly valid JSON with this exact schema:
{
  "hasSpeech": boolean,
  "detectedLanguage": {
    "name": string,
    "code": string,
    "nativeName": string,
    "flagEmoji": string
  } | null,
  "transcript": string,
  "translation": string,
  "confidence": "high" | "medium" | "low"
}`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    let result;
    try {
      result = JSON.parse(response.text || "{}");
    } catch {
      const clean = (response.text || "").replace(/```json/g, "").replace(/```/g, "").trim();
      result = JSON.parse(clean);
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Error transcribing live audio:", error);
    return res.status(500).json({ error: error.message || "Failed to transcribe live audio" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TranSubs Server running on http://localhost:${PORT}`);
  });
}

startServer();
