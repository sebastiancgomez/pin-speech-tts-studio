const fetch = require('node-fetch');

let cachedVoices = null;

const ALL_VOICES = [
    { id: 'es', name: 'Español', language: 'es' },
    { id: 'es-MX', name: 'Español México', language: 'es-MX' },
    { id: 'en', name: 'English', language: 'en' },
    { id: 'fr', name: 'Français', language: 'fr' },
    { id: 'de', name: 'Deutsch', language: 'de' },
    { id: 'pt', name: 'Português', language: 'pt' },
    { id: 'it', name: 'Italiano', language: 'it' },
    { id: 'ja', name: '日本語', language: 'ja' },
    { id: 'ko', name: '한국어', language: 'ko' },
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