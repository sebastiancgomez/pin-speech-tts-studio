import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { TtsService } from '../../../core/services/tts.services';
import { ChunkAudio, VoiceTTS } from '../../../shared/models/tts.models';
import { mergeBuffersInBackground } from '../../../core/utils/audio.utils';

// Eventos que el service emite hacia el componente
// Equivalente a eventos de C#: public event EventHandler<ChunkReadyArgs> ChunkReady;
export interface PlayerEvents {
  chunkReady: { index: number; chunk: ChunkAudio; downloaded: number; total: number };
  bufferReady: void;
  allDownloaded: { mergedBuffer: AudioBuffer };
  error: { chunkIndex: number; message: string };
  stopped: void;
}

@Injectable()
export class PlayerService {

  // Subjects = equivalente a eventos en C# — el componente se suscribe a estos
  readonly onChunkReady$ = new Subject<PlayerEvents['chunkReady']>();
  readonly onBufferReady$ = new Subject<void>();
  readonly onAllDownloaded$ = new Subject<{ mergedBuffer: AudioBuffer }>();
  readonly onError$ = new Subject<PlayerEvents['error']>();
  readonly onStopped$ = new Subject<void>();

  private isActive = false;

  constructor(
    private ttsService: TtsService,
    private ngZone: NgZone
  ) {}

  stop(): void {
    this.isActive = false;
    this.onStopped$.next();
  }

  async generateTiktokWithBuffer(
    inputText: string,
    selectedVoice: VoiceTTS,
    bufferThreshold: number
  ): Promise<void> {
    const textChunks = this.ttsService.divideIntoChunks(inputText, 300);
    const total = textChunks.length;
    const threshold = Math.max(1, Math.ceil(total * bufferThreshold));

    const chunksArr: ChunkAudio[] = new Array(total);
    let downloaded = 0;
    let bufferEmitted = false;

    this.isActive = true;

    const BATCH_SIZE = 3;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    const downloadWithRetry = async (texto: string, index: number): Promise<void> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const chunk = await firstValueFrom(
            this.ttsService.generateTiktokAudio(texto, selectedVoice.id)
          );

          if (!this.isActive) return;

          chunksArr[index] = chunk;
          downloaded++;

          this.ngZone.run(() => {
            this.onChunkReady$.next({ index, chunk, downloaded, total });

            if (downloaded >= threshold && !bufferEmitted) {
              bufferEmitted = true;
              this.onBufferReady$.next();
            }
          });

          return;

        } catch (error: any) {
          console.warn(`⚠️ TikTok chunk ${index + 1} attempt ${attempt}/${MAX_RETRIES}:`, error?.message);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          }
        }
      }

      this.ngZone.run(() => {
        this.onError$.next({ chunkIndex: index, message: `Chunk ${index + 1} failed after ${MAX_RETRIES} attempts` });
      });
    };

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (!this.isActive) return;

      const batchIndices = Array.from(
        { length: Math.min(BATCH_SIZE, total - i) },
        (_, j) => i + j
      );

      await Promise.allSettled(
        batchIndices.map(idx => downloadWithRetry(textChunks[idx], idx))
      );
    }

    if (!this.isActive) return;

    // Pre-combinamos para export instantáneo
    const validChunks = chunksArr.filter(Boolean);
    if (validChunks.length > 0) {
      const mergedBuffer = await mergeBuffersInBackground(validChunks);
      this.ngZone.run(() => this.onAllDownloaded$.next({ mergedBuffer }));
    }

    if (!bufferEmitted && chunksArr.filter(Boolean).length > 0) {
      this.ngZone.run(() => this.onBufferReady$.next());
    }
  }

  async generateGoogleWithBuffer(
    inputText: string,
    selectedVoice: VoiceTTS,
    bufferThreshold: number
  ): Promise<void> {
    const textChunks = this.ttsService.divideIntoChunks(inputText, 180);
    const total = textChunks.length;
    const threshold = Math.max(1, Math.ceil(total * bufferThreshold));

    const chunksArr: ChunkAudio[] = new Array(total);
    let downloaded = 0;
    let bufferEmitted = false;

    this.isActive = true;

    const BATCH_SIZE = 5;
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 500;

    const downloadWithRetry = async (texto: string, index: number): Promise<void> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const chunk = await firstValueFrom(
            this.ttsService.generateGoogleAudio(texto, selectedVoice.language || 'es')
          );

          if (!this.isActive) return;

          chunksArr[index] = chunk;
          downloaded++;

          this.ngZone.run(() => {
            this.onChunkReady$.next({ index, chunk, downloaded, total });

            if (downloaded >= threshold && !bufferEmitted) {
              bufferEmitted = true;
              this.onBufferReady$.next();
            }
          });

          return;

        } catch (error: any) {
          console.warn(`⚠️ Google chunk ${index + 1} attempt ${attempt}/${MAX_RETRIES}:`, error?.message);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          }
        }
      }

      this.ngZone.run(() => {
        this.onError$.next({ chunkIndex: index, message: `Chunk ${index + 1} failed after ${MAX_RETRIES} attempts` });
      });
    };

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (!this.isActive) return;

      const batchIndices = Array.from(
        { length: Math.min(BATCH_SIZE, total - i) },
        (_, j) => i + j
      );

      await Promise.allSettled(
        batchIndices.map(idx => downloadWithRetry(textChunks[idx], idx))
      );
    }

    if (!this.isActive) return;

    const validChunks = chunksArr.filter(Boolean);
    if (validChunks.length > 0) {
      const mergedBuffer = await mergeBuffersInBackground(validChunks);
      this.ngZone.run(() => this.onAllDownloaded$.next({ mergedBuffer }));
    }

    if (!bufferEmitted && chunksArr.filter(Boolean).length > 0) {
      this.ngZone.run(() => this.onBufferReady$.next());
    }
  }
}