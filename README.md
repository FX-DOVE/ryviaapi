# AI Video Factory V3 — Full System Documentation

A production-ready SaaS AI Video Generation Pipeline. Submit a raw text script or a prompt → get a fully-produced, high-definition MP4 video with custom narration, synchronized subtitles, semantic visual clips (newly generated or intelligently reused), and professional transition transformations.

---

## 1. System Architecture Overview

```
                                      ┌────────────────────────────────┐
                                      │        React Dashboard         │
                                      │      (Vite Frontend App)       │
                                      └────────────────┬───────────────┘
                                                       │  HTTP / Socket.io
                                                       ▼
                                      ┌────────────────────────────────┐
                                      │      Nginx Reverse Proxy       │
                                      └────────────────┬───────────────┘
                                                       │
                                                       ▼
                                      ┌────────────────────────────────┐
                                      │    Node.js Express REST API    │
                                      │      (Port 3001 / Socket 3002) │
                                      └───────┬────────────────┬───────┘
                                              │                │
                                              ▼                ▼
                                   ┌──────────────┐      ┌─────────────┐
                                   │   MongoDB    │      │    Redis    │
                                   │ Database Core│      │ BullMQ Hub  │
                                   └──────────────┘      └──────┬──────┘
                                                                │
                 ┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
                 ▼                                              ▼                                              ▼
        ┌──────────────────┐                           ┌──────────────────┐                           ┌──────────────────┐
        │  Script Worker   │                           │   Audio Worker   │                           │  Prompt Worker   │
        │  (scriptQueue)   │                           │   (audioQueue)   │                           │  (promptQueue)   │
        └────────┬─────────┘                           └────────┬─────────┘                           └────────┬─────────┘
                 │                                              │                                              │
                 │ Parses script,                               │ Generates TTS audio                          │ Generates visual
                 │ merges scenes via                            │ & runs STT alignment                         │ prompts via LLMs;
                 │ Location/Emotion/                            │ (OpenAI -> Gemini ->                         │ triggers the SaaS
                 │ Character keywords                           │ local faster-whisper)                        │ AI Planning Layer
                 ▼                                              ▼                                              ▼
        ┌──────────────────┐                           ┌──────────────────┐                           ┌──────────────────┐
        │  Render Worker   │                           │   Upload Worker  │                           │   Alert Worker   │
        │ (renderingQueue) │                           │  (uploadQueue)   │                           │(notificationQueue)
        └────────┬─────────┘                           └────────┬─────────┘                           └────────┬─────────┘
                 │                                              │                                              │
                 │ Runs single-turn                             │ Uploads outputs to                           │ Emits real-time
                 │ Grok image/video,                            │ Cloudflare R2 / S3;                          │ updates to UI;
                 │ applies transitions                          │ cleans local temp                            │ sends final mail
                 │ and FFmpeg assembly                          │ workspace storage                            │ to notify client
                 ▼                                              ▼                                              ▼
        ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
        │                                             System Output Assets                                             │
        │                                  (final.mp4, subtitles.srt, thumbnail.jpg)                                  │
        └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure & Key Files

Here is a map of the key directories and files in the workspace:

```
ai-video-factory/
├── .env.example                     # Global configuration template
├── .env                             # Active environment configuration
├── docker-compose.yml               # Development services (MongoDB, Redis)
├── ecosystem.config.js              # PM2 process configuration for deployment
├── pipeline.py                      # Standalone Python semantic clip-matching & FFmpeg pipeline
├── grok_generator.py                # Python API wrapper and simulator for Grok CLI generations
├── guide.md                         # Quick installation summary & Whisper configuration
├── clip_registry.db                 # SQLite database for semantic video clip embeddings
├── backend/
│   ├── SETUP.md                     # Deep setup guide for Local Whisper
│   ├── package.json                 # Backend Node dependencies & script configurations
│   ├── index.js                     # Backend application entry point
│   ├── scripts/
│   │   └── transcribe.py            # Local faster-whisper Python transcription driver
│   └── src/
│       ├── app.js                   # Express application setup, Socket.io integration
│       ├── config/
│       │   ├── db.js                # MongoDB connection logic
│       │   ├── redis.js             # Redis connection logic
│       │   ├── socket.js            # Socket.io configuration and event emitters
│       │   └── constants.js         # Core timeouts, platform parameters, and status enums
│       ├── controllers/
│       │   ├── jobController.js     # API routing logic for job CRUD, streams, retries, stops
│       │   ├── providerController.js # Managing built-in & custom LLM reasoning providers
│       │   └── authController.js    # JWT-based authorization and workspace management
│       ├── middleware/
│       │   ├── auth.js              # HTTP Request validation middleware
│       │   └── upload.js            # Multer multipart form-data upload configuration
│       ├── models/
│       │   ├── Job.js               # MongoDB Schema for video jobs, progress, config, scripts
│       │   ├── Scene.js             # MongoDB Schema for scene metadata, prompts, assets
│       │   └── ProviderConfig.js    # Custom LLM API credentials & Priority order routing
│       ├── providers/
│       │   ├── providerFactory.js   # Generates adapter instances ('grok' / 'local-gpu')
│       │   ├── grokProvider.js      # Headless Grok CLI integration, ANSI strip, paths resolver
│       │   ├── promptProvider.js    # Built-in 6-tier LLM fallback builder for scene prompts
│       │   ├── image/               # Image adapters loader wrapper
│       │   ├── video/               # Video animation adapters loader wrapper
│       │   └── storage/
│       │       └── S3StorageProvider.js # AWS S3/Cloudflare R2 integration (supports Simulation fallback)
│       ├── queues/
│       │   └── queueManager.js      # BullMQ publisher wrapper for step-by-step worker triggers
│       ├── services/
│       │   ├── aiPlannerService.js  # SaaS cost calculator (routes scene actions: reuse/generate/skip)
│       │   ├── assetReuseService.js # Matches scene visual prompts against DB with sentence embeddings
│       │   ├── transcriptionService.js # 3-tier fallback transcription & sentence-word timestamp alignment
│       │   ├── videoAssembler.js    # Standardized FFmpeg concat/audio overlay/subtitle burning script
│       │   ├── voiceService.js      # TTS generator wrapper (Edge-TTS / Elevenlabs)
│       │   └── subtitleService.js   # Synchronized subtitle SRT generation & burn-in styling
│       └── workers/
│           ├── schedulerWorker.js   # BullMQ worker instances for the 6 pipeline queues
│           └── workerSteps.js       # Complete execution steps called by BullMQ queues
└── frontend/
    ├── package.json                 # React Vite frontend dependencies
    ├── index.html                   # Entry HTML structure
    ├── vite.config.js               # Vite configurations and server routing proxy
    └── src/
        ├── App.jsx                  # Main routing hub and protected route wrappers
        ├── main.jsx                 # Client entry point
        ├── api/
        │   ├── jobs.js              # Axios wrapper targeting job routes
        │   └── providers.js         # Axios wrapper targeting custom AI keys management
        ├── store/
        │   └── useAppStore.js       # Zustand global store for state, logs, socket updates
        ├── hooks/
        │   └── useSocket.js         # Socket.io hooks for global and job-specific real-time progress
        ├── components/              # Reusable UI component cards, widgets, sidebars
        └── pages/                   # SaaS platform view layout files
