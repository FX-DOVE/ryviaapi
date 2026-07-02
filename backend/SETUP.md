# Local Whisper Setup (faster-whisper)

The pipeline's third-tier transcription fallback runs **faster-whisper** entirely locally —
no API key, no network request, no daily quota. This document explains how to set it up on
your **Windows dev machine** and your **Linux VPS**.

---

## Why faster-whisper?

`faster-whisper` is a CTranslate2 re-implementation of OpenAI Whisper. On CPU-only machines
(no GPU) it is significantly faster than the original `openai-whisper` package and ships
as a **pure-Python wheel** — no C++ compiler required on either Windows or Linux.

---

## Requirements

| Requirement | Version |
|---|---|
| Python | **3.9 – 3.12** (3.13 not yet supported by all CTranslate2 wheels as of mid-2026) |
| pip | Any recent version |
| Internet | Required on **first run only** per model size (Hugging Face download) |
| GPU | ❌ Not required — `device="cpu"` is set by default |

> **Python version note:** Verify with `python --version` (Windows) or `python3 --version`
> (Linux). If you have 3.13 and wheels are unavailable, pin to 3.11:
> `py -3.11 -m venv whisper-env` (Windows) or `python3.11 -m venv whisper-env` (Linux).

---

## Setup: Windows (Dev Machine)

Run these commands from the **`backend/`** directory of the project.

```powershell
# 1. Navigate to the backend folder
cd "C:\Users\FXDOVE\Desktop\apivideo pipline\backend"

# 2. Create a project-scoped Python virtual environment
python -m venv whisper-env

# 3. Activate the venv (required only for the install step below)
whisper-env\Scripts\activate

# 4. Install faster-whisper
pip install faster-whisper

# 5. Verify installation
python -c "from faster_whisper import WhisperModel; print('faster-whisper OK')"

# 6. Deactivate when done
deactivate
```

The venv is now at `backend/whisper-env/`. The Node backend uses
`whisper-env\Scripts\python.exe` automatically — **no activation needed at runtime**,
the full path to the executable is resolved directly.

---

## Setup: Linux VPS

Run these commands from the **`backend/`** directory of the project.

```bash
# 1. Navigate to the backend folder
cd /var/www/ai-video-factory/backend   # adjust path if different

# 2. Ensure Python 3 and venv are available
sudo apt install -y python3 python3-venv python3-pip   # Ubuntu/Debian

# 3. Create a project-scoped Python virtual environment
python3 -m venv whisper-env

# 4. Activate the venv (required only for the install step below)
source whisper-env/bin/activate

# 5. Install faster-whisper
pip install faster-whisper

# 6. Verify installation
python -c "from faster_whisper import WhisperModel; print('faster-whisper OK')"

# 7. Deactivate when done
deactivate
```

The venv is now at `backend/whisper-env/`. The Node backend uses
`whisper-env/bin/python` automatically.

---

## Environment Variables

After completing the install steps above, **no env vars are required** — the defaults
resolve the venv paths automatically based on `process.platform`.

However, you can override them in your `.env` if needed (e.g. the venv is in a
non-standard location):

```env
# Absolute path to the venv Python executable
# Windows default: <backend>/whisper-env/Scripts/python.exe
# Linux default:   <backend>/whisper-env/bin/python
LOCAL_WHISPER_PYTHON=

# Absolute path to transcribe.py
# Default: <backend>/scripts/transcribe.py
LOCAL_WHISPER_SCRIPT=

# Model size: tiny | base | small | medium | large-v3
# Default: small  (recommended for CPU-only -- ~480 MB, good accuracy)
LOCAL_WHISPER_MODEL=small
```

Add the real values to your actual `.env` on **both machines** if you override any of them.

---

## Model Size Guide

| Model | Size (approx) | Speed (CPU) | Accuracy |
|---|---|---|---|
| `tiny` | ~75 MB | Fastest | Lower |
| `base` | ~145 MB | Fast | Moderate |
| `small` | ~480 MB | Good | **Good (default)** |
| `medium` | ~1.5 GB | Slow | High |
| `large-v3` | ~3 GB | Very slow | Highest |

