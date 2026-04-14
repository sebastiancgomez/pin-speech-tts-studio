const fetch = require('node-fetch');

let cachedVoices = null;

const ALL_VOICES = [
    // --- Básicos (Tus originales + mejoras) ---
    { id: 'es', name: 'Español (España)', language: 'es-ES' },
    { id: 'es-MX', name: 'Español (México)', language: 'es-MX' },
    { id: 'en-US', name: 'English (US)', language: 'en-US' },
    { id: 'en-GB', name: 'English (UK)', language: 'en-GB' },
    { id: 'fr', name: 'Français', language: 'fr-FR' },
    { id: 'de', name: 'Deutsch', language: 'de-DE' },
    { id: 'pt-BR', name: 'Português (Brasil)', language: 'pt-BR' },
    { id: 'pt-PT', name: 'Português (Portugal)', language: 'pt-PT' },
    { id: 'it', name: 'Italiano', language: 'it-IT' },
    
    // --- Asia y Oceanía ---
    { id: 'ja', name: '日本語 (Japonés)', language: 'ja-JP' },
    { id: 'ko', name: '한국어 (Coreano)', language: 'ko-KR' },
    { id: 'zh-CN', name: '中文 (Chino Simplificado)', language: 'zh-CN' },
    { id: 'hi-IN', name: 'हिन्दी (Hindi)', language: 'hi-IN' },
    { id: 'vi-VN', name: 'Tiếng Việt (Vietnamita)', language: 'vi-VN' },
    { id: 'th-TH', name: 'ไทย (Tailandés)', language: 'th-TH' },

    // --- Europa del Este y Norte ---
    { id: 'ru-RU', name: 'Русский (Ruso)', language: 'ru-RU' },
    { id: 'pl-PL', name: 'Polski (Polaco)', language: 'pl-PL' },
    { id: 'nl-NL', name: 'Nederlands (Holandés)', language: 'nl-NL' },
    { id: 'sv-SE', name: 'Svenska (Sueco)', language: 'sv-SE' },
    { id: 'da-DK', name: 'Dansk (Danés)', language: 'da-DK' },
    { id: 'no-NO', name: 'Norsk (Noruego)', language: 'no-NO' },
    { id: 'fi-FI', name: 'Suomi (Finlandés)', language: 'fi-FI' },

    // --- Medio Oriente y Otros ---
    { id: 'ar-XA', name: 'العربية (Árabe)', language: 'ar-XA' },
    { id: 'tr-TR', name: 'Türkçe (Turco)', language: 'tr-TR' },
    { id: 'he-IL', name: 'עברית (Hebreo)', language: 'he-IL' },
    { id: 'id-ID', name: 'Bahasa Indonesia (Indonesio)', language: 'id-ID' }
];

module.exports = async function (context, req) {
  if (cachedVoices) {
    context.res = { status: 200, body: { voices: cachedVoices } };
    return;
  }

  const results = await Promise.allSettled(
    ALL_VOICES.map(async voice => {
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input&textlen=5&q=hello&tl=${voice.language}&ttsspeed=1`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          }
        });
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('audio')) {
          return voice;
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  cachedVoices = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  context.res = { status: 200, body: { voices: cachedVoices } };
};