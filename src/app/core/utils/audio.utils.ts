import { ChunkAudio } from '../../shared/models/tts.models';

// lamejs se carga como variable global desde index.html
declare const lamejs: any;

/*export function audioBufferToMp3(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitRate = 128;

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitRate);
  const mp3Chunks: ArrayBuffer[] = [];

  const toInt16 = (float32Array: Float32Array): Int16Array => {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  };

  const BLOCK_SIZE = 1152;
  const leftChannel = toInt16(buffer.getChannelData(0));
  const rightChannel = numChannels > 1 ? toInt16(buffer.getChannelData(1)) : leftChannel;

  for (let i = 0; i < leftChannel.length; i += BLOCK_SIZE) {
    const leftBlock = leftChannel.subarray(i, i + BLOCK_SIZE);
    const rightBlock = rightChannel.subarray(i, i + BLOCK_SIZE);
    const encoded = mp3Encoder.encodeBuffer(leftBlock, rightBlock);
    if (encoded.length > 0) {
      const copy = new ArrayBuffer(encoded.length);
      new Int8Array(copy).set(encoded);
      mp3Chunks.push(copy);
    }
  }

  const flushed = mp3Encoder.flush();
  if (flushed.length > 0) {
    const copy = new ArrayBuffer(flushed.length);
    new Int8Array(copy).set(flushed);
    mp3Chunks.push(copy);
  }

  return new Blob(mp3Chunks, { type: 'audio/mp3' });
}*/

/*export function downloadMp3(buffer: AudioBuffer, fileName: string): void {
  const mp3Blob = audioBufferToMp3(buffer);
  downloadBlob(mp3Blob, fileName + '.mp3');
}*/

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numberOfChannels * 2; // 2 bytes por sample (16-bit)
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  // Cabecera WAV (RIFF)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Datos de audio (interleaved)
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
export function base64ToBlob(base64: string, mimeType: string = 'audio/mpeg'): Blob {
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mimeType });
}

export async function mergeBuffersInBackground(
  chunks: ChunkAudio[],
  audioContext?: AudioContext,
): Promise<AudioBuffer> {
  const ctx = audioContext ?? new AudioContext();
  const validChunks = chunks.filter((c) => c && (c.base64 || c.blob));

  if (validChunks.length === 0) throw new Error('No valid chunks to export');

  const buffers: AudioBuffer[] = [];

  for (const chunk of validChunks) {
    let arrayBuffer: ArrayBuffer;

    if (chunk.base64) {
      const byteCharacters = atob(chunk.base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      arrayBuffer = byteArray.buffer;
    } else if (chunk.blob) {
      arrayBuffer = await chunk.blob.arrayBuffer();
    } else {
      continue;
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      buffers.push(audioBuffer);
    } catch (e) {
      console.warn('Error decoding chunk, skipping:', e);
    }
  }

  if (buffers.length === 0) throw new Error('No audio to export after decoding');

  const fullLength = buffers.reduce((acc, buf) => acc + buf.duration, 0);
  const sampleRate = buffers[0].sampleRate;
  const channels = buffers[0].numberOfChannels;
  const mergedBuffer = ctx.createBuffer(channels, Math.ceil(fullLength * sampleRate), sampleRate);

  let actualOffset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < channels; channel++) {
      mergedBuffer.getChannelData(channel).set(buffer.getChannelData(channel), actualOffset);
    }
    actualOffset += buffer.length;
  }

  return mergedBuffer;
}

// mergeAndDownloadAudio ahora es solo un wrapper — delega todo a mergeBuffersInBackground
export async function mergeAndDownloadAudio(
  chunks: ChunkAudio[],
  fileName: string,
  audioContext?: AudioContext,
): Promise<void> {
  const buffer = await mergeBuffersInBackground(chunks, audioContext);
  const wavBlob = audioBufferToWav(buffer);
  downloadBlob(wavBlob, fileName + '.wav');
}

export function downloadWav(buffer: AudioBuffer, fileName: string): void {
  const wavBlob = audioBufferToWav(buffer);
  downloadBlob(wavBlob, fileName + '.wav');
}

export function downloadMp3Chunks(chunks: ChunkAudio[], fileName: string): void {
  const validChunks = chunks.filter(c => c && c.base64);
  
  if (validChunks.length === 0) throw new Error('No valid chunks to export');

  // Concatenamos los binarios directamente — cada chunk ya es un MP3 válido
  // MP3 es una secuencia de frames independientes, se pueden concatenar sin recodificar
  // Equivalente a: File.WriteAllBytes combinando múltiples byte[] en C#
  const blobParts = validChunks.map(chunk => base64ToBlob(chunk.base64));
  const finalBlob = new Blob(blobParts, { type: 'audio/mp3' });
  downloadBlob(finalBlob, fileName + '.mp3');
}