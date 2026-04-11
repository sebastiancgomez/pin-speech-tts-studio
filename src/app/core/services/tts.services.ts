// Los servicios en Angular son equivalentes a los "Services" o "Repositories" en .NET
// Se registran como singletons (por defecto) igual que AddSingleton<> en DI de .NET
// La anotación @Injectable() es como [Service] o [ApiController] — declara que puede ser inyectado

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
// Observable es el equivalente a Task<T> en C# / async-await
// RxJS (la librería de Observables) es como usar System.Reactive en .NET
import { Observable, from, throwError, of, firstValueFrom} from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { VoiceTTS, ChunkAudio  } from '../../shared/models/tts.models'; // ajusta el path según tu estructura


@Injectable({
  providedIn: 'root' // Equivalente a AddSingleton<TtsService>() en Program.cs
})
export class TtsService {

// Ahora apunta a nuestro proxy local en vez de TikTok directamente
 private readonly TIKTOK_URL = 'http://localhost:3000/api/tts/tiktok';

  // Google TTS es público y no requiere proxy en producción
  // En desarrollo, el browser bloquea CORS — usamos el audio element directamente
  private readonly GOOGLE_BASE = 'https://translate.google.com/translate_tts';

  // HttpClient se inyecta automáticamente por el sistema DI de Angular
  // Equivale a recibir IHttpClientFactory en el constructor en C#
  constructor(private http: HttpClient) {}

  // ─── Voces disponibles ───────────────────────────────────────────────────────

  // Método puro que retorna datos estáticos — no necesita ser async
  // En C# sería: public List<VozTTS> ObtenerVocesTiktok()
  // Ahora retorna Observable — las voces vienen del servidor
// Equivalente a: Task<List<VozTTS>> ObtenerVoces() en C#
  getTiktokVoices(): Observable<VoiceTTS[]> {
    return this.http.get<{ voices: any[] }>('http://localhost:3000/api/tts/tiktok/voices').pipe(
      map(response => response.voices.map(v => ({
        id: v.id,
        name: v.name,
        language: v.language,
        service: 'tiktok' as const,
        preview: 'Hello, this is a voice preview.'
      }))),
      catchError(error => {
        console.error('Error obteniendo voces:', error);
        return throwError(() => new Error('No se pudo obtener la lista de voces'));
      })
    );
  }

  getGoogleVoices(): Observable<VoiceTTS[]> {
    return this.http.get<{ voices: any[] }>('http://localhost:3000/api/tts/google/voices').pipe(
      map(response => response.voices.map(v => ({
        id: v.id,
        name: v.name,
        service: 'google' as const,
        language: v.language,
        preview: 'Hola, esta es una prueba de voz.'
      }))),
      catchError(error => {
        console.error('Error obteniendo voces Google:', error);
        return throwError(() => new Error('No se pudo obtener voces de Google'));
      })
    );
  }

  // ─── Chunking (dividir texto largo) ──────────────────────────────────────────
  // Equivalente a un método utilitario estático en C#: StringHelper.SplitIntoChunks()
  // El límite de TikTok es ~300 chars, Google ~180

  divideIntoChunks(text: string, limit: number): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let actualChunk = '';

    for (const word of words) {
      // Si la palabra sola supera el límite, la cortamos letra a letra
      if (word.length > limit) {
        if (actualChunk) chunks.push(actualChunk.trim());
        actualChunk = '';
        // Regex para dividir en segmentos de `limite` chars
        const pedazos = word.match(new RegExp(`.{1,${limit}}`, 'g')) || [];
        chunks.push(...pedazos);
      } else if ((actualChunk + ' ' + word).trim().length <= limit) {
        actualChunk += (actualChunk ? ' ' : '') + word;
      } else {
        chunks.push(actualChunk.trim());
        actualChunk = word;
      }
    }

    if (actualChunk) chunks.push(actualChunk.trim());
    return chunks.filter(c => c.length > 0);
  }

  // ─── TikTok TTS ──────────────────────────────────────────────────────────────
  // Retorna Observable<string> donde string es un data URL base64
  // Observable<T> ≈ Task<T> en C#, pero con capacidad reactiva (RxJS)

  // Ahora retorna ChunkAudio con base64 Y blobUrl separados
