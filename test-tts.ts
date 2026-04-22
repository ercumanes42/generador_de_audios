import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "fs";

async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: 'Hola mundo' }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts?.[0];
  console.log(parts?.inlineData?.mimeType);
  fs.writeFileSync('output.txt', parts?.inlineData?.data?.substring(0, 50) || '');
}

test().catch(console.error);
