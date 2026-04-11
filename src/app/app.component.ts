import { Component } from '@angular/core';
import { TtsPlayerComponent } from './features/tts-player/tts-player.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TtsPlayerComponent], // importamos nuestro componente principal
  template: `<app-tts-player></app-tts-player>` // simplemente lo usamos
})
export class AppComponent {}