```

---

## 3. The Video Generation Pipeline: Step-by-Step

When a user submits a script or document via the React dashboard, the application kicks off a modular, multi-tier queue-based pipeline managed by BullMQ:

```
[User Action] Submit Script
      │
      ▼
┌──────────────┐
│ scriptQueue  │ ──> Step 1: Script Processing & Scene Merger
└──────────────┘
      │
      ▼
┌──────────────┐
│  audioQueue  │ ──> Step 2: TTS Voiceover Audio Generation & STT Transcription Fallback Chain
└──────────────┘
      │
      ▼
┌──────────────┐
│ promptQueue  │ ──> Step 3: LLM Prompt Generation + AI Planning (Evaluate Reuse vs. Generation)
└──────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ parallel processing per scene   │
│ (BullMQ queue workers)          │
│                                 │
│    ┌──────────────┐             │
│    │  imageQueue  │ ────────────┼─> Step 4: Headless Grok CLI Image Generation
│    └──────┬───────┘             │
│           │                     │
│           ▼                     │
│    ┌──────────────┐             │
│    │  videoQueue  │ ────────────┼─> Step 5: Headless Grok CLI Image-to-Video Animation
│    └──────────────┘             │
└─────────────────────────────────┘
      │
      ▼
┌──────────────┐
│renderingQueue│ ──> Step 6: Pad Scene Videos + Concat Assembly + Burn Subtitles
└──────────────┘
      │
      ▼
┌──────────────┐
│ uploadQueue  │ ──> Step 7: SaaS Upload & Temporary Workspace Files Cleanup
└──────────────┘
      │
      ▼
