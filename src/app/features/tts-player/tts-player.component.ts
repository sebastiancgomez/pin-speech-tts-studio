import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, signal, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TtsService } from '../../core/services/tts.services';
import { VoiceTTS, ServiceTTS, ChunkAudio  } from '../../shared/models/tts.models';

@Component({
  selector: 'app-tts-player',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tts-player.component.html',
  styleUrls: ['./tts-player.component.scss']
})
export class TtsPlayerComponent implements OnInit, OnDestroy {

  @ViewChild('audioPlayer') audioPlayerRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('audioPreview') audioPreviewRef!: ElementRef<HTMLAudioElement>;

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
  succesMessage = signal('');
  audioQueue = signal<string[]>([]);
  currentIndex = signal(0);
  tiktokVoices = signal<VoiceTTS[]>([]);
  googleVoices = signal<VoiceTTS[]>([]);
  chunks = signal<ChunkAudio[]>([]);          // todos los chunks con base64 + blobUrl
  playSpeed = signal(1.0);             // velocidad de reproducción
  isBufferReady = signal(false);         // true cuando tenemos suficiente buffer
  isDowloadingInBackground = signal(false);          // flag para el loop de descarga
  loadingVoices = signal(true);  // nueva propiedad
  isPaused = signal(false);
  previewingVoiceId = signal<string | null>(null);

  get activeVoices(): VoiceTTS[] {
    return this.activeService === 'tiktok' ? this.tiktokVoices() : this.googleVoices();
  }

  get chunksTotal(): number {
    const limite = this.activeService === 'tiktok' ? 300 : 180;
    if (!this.inputText.trim()) return 0;
    return this.ttsService.divideIntoChunks(this.inputText, limite).length;
  }

