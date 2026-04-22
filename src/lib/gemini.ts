import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Utility to sleep to avoid hitting API rate limits
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new Error("Cancelado"));
  
  const timeout = setTimeout(() => {
    resolve();
  }, ms);
  
  if (signal) {
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Cancelado"));
    }, { once: true });
  }
});

// Utility to safely split huge texts without cutting sentences (if possible)
export function splitTextIntoChunks(text: string, maxLength = 1500): string[] {
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    let splitIndex = maxLength;
    // Try to find a natural break point backwards from maxLength
    const naturalBreaks = ['\n\n', '\n', '. ', '? ', '! ', ', ', ' '];
    let found = false;
    
    for (const sep of naturalBreaks) {
      const lastIndex = remaining.lastIndexOf(sep, maxLength);
      if (lastIndex > 0) {
        splitIndex = lastIndex + sep.length;
        found = true;
        break;
      }
    }
    
    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  
  return chunks.filter(c => c.length > 0);
}

// Enhance the expressiveness of the input text by chunks
export async function enhanceTextExpressivenessChunked(
  text: string, 
  languageCode: string,
  onProgress: (current: number, total: number, message?: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // Use a larger chunk size for LLM text processing
  const chunks = splitTextIntoChunks(text, 3000);
  let enhancedFullText = "";

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Cancelado");
    
    onProgress(i, chunks.length, `Mejorando fragmento ${i + 1} de ${chunks.length}...`);
    
    const chunkText = chunks[i];
    const prompt = `You are a professional voice acting director. Your task is to rewrite the given text to include explicit emotion directions for a text-to-speech engine.
Keep the text in its original language (${languageCode}), but the emotion tags or directions MUST be in English adverbs/phrases (e.g., "Say cheerfully:", "Whisper:", "Angrily:").
Do NOT change the core meaning of the text, only add the emotional stage directions where appropriate at the beginning or before sentences.
Return ONLY the enhanced text, nothing else.

Input text: ${chunkText}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
          temperature: 0.7,
      }
    });

    enhancedFullText += (response.text?.trim() || chunkText) + "\n\n";
    onProgress(i + 1, chunks.length, `Fragmento ${i + 1} mejorado.`);
    
    // Rate Limit Protection: 8 seconds delay between calls, but not after the last chunk
    if (i < chunks.length - 1) {
      onProgress(i + 1, chunks.length, `Pausa de seguridad gratuita (8s)...`);
      await delay(8000, signal);
    }
  }

  return enhancedFullText.trim();
}

// Generate TTS from the enhanced text by chunks
export async function generateTTSChunked(
  enhancedText: string, 
  voiceName: string,
  onProgress: (current: number, total: number, message?: string) => void,
  signal?: AbortSignal
): Promise<string[]> {
  const chunks = splitTextIntoChunks(enhancedText, 1500); // chunk size safe for TTS API
  const audioChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error("Cancelado");
    
    onProgress(i, chunks.length, `Sintetizando audio ${i + 1} de ${chunks.length}...`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: chunks[i] }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        audioChunks.push(base64Audio);
    }
    
    onProgress(i + 1, chunks.length, `Audio ${i + 1} completado.`);
    
    // Rate Limit Protection: 8 seconds delay between calls, but not after the last chunk
    if (i < chunks.length - 1) {
      onProgress(i + 1, chunks.length, `Pausa de seguridad gratuita (8s)...`);
      await delay(8000, signal);
    }
  }

  if (audioChunks.length === 0) {
    throw new Error("No audio data returned from the model.");
  }
  
  return audioChunks;
}