For CPU-only machines with no GPU, **`small` is the recommended default**. Do not use
`medium` or `large-v3` unless you have a GPU or are willing to wait several minutes per
transcription.

---

## First-Run Model Download

> **Important — read before your first test run.**

The first time you transcribe with a given model size, `faster-whisper` downloads the
model weights from **Hugging Face** automatically. This is a **one-time cost per model
per machine**:

- `small` model: ~480 MB download, may take 1–5 minutes depending on your connection.
- The download happens inside the Python process; the Node.js pipeline will appear to
  "hang" during this time — **this is normal**, not a bug or deadlock.
- Subsequent runs use the cached weights and start in seconds.

To pre-warm the model (do this once before relying on it in production), run the
script manually from the `backend/` directory:

```powershell
# Windows
whisper-env\Scripts\python.exe scripts\transcribe.py path\to\"C:\Users\FXDOVE\Downloads\tts-eve-1782252610009.wav"

"C:\Users\FXDOVE\Downloads\tts-eve-1782252610009.wav"
```bash
# Linux
whisper-env/bin/python scripts/transcribe.py "C:\Users\FXDOVE\Downloads\tts-eve-1782252610009.wav"
```

You will see download progress printed to stderr in the terminal. Once complete, the
cache is stored in the default Hugging Face cache directory:
- **Windows:** `%USERPROFILE%\.cache\huggingface\`
- **Linux:** `~/.cache/huggingface/`

---

## Windows vs Linux: Key Differences

| | Windows | Linux |
|---|---|---|
| Python command | `python` | `python3` |
| Venv create | `python -m venv whisper-env` | `python3 -m venv whisper-env` |
| Venv activate (manual) | `whisper-env\Scripts\activate` | `source whisper-env/bin/activate` |
| Python exe (auto, by Node) | `whisper-env\Scripts\python.exe` | `whisper-env/bin/python` |
| Env var override needed? | No (auto-detected) | No (auto-detected) |

The Node backend detects `process.platform === 'win32'` and picks the right path
automatically. You only need `LOCAL_WHISPER_PYTHON` in `.env` if you put the venv
somewhere non-standard.

---

## Verifying the Full Pipeline

To confirm local Whisper is wired correctly as the third-tier fallback, temporarily blank
out both `OPENAI_API_KEY` and `GEMINI_API_KEY` in your `.env` and submit a job. You
should see in the logs:

```
[Transcription] OpenAI failed: OPENAI_API_KEY is missing. Falling back to Gemini...
[Transcription] Gemini failed: GEMINI_API_KEY is missing. Falling back to local Whisper...
[Transcription] Attempting Local Whisper (faster-whisper, CPU)...
[Transcription] [local-whisper] Loading model 'small' (device=cpu, compute_type=int8)...
[Transcription] [local-whisper] Detected language 'en' (probability 0.99)
```

---

## Troubleshooting

**`Local Whisper venv not found at: .../whisper-env/...`**
You have not created the venv yet. Follow the setup steps above for your OS.

**`Error: faster-whisper is not installed in this Python environment`**
You created the venv but forgot to run `pip install faster-whisper` inside it.
Re-run from step 3 in the setup instructions above.

**`pip install faster-whisper` fails with a compilation error**
Your Python version may be 3.13. Use Python 3.11 instead:
- Windows: `py -3.11 -m venv whisper-env`
- Linux: `python3.11 -m venv whisper-env` (install with `sudo apt install python3.11-venv`)

**Transcription is very slow**
Expected on first run (model download). For subsequent runs: consider switching to
`LOCAL_WHISPER_MODEL=tiny` or `base` if speed matters more than accuracy.

**Connection error during model download on VPS**
Your VPS may not have outbound HTTPS access to Hugging Face. Pre-download the model on
your dev machine and copy the cache directory to the VPS:
- Copy `%USERPROFILE%\.cache\huggingface\` (Windows) to `~/.cache/huggingface/` (Linux).
