import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export type ProcessMode = 'translate' | 'transcribe';

export async function generateSRT(fileBase64: string, mimeType: string, mode: ProcessMode = 'translate') {
  const model = "gemini-3-flash-preview";
  
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

  const response = await ai.models.generateContent({
    model: model,
    contents: { parts: [mediaPart, { text: prompt }] },
  });

  return response.text;
}
