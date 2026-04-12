# PinSpeech 🎙️
Text-to-Speech Studio · Powered by Pin ❤

Free text-to-speech studio that converts text to audio using TikTok TTS and Google TTS engines, with automatic chunking for unlimited text length, buffered playback, and audio export.

## 🔗 Live Demo
[PinSpeech — Try it here](https://white-glacier-0b87f900f.6.azurestaticapps.net)

---

## ✨ Features

- 🎤 **Two TTS engines** — TikTok TTS (character voices, multiple languages) and Google TTS (natural voices, 9+ languages)
- 🔍 **Voice validation** — only voices that are currently available are shown, invalid ones are filtered automatically
- 👂 **Voice preview** — listen to each voice before selecting it
- ♾️ **Unlimited text length** — text is automatically split into chunks (300 chars for TikTok, 180 for Google)
- ⚡ **Buffered playback** — starts playing after 50% of chunks are ready, downloads the rest in the background (parallel with Promise.allSettled)
- ⏸️ **Playback controls** — play, pause, resume, stop
- 🎚️ **Volume and speed control** — 0–100% volume, 0.5x to 1.5x playback speed
- 💾 **Audio export** — combines all chunks into a single WAV file using Web Audio API
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
│   │   │   └── services/
│   │   │       └── tts.service.ts    # API calls, chunking, audio export
│   │   ├── features/
│   │   │   └── tts-player/
│   │   │       ├── tts-player.component.ts    # component logic
│   │   │       ├── tts-player.component.html  # template
│   │   │       └── tts-player.component.scss  # styles
│   │   ├── shared/
│   │   │   └── models/
│   │   │       └── tts.models.ts     # interfaces and types
│   │   ├── app.component.ts
│   │   └── app.config.ts
│   ├── staticwebapp.config.json      # Azure SWA routing config
│   └── index.html
├── .github/
│   └── workflows/
│       └── azure-static-web-apps-*.yml  # CI/CD pipeline
├── .gitignore
└── README.md
```

---

## 🧠 Key Concepts

### Chunking
Both TTS APIs have character limits per request. The app automatically splits text into chunks and processes them:
- **TikTok TTS**: 300 characters per chunk
- **Google TTS**: 180 characters per chunk

### Buffered Playback
Instead of waiting for all chunks to download before playing, the app:
1. Launches all chunk downloads in parallel (`Promise.allSettled` — equivalent to `Task.WhenAll()` in C#)
2. Starts playback when 50% of chunks are ready (`Math.ceil(total * 0.5)`)
3. Continues downloading remaining chunks in the background
4. If the player reaches a chunk that hasn't arrived yet, it waits 200ms and retries

### Voice Validation
On startup, the API validates every voice by making a test request. Only voices that return a successful response are shown in the UI. Results are cached in memory for the lifetime of the Azure Function instance.

### Audio Export
Uses the Web Audio API to:
1. Decode each MP3 chunk into an `AudioBuffer`
2. Calculate total duration and allocate a combined buffer
3. Copy each chunk into the correct position
4. Encode as WAV (PCM) and trigger browser download

### CORS Solution
Both TTS endpoints block browser requests (CORS). Azure Functions act as a server-to-server proxy — server-to-server requests have no CORS restrictions, equivalent to `IHttpClientFactory` in .NET calling an external API.

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
- Audio export produces WAV format (browsers cannot natively encode MP3)
- **Chunk gap** — small pause between chunks during playback, inherent to the HTML audio element model

---

## 🔄 Changelog

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