┌──────────────────┐
│notificationQueue │ ──> Step 8: Client Push Alert & In-App Completion Update
└──────────────────┘
```

### Step 1: Script Processing & Scene Merger (`processScriptStep`)
1. Cleans the text and parses context. If a raw prompt is provided instead of a script, it uses the reasoning provider to generate a structured narrative script first.
2. Runs the **Scene Merger** heuristics (detailed in `pipeline.py`). It groups adjacent transcript segments into cohesive scenes. A scene division triggers only when:
   - **Location Changes**: Triggers on location keywords like `motor park`, `mansion`, `workshop`, `street`, etc.
   - **Emotion Shifts**: Triggers on emotion markers like `abandonment`, `poverty`, `grief`, `regret`, etc.
   - **Character Changes**: Triggers when the set of capitalized proper nouns changes.
   - **Time Jump**: Triggers on time jump phrases like `years later`, `the next day`, `eventually`, etc.
3. Limits the total scene count to a **maximum of 40 scenes** (and minimum of 25 for long narratives). If the scene count exceeds 40, it iteratively merges the shortest adjacent scenes until the target count is satisfied.

### Step 2: Audio Generation & Transcription (`processAudioStep`)
1. Takes the parsed narration script and feeds it to the Text-to-Speech (TTS) engine.
   - **Edge-TTS**: Default free offline engine using Microsoft Edge's cloud read aloud API.
   - **ElevenLabs**: Premium TTS engine using high-fidelity clone voice presets (requires API key).
2. Uploads the full audio file to object storage and records it as a job asset.
3. Transcribes the narration audio to get word-level alignment markers using the **3-Tier Transcription Fallback Chain**:
   - **Tier 1 (OpenAI Whisper)**: Uses `whisper-1` via the official API (requires `OPENAI_API_KEY`).
   - **Tier 2 (Gemini)**: Encodes audio into base64 and prompts `gemini-2.5-flash` to transcribe it into structured JSON with timestamps (requires `GEMINI_API_KEY`).
   - **Tier 3 (Local Whisper)**: Spawns Python executing `faster-whisper` locally via virtual environment without relying on external API keys.
4. Aligning: Matches sentences from the original clean script against the speech-to-text words, calculating exact timestamp boundaries (`startTime` and `endTime`) for each scene block.

### Step 3: Prompt Building & AI Planning (`processPromptStep`)
1. Uses the reasoning provider (**Google Gemini `gemini-3.5-flash-lite`**) to write detailed visual descriptions for each scene. The director runs on Gemini via OpenAI-compatible endpoints, with an optional explicit `AI_API_ENDPOINT` override for a self-hosted or alternate OpenAI-compatible endpoint.
2. Triggers the **SaaS AI Planning Layer** (`aiPlannerService.js`) to evaluate and optimize computational costs:
   - **`reuse`**: Runs a semantic search using Sentence Transformers (`all-MiniLM-L6-v2`) to compare the scene's prompt against a database of pre-existing video clips. If a match exceeds `0.65` similarity, it plans to reuse that clip, saving credit costs.
   - **`image_only`**: Identifies if the prompt is a static concept (like a map, chart, logo, or diagram) and bypasses video generation to conserve GPU credits.
   - **`skip`**: Skips rendering completely if the scene is too short and has no voice narration.
   - **`generate`**: Plans a full visual pipeline (1 image generation + 1 image-to-video animation).

### Step 4: Image Generation (`processImageStep`)
1. Allocates a GPU task to create a high-quality still image using the scene visual prompt.
2. Calls the Image Generation Adapter via `GrokProvider` (or `LocalGpuProvider` if ComfyUI is active).
3. Uploads the generated image directly to S3/R2 and saves it as a scene asset.

### Step 5: Video Animation (`processVideoStep`)
1. Takes the saved still image and animates it into a 10-second cinematic video clip.
2. Feeds the image to the Video Generation Adapter (e.g. Grok's image-to-video tool).
3. Uploads the completed video clip (.mp4) to the cloud storage and updates the Scene status to `done`.

### Step 6: Rendering & Concat Assembly (`processRenderingStep`)
1. Downloads the narration audio track, all scene video clips, and subtitle SRT files locally into the worker's temporary directory.
2. **Standardizes and Loops Clips**: Because a scene's animation length (e.g. 10s) might differ from its narration audio duration, it runs each scene video through FFmpeg:
   - Sets `-stream_loop -1` to repeat the video.
   - Enforces standardized properties: 1920x1080 resolution, 25fps, H.264 video codec, YUV420p pixel format.
   - Truncates the clip at the exact narration duration (`-t duration`).
3. Writes the paths of all standard-compliant scene clips to a `concat.txt` file.
4. **Assembly**: Merges all scene videos using the FFmpeg concat demuxer and maps the narration track overlay.
5. **Subtitle Burn-in**: If subtitle burn-in is active, it runs FFmpeg using the `subtitles` filter with custom font styles (e.g., Arial, size 16, yellow alignment) to render SRT entries directly onto the frames.
6. **Optimizations**: Applies `-movflags +faststart` to move metadata (moov atom) to the beginning of the file, allowing immediate playback in the dashboard player without downloading the entire file first.
7. Extracts a thumbnail image (`thumbnail.jpg`) from the final compiled file.

### Step 7: Cloud Upload & Cleanup (`processUploadStep`)
1. Uploads the assembled `final.mp4` and `thumbnail.jpg` to object storage.
2. Updates the Job status in MongoDB to `completed` and records file sizes and storage metrics.
3. Deletes all local temporary video and audio workspaces to free up server disk space.
4. Enqueues a notification task to deliver an email/alert to the user.

---

## 4. Grok CLI Headless Integration

The system communicates with xAI's Grok via the `GrokProvider` wrapper (`grokProvider.js`). Because the interactive console version of Grok uses a TUI (Terminal User Interface) that emits escape codes and waits for user keystrokes, the Node.js process executes Grok in **single-turn, headless mode**:

```js
const proc = spawn(
  'grok',
  [
    '--single', prompt,
    '--output-format', 'plain',
    '--always-approve'
  ]
);
```

### Parsing Outputs and Fallbacks
1. **ANSI Cleaning**: Filters out raw terminal escape sequences, spinner symbols, and colors using a regular expression (`stripAnsi`) so that path-matching operations run on clean text.
2. **Drive Letter Path Matching**: Searches stdout using a regular expression designed to extract absolute directory structures:
   `FILE_PATH_RE = /([A-Za-z]:[\\/]|\/)[^\r\n"']+?\.(png|jpg|jpeg|mp4|webm)/gi`
   It automatically handles URL-encoded strings (decoding `%20` patterns) and resolves drive prefixes.
3. **Session Scan Fallback**: If Grok exits cleanly but does not print the output path to stdout, the provider scans Grok's home directory config path (`~/.grok/sessions/`) for recently modified media files matching the time window of the current generation.

### Manifest-Based Batch Generation
To improve throughput, the provider can request Grok to execute a batch of media operations simultaneously using a JSON configuration file:
- Node writes a manifest structure to disk containing:
  - `image_prompt` / `video_prompt` for each scene.
  - Target absolute file locations for output images and videos (`scene_001.jpg`, `scene_001.mp4`).
- It runs Grok with a prompt pointing to this file:
  `Please process the batch of media generation tasks defined in this JSON file: "/path/to/manifest.json"...`
- The system scales execution timeouts dynamically (`GROK_TIMEOUT_PER_SCENE = 60000ms` per scene in the batch).

### Error & Timeout Polling Fallbacks
- **429 Rate Limits**: Catches HTTP/exhausted errors in Grok's stderr, triggering an exponential backoff retry loop (waits 10s, 20s, 40s, 80s up to 5 attempts).
- **Connect Timeout**: Retries the generation command after a 30-second delay.
- **Read Timeout**: If the socket times out during a long render, Node does not crash. It waits 60 seconds, then polls the Grok API endpoint (`/video/generations/{id}`) every 15 seconds to check if the background render has completed, downloading the file once the API reports `success`.

---

## 5. Local Whisper Setup (`faster-whisper`)

If both OpenAI and Gemini API keys are missing or exhausted, the transcription fallback defaults to a local Python execution using `faster-whisper`.

### Virtual Environment Configuration
To isolate Python library dependencies, the system creates a virtual environment inside the backend directory:
- **Windows**: `backend\whisper-env\Scripts\python.exe`
- **Linux**: `backend/whisper-env/bin/python`

Node.js reads these defaults automatically. You can override these paths or select a different Whisper model inside your `.env` configuration file:
```env
LOCAL_WHISPER_PYTHON=C:\Users\FXDOVE\Desktop\apivideo pipline\backend\whisper-env\Scripts\python.exe
LOCAL_WHISPER_SCRIPT=C:\Users\FXDOVE\Desktop\apivideo pipline\backend\scripts\transcribe.py
LOCAL_WHISPER_MODEL=small
```

### Pre-Warming huggingface cache
On its very first execution, Whisper will download model weights from Hugging Face:
- `small` model: ~480 MB download.
- Subsequent runs read directly from the local disk cache:
  - **Windows**: `%USERPROFILE%\.cache\huggingface\`
  - **Linux**: `~/.cache/huggingface/`
- Run the driver script manually once in the terminal to download the weights before putting the pipeline into production:
  `whisper-env\Scripts\python.exe scripts\transcribe.py sample_audio.wav`

---

## 6. Simulation & Mock Modes

For development environments lacking active S3 buckets or Grok CLI binaries, the codebase supports simulation fallbacks:

### S3 Storage Simulation
If `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` are not set in the environment, the `S3StorageProvider` automatically switches to mock mode:
- File uploads bypass the AWS client and simulate progress.
- Generates locally-resolvable URLs formatted as `/mock-storage/{key}`.
- Allows testing the UI and workers out-of-the-box without cloud fees.

### Grok Generation Simulation
Inside `grok_generator.py`, the system simulates API behaviors, timeouts, and network exceptions:
- Set `GROK_API_KEY=mock_key` in `.env` to enable simulation.
- `scene_429`: Simulates rate limiting by returning HTTP 429 for the first two requests, then succeeds on the third.
- `scene_timeout_connect` & `scene_timeout_read`: Simulates connection/read timeouts to verify that the BullMQ retry and polling logic works.
- `scene_fail`: Simulates an internal rendering failure (HTTP 500) to test how the system logs and bubbles up errors.

---

## 7. Configuration Guide (`.env` Parameters)

Copy `.env.example` to `.env` and set the following parameters:

| Variable | Recommended Value | Description |
|---|---|---|
| `NODE_ENV` | `development` / `production` | Node server environment mode |
| `PORT` | `3001` | Express API listener port |
| `SOCKET_PORT` | `3002` | Real-time events socket listener port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/ai-video-factory` | Connection string for MongoDB |
| `REDIS_URL` | `redis://127.0.0.1:6379` | BullMQ message hub broker link |
| `STORAGE_ROOT` | `./storage` | Base directory for storing temporary output files |
| `GROK_CMD` | `grok` / `python grok_generator.py` | Command to invoke the Grok CLI / simulator |
| `GROK_TIMEOUT_IMAGE` | `1800000` | Max timeout for image generation (30 min) |
| `GROK_TIMEOUT_VIDEO` | `1800000` | Max timeout for video animation (30 min) |
| `BATCH_SIZE` | `30` | Maximum parallel scene steps |
| `JOB_STORAGE_QUOTA_BYTES`| `2147483648` | Disk limit per user workspace (e.g. 2 GB) |
| `TTS_PROVIDER` | `edge-tts` / `elevenlabs` | Select speech generator engine |
| `ELEVENLABS_API_KEY` | _(Optional)_ | ElevenLabs authentication credential |
| `GEMINI_API_KEY` | _(Optional)_ | Gemini token for script parsing & transcription fallback |
| `OPENAI_API_KEY` | _(Optional)_ | OpenAI Whisper API authentication credential |
| `PROVIDER_ENCRYPTION_KEY`| _(64-char Hex String)_ | Key used to encrypt custom provider API tokens in MongoDB |

---

## 8. Installation & Setup Guide

### Windows Local Environment Setup
Run these commands from the root directory of the workspace:

```powershell
# 1. Start MongoDB & Redis via Docker
docker-compose up -d

# 2. Configure Backend Env
cd backend
cp ../.env.example .env
# Open backend/.env and populate your configurations

# 3. Install Backend Node Modules
npm install

# 4. Create the Local Whisper Python Virtual Environment
python -m venv whisper-env
whisper-env\Scripts\activate
pip install faster-whisper
deactivate

# 5. Pre-warm Whisper (Pre-downloads weights from Hugging Face)
whisper-env\Scripts\python.exe scripts\transcribe.py ..\sample_audio.wav

# 6. Start the API Server & Queue Workers
npm run dev

# 7. Configure and Start the React Frontend Dashboard (in a new terminal)
cd ../frontend
npm install
npm run dev
```

---

## 9. Production VPS Deployment (Ubuntu 24.04)

### 1. System Dependencies Installation
```bash
# Update repositories and install system programs
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx ffmpeg git curl python3 python3-venv python3-pip

# Install Node.js 20 via Node Version Manager (NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20

# Install PM2 Process Manager globally
npm install -g pm2
```

### 2. MongoDB & Redis Setup
```bash
# Install and run MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod

# Install and run Redis Server
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

### 3. Application Deployment & Setup
```bash
# Set up workspace directory
sudo mkdir -p /var/www/ai-video-factory
sudo chown $USER:$USER /var/www/ai-video-factory
cd /var/www/ai-video-factory

# Clone repo and install backend dependencies
git clone <your-git-repository-url> .
cd backend
npm install --omit=dev

# Set up the Python virtual environment for Local Whisper
python3 -m venv whisper-env
source whisper-env/bin/activate
pip install faster-whisper
deactivate

# Set up environment file
cp ../.env.example .env
nano .env # Set your production environment configurations

# Build frontend static files
cd ../frontend
npm install
npm run build
```

### 4. Process Manager Configuration (PM2)
The ecosystem configuration runs both the API instance and the queue workers. Start them with:
```bash
cd /var/www/ai-video-factory
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 5. Character continuity & drama / movie / anime (VPS)

For long-form drama, movie, and anime jobs on a VPS:

1. Upload character reference photos in Film Characters **before** locking/directing — locks persist the photo as the identity sheet and pass it into Qwen-Image-Edit (img2img/edit) for every keyframe.
2. Copy `.env.example` → `.env` on the VPS and fill **placeholders only** (`RUNPOD_*`, `GEMINI_API_KEY`, `S3_*`, optional `IMAGE_API_KEY` / `VIDEO_API_KEY` / `GROQ_API_KEY`). Never commit real secrets.
3. Ensure `RUNPOD_QWEN_EDIT_ENDPOINT_ID` is set — character identity conditioning requires the edit endpoint (not text-to-image alone).
4. Failed scenes no longer silently assemble: if all (or ≥50%) of scenes fail segment generation, the job fails with a clear error so you can retry after fixing GPU / refs.


### 5b. Billing, wallet & email

- **No free credits on register** — new workspaces start at `$0`. Studio balance is funded via Paystack top-ups or admin/coupon grants.
- **Top-up** — deposits credit 1:1 (`TOPUP_CREDIT_RATIO=1` in `backend/src/config/billing.js`). Example: pay $100 → $100 studio balance.
- **Job billing** — completed jobs bill `(infra × 1.25) × 2` (`JOB_MARKUP_RATE=0.25`, `JOB_BILLING_MULTIPLIER=2`). Markup and multiplier are never exposed in public cost APIs or wallet UI.
- **Coupons** — admins create codes under `/api/system/coupons`; users redeem via `POST /api/billing/coupons/redeem`.
- **Email** — set `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` / `APP_URL` in `.env`. When `EMAIL_HOST` is unset, mail is skipped safely (welcome, password reset, video ready, admin bulk).


### 5. Nginx Web Server Configuration
Copy the provided Nginx configuration file:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/ai-video-factory
# Replace YOUR_DOMAIN_OR_IP inside the configuration
sudo nano /etc/nginx/sites-available/ai-video-factory

# Enable the site configuration and restart Nginx
sudo ln -s /etc/nginx/sites-available/ai-video-factory /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. Failure Recovery & Storage Management

### Automatic Failure Recovery
If the server crashes, encounters power loss, or restarts during processing:
1. When the backend initializes, the startup hook scans MongoDB for any jobs stuck in active processing states (`preparing`, `analyzing`, `scene_generation`, `media_generation`, `assembling`, `optimizing`).
2. It resets their status to `queued` and re-submits them to BullMQ.
3. During queue execution, `getPendingScenes()` checks the database and skips any scenes already marked as `done`.
4. The generation pipeline **resumes from the last completed scene**, preventing redundant API calls and conserving GPU credits.

### Automated Storage Cleanup
A cron queue job runs daily at **02:00 AM** to manage disk usage:
- Identifies and deletes temporary workspace folder paths older than 24 hours.
- Scans MongoDB for failed jobs older than 7 days, deleting both their database records and cloud/local assets.
- If a user reaches their storage quota, the backend rejects new submissions until they delete old jobs from the history dashboard.




start all server run  npx concurrently -k -p "[{name}]" -n "API,SCHED,AI,RENDER,GPU,FRONT" -c "bgBlue,bgGreen,bgYellow,bgMagenta,bgCyan,bgRed" "npm run dev --prefix backend" "npm run worker:scheduler --prefix backend" "npm run worker:ai --prefix backend" "npm run worker:render --prefix backend" "npm run worker:gpu --prefix backend" "npm run dev --prefix frontend"
