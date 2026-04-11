// Interfaces = equivalente a "record" o "class DTO" en C#
// En TypeScript las interfaces son solo contratos, no generan código en runtime
export interface ChunkAudio {
  base64: string;
  blobUrl: string;
  blob?: Blob;  // solo Google lo usa — TikTok ya tiene base64
}

export interface VoiceTTS {
  id: string;          // Identificador que se envía al API
  name: string;      // Nombre legible para el usuario
  service: ServiceTTS;
  language?: string;     // Solo para Google TTS
  preview?: string;    // Texto de ejemplo para preview
}

export interface ConfigTTS {
  voice: VoiceTTS;
  text: string;
  volume: number;     // 0-100
}

// Union type: equivalente a un enum en C# pero más flexible
export type ServiceTTS = 'tiktok' | 'google';