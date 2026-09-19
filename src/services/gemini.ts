import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export type ProcessMode = 'translate' | 'transcribe';

export async function generateSRT(fileBase64: string, mimeType: string, mode: ProcessMode = 'translate') {
  const model = "gemini-3.8-flash";
  
  const prompt = mode === 'translate' 
    ? `
    Analyze this media (audio or video). 
    1. Transcribe the speech.
    2. Translate it into English if it's in another language.
    3. Output the result strictly in SRT (SubRip Subtitle) format.
    4. Ensure the timestamps are accurate and synchronized with the media.
    5. Do not include any other text or explanation, only the SRT content.
  `
    : `
    Analyze this media (audio or video). 
    1. Transcribe the speech in its original language.
    2. Do NOT translate the speech. Keep it in the original language spoken in the media.
    3. Output the result strictly in SRT (SubRip Subtitle) format.
    4. Ensure the timestamps are accurate and synchronized with the media.
    5. Do not include any other text or explanation, only the SRT content.
  `;

  const mediaPart = {
    inlineData: {
      data: fileBase64,
      mimeType: mimeType,
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [mediaPart, { text: prompt }] },
    });
    return response.text;
  } catch (err) {
    // Fallback to gemini-3-flash-preview if alias differs
    const fallbackResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [mediaPart, { text: prompt }] },
    });
    return fallbackResponse.text;
  }
}

export async function generateSpeakerDiarization(fileBase64: string, mimeType: string): Promise<string> {
  const instruction = `You are an advanced audio transcription and speaker diarization engine. Process the provided media input to detect, separate, and label distinct speakers (e.g., Speaker 1, Speaker 2) while generating synchronized subtitles with accurate start and end timestamps.

Output the result strictly as a JSON array matching this structure:
[
  {
    "speaker": "Speaker 1",
    "start": "00:00:01,200",
    "end": "00:00:04,500",
    "text": "Spoken dialogue text here."
  }
]
Do not wrap the JSON in markdown code blocks or conversational text`;

  const mediaPart = {
    inlineData: {
      data: fileBase64,
      mimeType: mimeType,
    },
  };

  let responseText = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [mediaPart, { text: instruction }],
      },
      config: {
        systemInstruction: instruction,
        responseMimeType: "application/json",
      },
    });
    responseText = response.text || "";
  } catch (err) {
    // Fallback attempt
    const fallbackResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [mediaPart, { text: instruction }],
      },
      config: {
        systemInstruction: instruction,
        responseMimeType: "application/json",
      },
    });
    responseText = fallbackResponse.text || "";
  }

  let text = responseText.trim();
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return text;
}
