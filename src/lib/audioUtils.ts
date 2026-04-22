function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function getRawPcmFromBase64(base64: string): Uint8Array {
  const rawDecoded = atob(base64);
  const rawBytes = new Uint8Array(rawDecoded.length);
  for (let i = 0; i < rawDecoded.length; i++) {
    rawBytes[i] = rawDecoded.charCodeAt(i);
  }
  // Strip standard WAV header if present (44 bytes) to get only PCM data
  if (rawBytes.length >= 44 && String.fromCharCode(...rawBytes.slice(0, 4)) === 'RIFF') {
    return rawBytes.slice(44); 
  }
  return rawBytes;
}

export function concatGeminiAudioChunks(base64Chunks: string[], sampleRate: number = 24000): Blob {
  const rawBuffers = base64Chunks.map(getRawPcmFromBase64);
  const totalLen = rawBuffers.reduce((sum, buf) => sum + buf.length, 0);

  const wavBytes = new Uint8Array(44 + totalLen);
  const view = new DataView(wavBytes.buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLen, true);
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits per sample

  writeString(view, 36, 'data');
  view.setUint32(40, totalLen, true);
  
  let offset = 44;
  for (const buf of rawBuffers) {
    wavBytes.set(buf, offset);
    offset += buf.length;
  }

  return new Blob([wavBytes], { type: 'audio/wav' });
}

export function decodeGeminiAudio(base64: string, sampleRate: number = 24000): Blob {
  return concatGeminiAudioChunks([base64], sampleRate);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
