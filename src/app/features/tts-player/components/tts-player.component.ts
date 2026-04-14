import { Component, OnInit, OnDestroy, ViewChild, ElementRef, signal, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TtsService } from '../../../core/services/tts.services';
import { VoiceTTS, ServiceTTS, ChunkAudio } from '../../../shared/models/tts.models';
import { downloadWav, downloadMp3Chunks } from '../../../core/utils/audio.utils';
import { PlayerService } from '../services/player.service';
import { extractTextFromFile } from '../../../core/utils/file.utils';

@Component({
  selector: 'app-tts-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tts-player.component.html',
  styleUrls: ['./tts-player.component.scss'],
  providers: [PlayerService], // ← scoped al componente
})
export class TtsPlayerComponent implements OnInit, OnDestroy {
  @ViewChild('audioPlayer') audioPlayerRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('audioPreview') audioPreviewRef!: ElementRef<HTMLAudioElement>;

  private isStopping = false;

  activeService: ServiceTTS = 'tiktok';
  selectedVoice: VoiceTTS | null = null;
  inputText = '';
  volume = 80;
  // Signals = equivalente a INotifyPropertyChanged automático en .NET MVVM
  // Cuando cambia un signal, Angular re-renderiza SOLO lo que lo usa
  isLoading = signal(false);
  progress = signal(0);
  isPlaying = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  audioQueue = signal<string[]>([]);
  currentIndex = signal(0);
  tiktokVoices = signal<VoiceTTS[]>([]);
  googleVoices = signal<VoiceTTS[]>([]);
  chunks = signal<ChunkAudio[]>([]); // todos los chunks con base64 + blobUrl
  playSpeed = signal(1.0); // velocidad de reproducción
  isBufferReady = signal(false); // true cuando tenemos suficiente buffer
  isDowloadingInBackground = signal(false); // flag para el loop de descarga
  loadingVoices = signal(true); // nueva propiedad
  isPaused = signal(false);
  previewingVoiceId = signal<string | null>(null);
  allChunksDownloaded = signal(false);
  mergedBuffer: AudioBuffer | null = null;
  isExtractingFile = signal(false);
  exportFormat = signal<'wav' | 'mp3'>('mp3'); // mp3 por defecto

  get activeVoices(): VoiceTTS[] {
    return this.activeService === 'tiktok' ? this.tiktokVoices() : this.googleVoices();
  }

  get chunksTotal(): number {
    const limite = this.activeService === 'tiktok' ? 300 : 180;
    if (!this.inputText.trim()) return 0;
    return this.ttsService.divideIntoChunks(this.inputText, limite).length;
  }

  get exportButtonLabel(): string {
    if (this.allChunksDownloaded()) return '↓ Export audio';
    if (this.isBufferReady()) return '⬇ Downloading... ' + this.progress() + '%';
    return '↓ Export audio';
  }

