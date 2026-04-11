const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const { text, lang } = req.query;

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&prev=input&textlen=${text.length}&q=${encodeURIComponent(text)}&tl=${lang}&ttsspeed=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    });

    if (!response.ok) {
      context.res = { status: response.status, body: { error: 'Google TTS failed' } };
      return;
    }

    // Convertimos el stream a buffer para devolverlo
    const buffer = await response.buffer();

    context.res = {
      status: 200,
      isRaw: true,  // le dice a Azure que no serialice el body
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Access-Control-Allow-Origin': '*'
      },
      body: buffer
    };

  } catch (error) {
    context.res = { status: 500, body: { error: error.message } };
  }
};