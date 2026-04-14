# PinSpeech 🎙️
Text-to-Speech Studio · Powered by Pin ❤

Free text-to-speech studio that converts text to audio using TikTok TTS and Google TTS engines, with automatic chunking for unlimited text length, buffered playback, and audio export.

## 🔗 Live Demo
[PinSpeech — Try it here](https://white-glacier-0b87f900f.6.azurestaticapps.net)

---

## ✨ Features

- 🎤 **Two TTS engines** — TikTok TTS (character voices, multiple languages) and Google TTS (natural voices, 26 languages)
- 🔍 **Voice validation** — only voices that are currently available are shown, invalid ones are filtered automatically
- 👂 **Voice preview** — listen to each voice before selecting it
- ♾️ **Unlimited text length** — text is automatically split into chunks (300 chars for TikTok, 180 for Google)
- ⚡ **Buffered playback** — starts playing after 50% of chunks are ready, downloads the rest in the background (parallel with Promise.allSettled)
- ⏸️ **Playback controls** — play, pause, resume, stop
- 🎚️ **Volume and speed control** — 0–100% volume, 0.5x to 1.5x playback speed
- 📄 **File upload** — extract text directly from PDF, DOC and DOCX files
- 💾 **Audio export** — MP3 (binary concatenation, non-blocking) or WAV (Web Audio API)
- 🎨 **Dark UI** — custom design with DM Serif Display, DM Sans and JetBrains Mono fonts

---

## 🏗️ Architecture

```
Browser (Angular 19)
    ↓
Azure Static Web Apps
    ↓
Azure Functions (Node.js proxy)
    ↓                    ↓
TikTok TTS API     Google Translate TTS
```

The proxy layer solves CORS restrictions — both TTS endpoints block direct browser requests. Azure Functions act as a server-to-server relay, equivalent to a minimal API in .NET.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 19 (standalone components, signals) |
| Styling | SCSS with CSS custom properties |
| State management | Angular Signals |
| HTTP client | Angular HttpClient + RxJS |
| Backend/Proxy | Azure Functions v4 (Node.js) |
| Hosting | Azure Static Web Apps (Free tier) |
| CI/CD | GitHub Actions (auto-deploy on push to main) |
| Audio processing | Web Audio API |
| PDF extraction | pdf.js (Mozilla) |
| Word extraction | mammoth.js |
| TTS Engine 1 | TikTok TTS (via weilnet proxy) |
| TTS Engine 2 | Google Translate TTS |

---

## 📁 Project Structure

```
pin-speech-tts-studio/
├── api/                              # Azure Functions (Node.js proxy)
│   ├── tts-tiktok/                   # POST /api/tts/tiktok
│   │   ├── function.json
│   │   └── index.js
│   ├── tts-tiktok-voices/            # GET /api/tts/tiktok/voices
│   │   ├── function.json
│   │   └── index.js
│   ├── tts-google/                   # GET /api/tts/google
│   │   ├── function.json
│   │   └── index.js
│   ├── tts-google-voices/            # GET /api/tts/google/voices
│   │   ├── function.json
│   │   └── index.js
│   ├── host.json
│   ├── local.settings.json           # not committed (gitignored)
│   └── package.json
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   │   └── tts.service.ts        # HTTP calls, chunking
│   │   │   └── utils/
│   │   │       ├── audio.utils.ts        # audioBufferToWav, MP3 export, merge
│   │   │       └── file.utils.ts         # PDF and Word text extraction
│   │   ├── features/
│   │   │   └── tts-player/
│   │   │       ├── components/
│   │   │       │   ├── tts-player.component.ts    # component logic
│   │   │       │   ├── tts-player.component.html  # template
│   │   │       │   └── tts-player.component.scss  # styles
│   │   │       └── services/
│   │   │           └── player.service.ts  # batch download, retry, playback queue
│   │   ├── shared/
│   │   │   └── models/
│   │   │       └── tts.models.ts         # interfaces and types
│   │   ├── app.component.ts
│   │   └── app.config.ts
│   ├── staticwebapp.config.json          # Azure SWA routing config
│   └── index.html
├── .github/
│   └── workflows/
│       └── azure-static-web-apps-*.yml   # CI/CD pipeline
├── .gitignore
└── README.md
```

---

## 🧠 Key Concepts

### Chunking
Both TTS APIs have character limits per request. The app automatically splits text into chunks and processes them:
- **TikTok TTS**: 300 characters per chunk
- **Google TTS**: 180 characters per chunk

Text is normalized before chunking — line breaks (`\n`) are replaced with spaces and special characters like em dashes are sanitized to prevent API errors.

### Buffered Playback
Instead of waiting for all chunks to download before playing, the app:
1. Launches all chunk downloads in parallel (`Promise.allSettled` — equivalent to `Task.WhenAll()` in C#)
2. Starts playback when 50% of chunks are ready (`Math.ceil(total * 0.5)`)
3. Continues downloading remaining chunks in the background
4. If the player reaches a chunk that hasn't arrived yet, it waits 200ms and retries

### Voice Validation
On startup, the API validates every voice by making a test request. Only voices that return a successful response are shown in the UI. Results are cached in memory for the lifetime of the Azure Function instance.

### Audio Export
Two export strategies depending on format:
- **MP3** — chunks are concatenated as raw binary data without decoding. MP3 is a sequence of independent frames, so concatenation produces a valid file. This is non-blocking and does not affect playback.
- **WAV** — chunks are decoded into `AudioBuffer` objects, merged into a single buffer, and encoded as PCM. The merge is deferred 2 seconds after all chunks are downloaded to avoid competing with the audio playback thread.

### File Upload
Text can be extracted directly from files without leaving the app:
- **PDF** — extracted using pdf.js (Mozilla), runs entirely in the browser
- **DOC / DOCX** — extracted using mammoth.js, runs entirely in the browser
- No backend required for file processing — zero additional cost

### CORS Solution
Both TTS endpoints block browser requests (CORS). Azure Functions act as a server-to-server proxy — server-to-server requests have no CORS restrictions, equivalent to `IHttpClientFactory` in .NET calling an external API.

### Batch Processing & Retry
To avoid rate limiting on TikTok TTS (which rejects too many simultaneous requests):
- Chunks are processed in batches — 3 at a time for TikTok, 5 for Google
- If a chunk fails, it retries with exponential backoff (500ms × attempt for Google, 1000ms × attempt for TikTok)
- Equivalent to `Polly` retry policies in .NET
- If all retries fail, the chunk is skipped and playback continues with the rest

### Player Service
Download logic, batch processing and retry are encapsulated in a dedicated `PlayerService` scoped to the component — equivalent to `AddScoped<>()` in .NET. The service communicates with the component via RxJS `Subject` streams, equivalent to C# events.

---

## 🚀 Running Locally

### Prerequisites
- Node.js 20+
- Angular CLI: `npm install -g @angular/cli`
- Azure Functions Core Tools: `npm install -g azure-functions-core-tools@4`
- SWA CLI: `npm install -g @azure/static-web-apps-cli`

### Setup

```bash
# Clone the repo
git clone https://github.com/sebastiancgomez/pin-speech-tts-studio.git
cd pin-speech-tts-studio

# Install Angular dependencies
npm install

# Install API dependencies
cd api
npm install
cd ..
```

Create `api/local.settings.json` (not included in repo):
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

### Run

```bash
# Terminal 1 — Angular dev server
ng serve

# Terminal 2 — SWA emulator (Angular + Functions together)
swa start http://localhost:4200 --api-location api
```

Open `http://localhost:4280`

---

## 📦 Deployment

Deployment is fully automated via GitHub Actions. Every push to `main` triggers the CI/CD pipeline:

1. GitHub Actions builds the Angular app (`ng build`)
2. Deploys the static files to Azure Static Web Apps
3. Deploys the Azure Functions automatically from the `api/` folder
4. SSL is handled automatically by Azure

To deploy your own instance:
1. Fork this repo
2. Create an [Azure Static Web App](https://portal.azure.com) and connect it to your fork
3. Azure will add the workflow file automatically

---

## ⚠️ Limitations

- **TikTok TTS** uses an unofficial endpoint — availability may change without notice
- **Google TTS** uses the free translate endpoint — not intended for production use at scale
- Voice cache resets when Azure restarts the Function instance
- **Chunk gap** — small pause between chunks during playback, inherent to the HTML audio element model

---

## 🔄 Changelog

### v1.4.0
- 🌍 **Google TTS expanded** — now supports 26 languages including Arabic, Hindi, Vietnamese, Thai, Russian, Polish, Dutch, Swedish, Danish, Norwegian, Finnish, Turkish, Hebrew and Indonesian
- 🎵 **MP3 export reworked** — now uses binary concatenation instead of AudioContext decoding, making it non-blocking and safe for large files (50+ chunks)
- ⏳ **Deferred WAV merge** — AudioBuffer merge is now deferred 2 seconds after download completes to avoid competing with playback and blocking the main thread
- 🔧 **Fix emojis and special characters** — TikTok TTS requests now use explicit UTF-8 charset header to handle emojis and special characters without crashing
- 🔧 **Fix line breaks in chunks** — `\n` and `\r\n` are normalized to spaces before chunking to prevent API errors on multiline text

### v1.3.0
- 📄 **File upload** — extract text directly from PDF, DOC and DOCX files using pdf.js and mammoth.js (browser-only, no backend required)
- 🎵 **MP3 export** — audio can now be exported as MP3 in addition to WAV
- 🔧 **Refactor** — extracted audio utilities to `core/utils/audio.utils.ts`, file utilities to `core/utils/file.utils.ts`, and download/retry logic to a dedicated `PlayerService` scoped to the feature
- 📁 **Project structure** — reorganized feature folder into `components/` and `services/` subfolders

### v1.2.0
- ⚡ **Batch processing** — TikTok TTS requests are processed in batches of 3 to avoid rate limiting. Google TTS in batches of 5
- 🔄 **Automatic retry** — failed chunks are retried automatically (TikTok: 3 attempts, Google: 2 attempts) with exponential backoff before being discarded
- 🔇 **Silent chunk failure** — if a chunk fails after all retries, playback continues with the remaining chunks instead of stopping entirely

### v1.1.0
- ⚡ **Instant export** — audio buffer is pre-merged in the background while playing, export is now instantaneous
- 🔧 **Fixed chunks signal** — replaced `.map()` on sparse arrays with local array + spread update for correct Angular reactivity
- 🔇 **Fixed stop error** — suppressed false `onerror` triggered when stopping playback
- 📦 **Azure Functions** — migrated from local Express proxy to Azure Functions for serverless deployment
- 🚀 **CI/CD** — automated deployment via GitHub Actions on every push to main
- ✅ **Voice validation** — invalid/unavailable voices are filtered on startup and cached in memory

---

## 👨‍💻 Author

**Juan Sebastián Cárdenas** — Backend .NET developer transitioning to Full Stack  
Built as a learning project for Angular, Azure, and CI/CD pipelines.

Dedicated to **Pin** ❤️

---

## 📄 License

MIT