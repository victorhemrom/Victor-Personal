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

// Multi-tier model fallback for resilient audio transcription & processing
const AUDIO_SUPPORTED_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

interface GenerateWithFallbackOptions {
  contents: any;
  config?: any;
  models?: string[];
  maxRetriesPerModel?: number;
}

async function generateContentWithRetryAndFallback(options: GenerateWithFallbackOptions) {
  const ai = getGeminiClient();
  const modelsToTry = options.models && options.models.length > 0 ? options.models : AUDIO_SUPPORTED_MODELS;
  const maxRetries = options.maxRetriesPerModel ?? 1;

  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          ...(options.config ? { config: options.config } : {}),
        });
        return { response, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const errMessage = String(err?.message || "");
        const errStatus = err?.status || err?.code || err?.error?.code || (err?.response && err.response.status);
        const isDemandOrRateLimit =
          errStatus === 503 ||
          errStatus === 429 ||
          errStatus === "UNAVAILABLE" ||
          errMessage.includes("503") ||
          errMessage.includes("high demand") ||
          errMessage.includes("UNAVAILABLE") ||
          errMessage.includes("RESOURCE_EXHAUSTED") ||
          errMessage.includes("rate limit");

        console.warn(`[Gemini] ${model} attempt ${attempt + 1}/${maxRetries + 1} failed: ${errMessage}`);

        if (isDemandOrRateLimit) {
          if (attempt < maxRetries) {
            // Jittered backoff before retrying same model
            const delayMs = 400 + Math.random() * 400;
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          // Exhausted retries for this model, fallback to next model in list
          console.warn(`[Gemini] Model ${model} under high demand; failing over to next model...`);
          break;
        } else {
          // If error is not a transient capacity/rate issue, rethrow or try next model if 5xx
          if (errStatus && typeof errStatus === "number" && errStatus >= 500) {
            break; // try next model
          }
          throw err;
        }
      }
    }
  }

  throw lastError || new Error("AI transcription service is currently experiencing high demand. Please retry shortly.");
}

function parseJsonFromText(text: string): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    return JSON.parse(clean);
  }
}

function parseJsonArrayFromText(text: string): any[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        const parsed = JSON.parse(clean.slice(firstBracket, lastBracket + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {}
    }
    return [];
  }
}

function formatTimestamp(timeStr: string): string {
  if (!timeStr) return "00:00:00,000";
  let clean = timeStr.trim().replace('.', ',');
  if (/^\d{2}:\d{2}:\d{2},\d{3}$/.test(clean)) return clean;
  if (/^\d{2}:\d{2},\d{3}$/.test(clean)) return `00:${clean}`;
  const sec = parseFloat(clean);
  if (!isNaN(sec)) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
  return clean;
}

function segmentsToSRT(segments: any[]): string {
  if (!segments || segments.length === 0) return "";
  return segments
    .filter(seg => seg && (seg.text || seg.speaker))
    .map((seg, idx) => {
      const start = formatTimestamp(seg.start || "00:00:00,000");
      const end = formatTimestamp(seg.end || "00:00:03,000");
      const speakerPrefix = seg.speaker ? `[${seg.speaker}]: ` : "";
      const text = seg.text ? String(seg.text).trim() : "";
      return `${idx + 1}\n${start} --> ${end}\n${speakerPrefix}${text}\n`;
    })
    .join("\n");
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Speaker Diarization Endpoint - outputs strict JSON array
app.post("/api/diarize", async (req, res) => {
  try {
    const { fileBase64, mimeType, mode = "original" } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const prompt = `You are an advanced audio transcription and speaker diarization engine. Process the provided media input to detect, separate, and label distinct speakers (e.g., Speaker 1, Speaker 2) while generating synchronized subtitles with accurate start and end timestamps.${mode === 'translate' ? ' Translate the dialogue to English if spoken in another language.' : ' Keep the dialogue strictly in the original spoken language.'}

Output the result strictly as a JSON array matching this structure:
[
  {
    "speaker": "Speaker 1",
    "start": "00:00:01,200",
    "end": "00:00:04,500",
    "text": "Spoken dialogue text here."
  }
]
Do not wrap the JSON in markdown code blocks or conversational text.`;

    const { response } = await generateContentWithRetryAndFallback({
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

    const segments = parseJsonArrayFromText(response.text || "[]");
    return res.json(segments);
  } catch (error: any) {
    console.error("Error in speaker diarization:", error);
    return res.status(500).json({ error: error.message || "Failed speaker diarization" });
  }
});

// Generate SRT with integrated Speaker Diarization for uploaded media (Video / Audio)
app.post("/api/generate-srt", async (req, res) => {
  try {
    const { fileBase64, mimeType, mode = "translate" } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType" });
    }

    const prompt = `You are an advanced audio transcription and speaker diarization engine. Process the provided media input to detect, separate, and label distinct speakers (e.g., Speaker 1, Speaker 2) while generating synchronized subtitles with accurate start and end timestamps.${mode === 'translate' ? ' Translate the dialogue to English if spoken in another language.' : ' Keep the dialogue strictly in the original spoken language.'}

Output the result strictly as a JSON array matching this structure:
[
  {
    "speaker": "Speaker 1",
    "start": "00:00:01,200",
    "end": "00:00:04,500",
    "text": "Spoken dialogue text here."
  }
]
Do not wrap the JSON in markdown code blocks or conversational text.`;

    const { response } = await generateContentWithRetryAndFallback({
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

    const segments = parseJsonArrayFromText(response.text || "[]");
    const srtText = segmentsToSRT(segments);
    return res.json({ srt: srtText, diarization: segments });
  } catch (error: any) {
    console.error("Error generating SRT:", error);
    return res.status(500).json({ error: error.message || "Failed to generate SRT" });
  }
});

// Transcribe live audio segment with Language Detection & Translation
app.post("/api/transcribe-live", async (req, res) => {
  try {
    const { audioBase64, mimeType = "audio/webm", translateToEnglish = true } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64 in request body" });
    }

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

    const { response } = await generateContentWithRetryAndFallback({
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

    const result = parseJsonFromText(response.text || "{}");
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
