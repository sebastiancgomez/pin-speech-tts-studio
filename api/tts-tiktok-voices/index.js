const fetch = require('node-fetch');

// Cache en memoria — se resetea cuando Azure reinicia la función
// En producción podrías usar Azure Cache for Redis, pero para este caso es suficiente
let cachedVoices = null;

const ALL_VOICES = [
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

module.exports = async function (context, req) {
  if (cachedVoices) {
    context.res = { status: 200, body: { voices: cachedVoices } };
    return;
  }

  const results = await Promise.allSettled(
    ALL_VOICES.map(async voice => {
      try {
        const response = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello', voice: voice.id })
        });
        const data = await response.json();
        if (data.success && data.data) {
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