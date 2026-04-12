const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const { text, voice } = req.body;
  try {
    const response = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice })
    });

    const data = await response.json();

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: data
    };

  } catch (error) {
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  }
};