  constructor(
    private ttsService: TtsService,
    private playerService: PlayerService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    let tiktokReady = false;
    let googleReady = false;

    const checkBothReady = () => {
      if (tiktokReady && googleReady) {
        this.loadingVoices.set(false);
      }
    };
    this.subscribeToPlayerEvents();
    // Cargamos ambos servicios en paralelo — como Task.WhenAll() en C#
    this.ttsService.getTiktokVoices().subscribe({
      next: (voices) => {
        this.tiktokVoices.set(voices);
        if (this.activeService === 'tiktok') {
          this.selectedVoice = voices[0] ?? null;
        }
        console.log(`✅ ${voices.length} voices TikTok`);
        tiktokReady = true;
        checkBothReady();
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.errorMessage.set('Error loading TikTok voices: ' + err.message);
          tiktokReady = true; // aunque falle, marcamos como listo para no bloquear
          checkBothReady();
        });
      },
    });

    this.ttsService.getGoogleVoices().subscribe({
      next: (voices) => {
        this.googleVoices.set(voices);
        if (this.activeService === 'google') {
          this.selectedVoice = voices[0] ?? null;
        }
        console.log(`✅ ${voices.length} voices Google`);
        googleReady = true;
        checkBothReady();
      },
      error: (err) => {
        this.errorMessage.set('Error loading Google voices: ' + err.message);
        googleReady = true;
        checkBothReady();
      },
    });
  }

  ngOnDestroy(): void {
    this.cleanUpPlayback();
  }

  private subscribeToPlayerEvents(): void {
    // Equivalente a: playerService.ChunkReady += OnChunkReady en C#
    this.playerService.onChunkReady$.subscribe(({ index, chunk, downloaded, total }) => {
      this.chunks.update((arr) => {
        const updated = [...arr];
        updated[index] = chunk;
        return updated;
      });
      this.audioQueue.update((arr) => {
        const updated = [...arr];
        updated[index] = chunk.blobUrl;
        return updated;
      });
      this.progress.set(Math.round((downloaded / total) * 100));
    });

    this.playerService.onBufferReady$.subscribe(() => {
      this.isBufferReady.set(true);
      this.isLoading.set(false);
      this.playNext();
    });

    this.playerService.onAllDownloaded$.subscribe(({ mergedBuffer }) => {
      this.mergedBuffer = mergedBuffer;
      this.allChunksDownloaded.set(true);
      this.isDowloadingInBackground.set(false);
    });

    this.playerService.onError$.subscribe(({ message }) => {
      this.errorMessage.set(message);
    });
  }

  changeService(service: ServiceTTS): void {
    this.activeService = service;
    this.selectedVoice = service === 'tiktok' ? this.tiktokVoices()[0] : this.googleVoices()[0];
    this.cleanUpPlayback();
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  selectVoice(voice: VoiceTTS): void {
    this.selectedVoice = voice;
  }

  async voicePreview(voice: VoiceTTS, event: Event): Promise<void> {
    event.stopPropagation();
    const preview = voice.preview || 'Hola, esta es una prueba de voz.';
    const audioEl = this.audioPreviewRef.nativeElement;

    if (voice.service === 'tiktok') {
      try {
        const chunk: ChunkAudio = await firstValueFrom(
          this.ttsService.generateTiktokAudio(preview, voice.id),
        );
        audioEl.src = chunk.blobUrl;
        audioEl.volume = this.volume / 100;
        audioEl.onended = () => URL.revokeObjectURL(chunk.blobUrl);
        await audioEl.play();
      } catch (e) {
        console.warn('Preview falló:', e);
      }
    } else {
      const urls = this.ttsService.getGoogleUrls(preview, voice.language || 'es');
      audioEl.src = urls[0];
      audioEl.volume = this.volume / 100;
      await audioEl.play().catch(console.warn);
    }
  }

  async generateAndPlay(): Promise<void> {
    if (!this.inputText.trim() || !this.selectedVoice) return;

    this.playerService.stop();
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.chunks.set([]);
    this.audioQueue.set([]);
    this.currentIndex.set(0);
    this.progress.set(0);
    this.isBufferReady.set(false);
    this.isDowloadingInBackground.set(false);
    this.allChunksDownloaded.set(false);
    this.isPaused.set(false);
    this.mergedBuffer = null;

    await new Promise((r) => setTimeout(r, 50));

    try {
      if (this.activeService === 'tiktok') {
        this.playerService.generateTiktokWithBuffer(this.inputText, this.selectedVoice, 0.5);
      } else {
        this.playerService.generateGoogleWithBuffer(this.inputText, this.selectedVoice, 0.5);
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Unknown error');
      this.isLoading.set(false);
    }
  }

  playNext(): void {
    // Con índice 5 y longitud 5, esta condición ES true — si no entra,
    // hay algo más ejecutándose después que vuelve a llamar reproducirSiguiente
    if (this.currentIndex() >= this.audioQueue().length) {
      this.ngZone.run(() => {
        this.isPlaying.set(false);
        this.isDowloadingInBackground.set(false);
        this.successMessage.set('Playback completed');
      });
      return;
    }

    const currentUrl = this.audioQueue()[this.currentIndex()];

    if (!currentUrl) {
      setTimeout(() => this.playNext(), 200);
      return;
    }

    const audioEl = this.audioPlayerRef.nativeElement;

    audioEl.onended = null;
    audioEl.onerror = null;

    audioEl.onended = () => {
      this.currentIndex.set(this.currentIndex() + 1);
      // NgZone.run() garantiza que Angular detecta los cambios
      // desde eventos DOM nativos que ocurren fuera de su zona
      this.ngZone.run(() => this.playNext());
    };

    audioEl.onerror = () => {
      if (this.isStopping) return;
      console.warn(`Error in chunk ${this.currentIndex()}, skipping...`);
      this.currentIndex.set(this.currentIndex() + 1);
      this.ngZone.run(() => this.playNext());
    };

    this.isPlaying.set(true);
    audioEl.src = currentUrl;
    audioEl.volume = this.volume / 100;
    audioEl.playbackRate = this.playSpeed();
    audioEl.play().catch((e) => console.error('Playback error:', e));
  }

  pauseOrResume(): void {
    const audioEl = this.audioPlayerRef.nativeElement;
    if (audioEl.paused) {
      audioEl.play();
      this.isPlaying.set(true);
      this.isPaused.set(false);
    } else {
      audioEl.pause();
      this.isPlaying.set(false);
      this.isPaused.set(true);
    }
  }

  stop(): void {
    this.playerService.stop();
    this.isStopping = true;
    this.isDowloadingInBackground.set(false); // detiene el loop de descarga
    this.isPaused.set(false);
    this.cleanUpPlayback();
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  private cleanUpPlayback(): void {
    if (this.audioPlayerRef) {
      const audioEl = this.audioPlayerRef.nativeElement;
      audioEl.pause();
      audioEl.src = '';
    }
    // Ahora sí revocamos todos los blobUrls al limpiar
    this.chunks().forEach((c) => URL.revokeObjectURL(c.blobUrl));
    this.chunks.set([]);
    this.audioQueue.set([]);
    this.currentIndex.set(0);
    this.progress.set(0);
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.isLoading.set(false);
    this.isBufferReady.set(false);
    this.isDowloadingInBackground.set(false);
    this.mergedBuffer = null;
  }

  async exportAudio(): Promise<void> {
    if (!this.mergedBuffer && this.chunks().length === 0) {
      this.errorMessage.set('Generate audio first before exporting');
      return;
    }

    this.isLoading.set(true);
    try {
      if (this.exportFormat() === 'mp3') {
        // MP3: concatenación directa de binarios — sin AudioContext, sin bloquear el hilo
        downloadMp3Chunks(this.chunks().filter(Boolean), 'pinspeech-output');
        this.successMessage.set('Audio exported as MP3');
      } else {
        // WAV: requiere decodificar y mezclar AudioBuffers
        if (!this.mergedBuffer) {
          this.errorMessage.set('WAV export is still processing, please wait');
          return;
        }
        downloadWav(this.mergedBuffer, 'pinspeech-output');
        this.successMessage.set('Audio exported as WAV');
      }
    } catch (e: any) {
      this.errorMessage.set('Export error: ' + e.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  changeVolume(event: Event): void {
    this.volume = parseInt((event.target as HTMLInputElement).value);
    if (this.audioPlayerRef) {
      this.audioPlayerRef.nativeElement.volume = this.volume / 100;
    }
  }

  changeSpeed(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.playSpeed.set(val);
    // Aplicamos inmediatamente si está reproduciendo
    if (this.audioPlayerRef) {
      this.audioPlayerRef.nativeElement.playbackRate = val;
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isExtractingFile.set(true);
    this.errorMessage.set('');

    try {
      const text = await extractTextFromFile(file);
      this.inputText = text;
      this.successMessage.set(`File loaded — ${text.length} characters extracted`);
    } catch (e: any) {
      this.errorMessage.set('Error reading file: ' + e.message);
    } finally {
      this.isExtractingFile.set(false);
      // Limpiamos el input para permitir subir el mismo archivo de nuevo
      input.value = '';
    }
  }
}
