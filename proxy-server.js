const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

// Cache de voces válidas — se calcula una vez al arrancar
// Equivalente a: private static readonly List<string> _vocesValidas en C#
let tiktokValidVoices = null;
let googleValidVoices = null;

app.get('/api/tts/tiktok/voices', async (req, res) => {
  // Si ya las validamos, devolvemos el cache
  if (tiktokValidVoices) {
    console.log('[TikTok] Devolviendo voces del cache');
    return res.json({ voices: tiktokValidVoices });
  }

  console.log('[TikTok] Validando voces...');

  const allVoices = [
    { id: 'en_us_001', name: 'Jessie', language: 'en-US' },
    { id: 'en_us_002', name: 'Warm', language: 'en-US' },
    { id: 'en_us_006', name: 'Joey', language: 'en-US' },
    { id: 'en_us_007', name: 'Professor', language: 'en-US' },
    { id: 'en_us_009', name: 'Scientist', language: 'en-US' },
    { id: 'en_us_010', name: 'Confidence', language: 'en-US' },
    { id: 'en_uk_001', name: 'Narrator', language: 'en-UK' },
    { id: 'en_uk_003', name: 'Male', language: 'en-UK' },
    { id: 'en_au_001', name: 'Female', language: 'en-AU' },
    { id: 'es_mx_002', name: 'Héctor', language: 'es-MX' },
    { id: 'es_mx_003', name: 'Alejandra', language: 'es-MX' },
    { id: 'es_es_001', name: 'Male ES', language: 'es-ES' },
    { id: 'es_es_002', name: 'Female ES', language: 'es-ES' },
    { id: 'fr_001', name: 'Céline', language: 'fr' },
    { id: 'fr_002', name: 'Male FR', language: 'fr' },
    { id: 'de_001', name: 'Female DE', language: 'de' },
    { id: 'de_002', name: 'Male DE', language: 'de' },
    { id: 'pt_br_001', name: 'Dora', language: 'pt-BR' },
    { id: 'pt_br_002', name: 'Male PT', language: 'pt-BR' },
    { id: 'pt_001', name: 'Female PT', language: 'pt' },
    { id: 'jp_001', name: 'Female 1 JA', language: 'ja' },
    { id: 'jp_003', name: 'Female 2 JA', language: 'ja' },
    { id: 'jp_006', name: 'Male JA', language: 'ja' },
    { id: 'kr_002', name: 'Female KO', language: 'ko' },
    { id: 'kr_003', name: 'Male KO', language: 'ko' },
    { id: 'zh_003', name: 'Female ZH', language: 'zh' },
    { id: 'zh_004', name: 'Male ZH', language: 'zh' },
    { id: 'zh_007', name: 'Storyteller ZH', language: 'zh' },
    { id: 'id_001', name: 'Female ID', language: 'id' },
    { id: 'it_male_m18', name: 'Male IT', language: 'it' },
    { id: 'en_us_ghostface', name: 'Ghostface (Scream)', language: 'en-US' },
    { id: 'en_us_chewbacca', name: 'Chewbacca', language: 'en-US' },
    { id: 'en_us_c3po', name: 'C-3PO', language: 'en-US' },
    { id: 'en_us_stitch', name: 'Stitch', language: 'en-US' },
    { id: 'en_us_rocket', name: 'Rocket', language: 'en-US' },
    { id: 'en_female_ht_f08_halloween', name: 'Halloween', language: 'en-US' },
    { id: 'en_male_m03_lobby', name: 'Sunshine Soon', language: 'en-US' },
    { id: 'en_female_f08_salut_damour', name: 'Warmy Breeze', language: 'en-US' },
    { id: 'en_female_ht_f08_wonderful_world', name: 'Wacky Wren', language: 'en-US' },
    { id: 'en_male_m2_xhxs_m03_christmas', name: 'Santa Claus', language: 'en-US' },
    { id: 'en_female_f08_twinkle', name: 'Magician', language: 'en-US' },
    { id: 'en_male_m03_sunshine_soon', name: 'Trickster', language: 'en-US' },
  ];

  // Validamos en paralelo — como Task.WhenAll() en C#
  // Usamos allSettled para que un fallo no detenga las demás validaciones
  const results = await Promise.allSettled(
    allVoices.map(async voice => {
      try {
        const response = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello', voice: voice.id })
        });
        const data = await response.json();

        if (data.success && data.data) {
          console.log(`✅ [TikTok] ${voice.id}`);
          return voice;  // voz válida
        }
        console.log(`❌ [TikTok] ${voice.id}: ${data.error}`);
        return null;  // voz no disponible

      } catch (e) {
        console.log(`❌ [TikTok] ${voice.id}: error de red`);
        return null;
      }
    })
  );

  // Filtramos solo las que respondieron con éxito
  tiktokValidVoices = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  console.log(`[TikTok] ${tiktokValidVoices.length}/${allVoices.length} voces válidas`);
  res.json({ voices: tiktokValidVoices });
});