// así podemos reproducir Y exportar sin depender del blobUrl (que se revoca)
  generateTiktokAudio(text: string, voiceId: string): Observable<ChunkAudio> {
    return this.http.post<{success: boolean, data: string, error: string | null}>(
      this.TIKTOK_URL,
      { text: text, voice: voiceId },
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }
    ).pipe(
      map((response): ChunkAudio => {
        if (!response?.data) throw new Error('Sin data en respuesta');

        const base64 = response.data;

        // Creamos el BlobUrl para reproducción
        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);

        return { base64, blobUrl };
      }),
      catchError(error => throwError(() => new Error(`HTTP ${error.status}: ${error.message}`)))
    );
  }

  // Genera TODOS los chunks de TikTok y retorna array de data URLs
  // En C#: Task<List<string>> GenerarTodosLosChunks(...)
  async generateAllTiktok(text: string, voiceId: string): Promise<string[]> {
    const chunks = this.divideIntoChunks(text, 300);
    const dataUrls: string[] = [];

    // Procesamos secuencialmente para no saturar el API
    // Equivalente a foreach con await en C#
    for (const chunk of chunks) {
      const url = await this.http.post<{ data: string }>(
        this.TIKTOK_URL,
        { text: chunk, voice: voiceId },
        { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }
      ).pipe(
        map(r => r.data ? `data:audio/mp3;base64,${r.data}` : null),
        catchError(() => of(null))
      ).toPromise(); // convierte Observable a Promise (como .Result en C# pero async)

      if (url) dataUrls.push(url);
    }

    return dataUrls;
  }

  // ─── Google TTS ──────────────────────────────────────────────────────────────
  // Google TTS devuelve audio directo (no JSON), usamos una URL que el <audio> carga directamente
  // No podemos hacer fetch() por CORS, pero el elemento <audio> sí puede cargar cross-origin

  buildGoogleUrl(text: string, language: string): string {
  const encodedText = encodeURIComponent(text);
    return `${this.GOOGLE_BASE}?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input` +
           `&textlen=${encodedText.length}&q=${encodedText}&tl=${language}&ttsspeed=1`;
  }

  private readonly GOOGLE_URL = 'http://localhost:3000/api/tts/google';

  getGoogleUrls(text: string, language: string): string[] {
    const chunks = this.divideIntoChunks(text, 180);
    // Ahora apunta a nuestro proxy en vez de Google directamente
    return chunks.map(chunk =>
      `${this.GOOGLE_URL}?text=${encodeURIComponent(chunk)}&lang=${language}`
    );
  }

  generateGoogleAudio(text: string, language: string): Observable<ChunkAudio> {
    const url = `${this.GOOGLE_URL}?text=${encodeURIComponent(text)}&lang=${language}`;
    
    // responseType: 'blob' le dice a HttpClient que espere binario, no JSON
    // Equivalente a: response.Content.ReadAsByteArrayAsync() en C#
    return this.http.get(url, { responseType: 'blob' }).pipe(
      map((blob): ChunkAudio => {
        const blobUrl = URL.createObjectURL(blob);
        
        // Para exportar necesitamos el base64 — convertimos el blob
        // Guardamos la promesa como string vacío por ahora y lo resolvemos async
        return { base64: '', blobUrl, blob };
      }),
      catchError(error => throwError(() => new Error(`Google TTS error: ${error.message}`)))
    );
  }

  async mergeAndDownloadAudio(chunks: ChunkAudio[], fileName: string): Promise<void> {
    const audioContext = new AudioContext();
    const buffers: AudioBuffer[] = [];

    for (const chunk of chunks) {
      let arrayBuffer: ArrayBuffer;

      if (chunk.base64) {
        // TikTok: tenemos base64
        const byteCharacters = atob(chunk.base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        arrayBuffer = byteArray.buffer;
      } else if (chunk.blob) {
        // Google: tenemos Blob directamente
        arrayBuffer = await chunk.blob.arrayBuffer();
      } else {
        continue;
      }

      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        buffers.push(audioBuffer);
      } catch (e) {
        console.warn('Error decodificando chunk, saltando:', e);
      }
    }

    if (buffers.length === 0) throw new Error('No hay audio para exportar');

    const fullLength = buffers.reduce((acc, buf) => acc + buf.duration, 0);
    const sampleRate = buffers[0].sampleRate;
    const channels = buffers[0].numberOfChannels;
    const mergedBuffer = audioContext.createBuffer(
      channels,
      Math.ceil(fullLength * sampleRate),
      sampleRate
    );

    let actualOffset = 0;
    for (const buffer of buffers) {
      for (let channel = 0; channel < channels; channel++) {
        mergedBuffer.getChannelData(channel).set(
          buffer.getChannelData(channel), actualOffset
        );
      }
      actualOffset += buffer.length;
    }

    const wavBlob = this.audioBufferToWav(mergedBuffer);
    this.downloadBlob(wavBlob, fileName + '.wav');
  }

  // Convierte AudioBuffer a WAV Blob (formato PCM estándar)
  private audioBufferToWav(buffer: AudioBuffer): Blob {
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
    view.setUint16(20, 1, true);           // PCM
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);          // 16-bit
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Datos de audio (interleaved)
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private downloadBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }
}