  constructor(
    private ttsService: TtsService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    // Cargamos ambos servicios en paralelo — como Task.WhenAll() en C#
    this.ttsService.getTiktokVoices().subscribe({
      next: voices => {
        this.tiktokVoices.set(voices);
        if (this.activeService === 'tiktok') {
          this.selectedVoice = voices[0] ?? null;
        }
        console.log(`✅ ${voices.length} voices TikTok`);
      },
      error: err => this.errorMessage.set('Error cargando voices TikTok: ' + err.message)
    });

    this.ttsService.getGoogleVoices().subscribe({
      next: voices => {
        this.googleVoices.set(voices);
        if (this.activeService === 'google') {
          this.selectedVoice = voices[0] ?? null;
        }
        this.loadingVoices.set(false);
        console.log(`✅ ${voices.length} voices Google`);
      },
      error: err => {
        this.errorMessage.set('Error cargando voces Google: ' + err.message);
        this.loadingVoices.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.cleanUpPlayback();
  }

  changeService(service: ServiceTTS): void {
    this.activeService = service;
    this.selectedVoice = service === 'tiktok' ? this.tiktokVoices()[0] : this.googleVoices()[0];
    this.cleanUpPlayback();
    this.errorMessage.set('');
    this.succesMessage.set('');
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
          this.ttsService.generateTiktokAudio(preview, voice.id)
        );
        audioEl.src = chunk.blobUrl;
        audioEl.volume = this.volume / 100;
        audioEl.onended = () => URL.revokeObjectURL(chunk.blobUrl);
        await audioEl.play();
      } catch (e) {
        console.warn('Preview falló:', e);
      }
    }else {
      const urls = this.ttsService.getGoogleUrls(preview, voice.language || 'es');
      audioEl.src = urls[0];
      audioEl.volume = this.volume / 100;
      await audioEl.play().catch(console.warn);
    }
  }

  
  async generateAndPlay(): Promise<void> {
    if (!this.inputText.trim() || !this.selectedVoice) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.succesMessage.set('');
    this.chunks.set([]);
    this.audioQueue.set([]);
    this.currentIndex.set(0);
    this.progress.set(0);
    this.isBufferReady.set(false);
    this.isDowloadingInBackground.set(false);

    await new Promise(r => setTimeout(r, 50));

    try {
      if (this.activeService === 'tiktok') {
        await this.generateTiktokWithBuffer();
      } else {
        await this.generateGoogleWithBuffer();
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error desconocido');
      this.isLoading.set(false);
    }
  }

  private async generateGoogleWithBuffer(): Promise<void> {
    const textChunks = this.ttsService.divideIntoChunks(this.inputText, 180);
    const total = textChunks.length;
    const umbralBuffer = Math.max(1, Math.ceil(total * 0.5));

    console.log(`📝 Google chunks: ${total} | Umbral: ${umbralBuffer}`);

    this.chunks.set(new Array(total));
    this.audioQueue.set(new Array(total).fill(null));
    let downloaded = 0;
    let isPlaybackStarted = false;

    this.isDowloadingInBackground.set(true);

    const promises = textChunks.map((texto, i) =>
      firstValueFrom(
        this.ttsService.generateGoogleAudio(texto, this.selectedVoice!.language || 'es')
      ).then(chunk => {
        if (!this.isDowloadingInBackground()) return;

        this.chunks.set(this.chunks().map((v, j) => j === i ? chunk : v));
        this.audioQueue.set(this.audioQueue().map((v, j) => j === i ? chunk.blobUrl : v));
        downloaded++;

        this.progress.set(Math.round((downloaded / total) * 100));
        console.log(`✅ Google chunk ${i + 1}/${total} listo`);

        if (downloaded >= umbralBuffer && !isPlaybackStarted) {
          isPlaybackStarted = true;
          this.isBufferReady.set(true);
          this.isLoading.set(false);
          this.playNext();
        }
      }).catch(error => {
        console.error(`❌ Error Google chunk ${i + 1}:`, error);
        this.errorMessage.set(`Error en chunk ${i + 1}: ${error?.message}`);
      })
    );

    /*await Promise.allSettled(promesas);
    this.descargandoEnFondo = false;

    if (!reproduccionIniciada && this.chunks.filter(Boolean).length > 0) {
      this.bufferListo.set(true);
      this.estaCargando.set(false);
      this.reproducirSiguiente();
    }*/
    await Promise.allSettled(promises);
    this.isDowloadingInBackground.set(false);
    console.log('✅ Todos los chunks descargados');

    // Si el reproductor está esperando en el último chunk nulo, lo despertamos
    if (this.isPlaying()) {
      this.playNext();
    }
  }

  private async generateTiktokWithBuffer(): Promise<void> {
    const textChunks = this.ttsService.divideIntoChunks(this.inputText, 300);
    const total = textChunks.length;
    const umbralBuffer = Math.max(1, Math.ceil(total * 0.5));
    
    console.log(`📝 Total chunks: ${total} | Umbral buffer: ${umbralBuffer}`);

    // Array con slots vacíos — se van llenando conforme llegan las descargas
    // Equivalente a Task[] en C# con resultados en posiciones fijas
    this.chunks.set(new Array(total));
    this.audioQueue.set(new Array(total).fill(null));
    let downloaded = 0;
    let isPlaybackStarted = false;

    this.isDowloadingInBackground.set(true);

    // Lanzamos TODAS las descargas en paralelo — como Task.WhenAll() en C#
    // pero cada una al terminar actualiza su slot correspondiente
    const promises = textChunks.map((texto, i) =>
      firstValueFrom(
        this.ttsService.generateTiktokAudio(texto, this.selectedVoice!.id)
      ).then(chunk => {
        if (!this.isDowloadingInBackground()) return;

        // Guardamos en la posición correcta — el orden se preserva
        this.chunks.set(this.chunks().map((v, j) => j === i ? chunk : v));
        this.audioQueue.set(this.audioQueue().map((v, j) => j === i ? chunk.blobUrl : v));
        downloaded++;

        this.progress.set(Math.round((downloaded / total) * 100));
        console.log(`✅ Chunk ${i + 1}/${total} listo`);

        // Iniciamos reproducción cuando alcanzamos el umbral
        if (downloaded >= umbralBuffer && !isPlaybackStarted) {
          isPlaybackStarted = true;
          this.isBufferReady.set(true);
          this.isLoading.set(false);
          console.log(`▶ Iniciando reproducción con ${downloaded} chunks listos`);
          this.playNext();
        }
      }).catch(error => {
        console.error(`❌ Error chunk ${i + 1}:`, error);
        this.errorMessage.set(`Error en chunk ${i + 1}: ${error?.message}`);
      })
    );

    // Esperamos que todas las descargas terminen
    await Promise.allSettled(promises);
    this.isDowloadingInBackground.set(false);
    console.log('✅ Todos los chunks descargados');

    // Edge case: si solo hay 1 chunk y no se inició la reproducción
    if (!isPlaybackStarted && this.chunks().filter(Boolean).length > 0) {
      this.isBufferReady.set(true);
      this.isLoading.set(false);
      this.playNext();
    }
  }

  playNext(): void {
    console.log('🔄 playNext llamado:', {
      currentIndex: this.currentIndex,
      queueLength: this.audioQueue().length,
      isDownloadingInBackground: this.isDowloadingInBackground,
      audioQueue: this.audioQueue().map(u => u ? '✅' : '❌')
    });

    // Con índice 5 y longitud 5, esta condición ES true — si no entra, 
    // hay algo más ejecutándose después que vuelve a llamar reproducirSiguiente
    if (this.currentIndex() >= this.audioQueue().length) {
      console.log('🏁 FIN de cola detectado');
      this.ngZone.run(() => {
        this.isPlaying.set(false);
        this.isDowloadingInBackground.set(false);
        this.succesMessage.set('✓ Reproducción completada');
      });
      return;
    }

    const currentUrl = this.audioQueue()[this.currentIndex()];

    if (!currentUrl) {
      console.log(`⏳ Esperando chunk ${this.currentIndex() + 1}...`);
      setTimeout(() => this.playNext(), 200);
      return;
    }

    const audioEl = this.audioPlayerRef.nativeElement;

    audioEl.onended = null;
    audioEl.onerror = null;

    audioEl.onended = () => {
      console.log(`🎵 Chunk ${this.currentIndex()} terminó`);
      this.currentIndex.set(this.currentIndex() + 1);
      // NgZone.run() garantiza que Angular detecta los cambios
      // desde eventos DOM nativos que ocurren fuera de su zona
      this.ngZone.run(() => this.playNext());
    };

    audioEl.onerror = () => {
      console.warn(`Error en chunk ${this.currentIndex()}, saltando...`);
      this.currentIndex.set(this.currentIndex() + 1);
      this.ngZone.run(() => this.playNext());
    };

    this.isPlaying.set(true);
    audioEl.src = currentUrl;
    audioEl.volume = this.volume / 100;
    audioEl.playbackRate = this.playSpeed();
    audioEl.play().catch(e => console.error('Error al reproducir:', e));
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
    this.isDowloadingInBackground.set(false);  // detiene el loop de descarga
    this.isPaused.set(false);
    this.cleanUpPlayback();
    this.succesMessage.set('');
    this.errorMessage.set('');
  }

  private cleanUpPlayback(): void {
    if (this.audioPlayerRef) {
      const audioEl = this.audioPlayerRef.nativeElement;
      audioEl.pause();
      audioEl.src = '';
    }
    // Ahora sí revocamos todos los blobUrls al limpiar
    this.chunks().forEach(c => URL.revokeObjectURL(c.blobUrl));
    this.chunks.set([]);
    this.audioQueue.set([]);
    this.currentIndex.set(0);
    this.progress.set(0);
    this.isPlaying.set(false);
    this.isPaused.set(false);
    this.isLoading.set(false);
    this.isBufferReady.set(false);
    this.isDowloadingInBackground.set(false);
  }

  async exportAudio(): Promise<void> {
    if (this.chunks.length === 0) {
      this.errorMessage.set('Primero genera el audio antes de exportar');
      return;
    }
    this.isLoading.set(true);
    try {
      await this.ttsService.mergeAndDownloadAudio(this.chunks(), 'tts-output');
      this.succesMessage.set(`✓ Audio exportado (${this.chunks.length} chunks combinados)`);
    } catch (e: any) {
      this.errorMessage.set('Error al exportar: ' + e.message);
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
}