// ─── TikTok TTS ───────────────────────────────────────────────────────────────
app.post('/api/tts/tiktok', async (req, res) => {
  const { text, voice } = req.body;
  console.log(`[TikTok] voz: ${voice} | texto: "${text?.substring(0, 50)}"`);
  try {
    const response = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[TikTok] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tts/google/voices', async (req, res) => {
  if (googleValidVoices) {
    console.log('[Google] Devolviendo voces del cache');
    return res.json({ voices: googleValidVoices });
  }

  console.log('[Google] Validando voces...');

  const allVoices = [
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

  const results = await Promise.allSettled(
    allVoices.map(async voice => {
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input&textlen=5&q=hello&tl=${voice.language}&ttsspeed=1`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          }
        });

        // Google devuelve audio binario — si el content-type es audio, es válida
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('audio')) {
          console.log(`✅ [Google] ${voice.id}`);
          return voice;
        }
        console.log(`❌ [Google] ${voice.id}: ${response.status}`);
        return null;

      } catch (e) {
        console.log(`❌ [Google] ${voice.id}: error de red`);
        return null;
      }
    })
  );

  googleValidVoices = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  console.log(`[Google] ${googleValidVoices.length}/${allVoices.length} voces válidas`);
  res.json({ voices: googleValidVoices });
});

// ─── Google TTS ───────────────────────────────────────────────────────────────
// Google TTS devuelve audio binario directamente (no JSON)
// El proxy lo recibe y lo reenvía como stream al browser
app.get('/api/tts/google', async (req, res) => {
  const { text, lang } = req.query;
  console.log(`[Google] lang: ${lang} | texto: "${text?.substring(0, 50)}"`);
  
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input&textlen=${text.length}&q=${encodeURIComponent(text)}&tl=${lang}&ttsspeed=1`;
   console.log(url);
  try {
    const response = await fetch(url, {
      headers: {
        // Simulamos un browser real para que Google no rechace la petición
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.5'
      }
    });

    if (!response.ok) {
      console.error('[Google] Status:', response.status);
      return res.status(response.status).json({ error: 'Google TTS falló' });
    }

    // Pasamos los headers de audio al browser
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
    
    // Hacemos pipe del stream directamente — sin cargar todo en memoria
    // Equivalente a: response.Content.CopyToAsync(outputStream) en C#
    response.body.pipe(res);

  } catch (error) {
    console.error('[Google] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', port: PORT }));

app.listen(PORT, () => {
  console.log(`\n🚀 Proxy TTS corriendo en http://localhost:${PORT}`);
  console.log(`   TikTok: POST http://localhost:${PORT}/api/tts/tiktok`);
  console.log(`   Google: GET  http://localhost:${PORT}/api/tts/google?text=hola&lang=es\n`);
});