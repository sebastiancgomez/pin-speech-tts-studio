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
import { audioBufferToWav, downloadBlob, base64ToBlob, mergeBuffersInBackground, mergeAndDownloadAudio, downloadWav } from '../utils/audio.utils';


@Injectable({
  providedIn: 'root' // Equivalente a AddSingleton<TtsService>() en Program.cs
})
export class TtsService {

// Ahora apunta a nuestro proxy local en vez de TikTok directamente
 private readonly TIKTOK_URL = '/api/tts/tiktok';

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
    return this.http.get<{ voices: any[] }>('/api/tts/tiktok/voices').pipe(
      map(response => response.voices.map(v => ({
        id: v.id,
        name: v.name,
        language: v.language,
        service: 'tiktok' as const,
        preview: 'Hello, this is a voice preview.'
      }))),
      catchError(error => {
        console.error('Error loading TikTok voices:', error);
        return throwError(() => new Error('The TikTok voice list could not be loaded'));
      })
    );
  }

  getGoogleVoices(): Observable<VoiceTTS[]> {
    return this.http.get<{ voices: any[] }>('/api/tts/google/voices').pipe(
      map(response => response.voices.map(v => ({
        id: v.id,
        name: v.name,
        service: 'google' as const,
        language: v.language,
        preview: 'Hola, esta es una prueba de voz.'
      }))),
      catchError(error => {
        console.error('Error loading Google voices:', error);
        return throwError(() => new Error('The Google voice list could not be loaded'));
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
        if (!response?.data) throw new Error('No audio data received from TikTok TTS API');

        const base64 = response.data;

        // Creamos el BlobUrl para reproducción
        const blob = base64ToBlob(base64);
        const blobUrl = URL.createObjectURL(blob);

        return { base64, blobUrl };
      }),
      catchError(error => throwError(() => new Error(`HTTP ${error.status}: ${error.message}`)))
    );
  }

  // ─── Google TTS ──────────────────────────────────────────────────────────────
  // Google TTS devuelve audio directo (no JSON), usamos una URL que el <audio> carga directamente
  // No podemos hacer fetch() por CORS, pero el elemento <audio> sí puede cargar cross-origin

  buildGoogleUrl(text: string, language: string): string {
  const encodedText = encodeURIComponent(text);
    return `${this.GOOGLE_BASE}?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input` +
           `&textlen=${encodedText.length}&q=${encodedText}&tl=${language}&ttsspeed=1`;
  }

  private readonly GOOGLE_URL = '/api/tts/google';

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

}