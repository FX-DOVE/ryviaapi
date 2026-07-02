#!/usr/bin/env python3
"""
transcribe.py — faster-whisper transcription script for the AI Video Factory pipeline.

Usage:
    python transcribe.py <audio_file_path>

Output (stdout):
    JSON array of segment objects:
    [{"start": 0.0, "end": 5.2, "text": "..."}, ...]

Exit codes:
    0 — success, JSON written to stdout
    1 — error, message written to stderr

Environment variables:
    LOCAL_WHISPER_MODEL  — model size: tiny | base | small | medium | large-v3
                          Defaults to "small" if not set.
"""

import sys
import os
import json


def main():
    if len(sys.argv) < 2:
        print("Error: No audio file path provided.", file=sys.stderr)
        print("Usage: python transcribe.py <audio_file_path>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.isfile(audio_path):
        print(f"Error: Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    model_size = os.environ.get("LOCAL_WHISPER_MODEL", "small")
    valid_models = {"tiny", "base", "small", "medium", "large-v3", "large-v2", "large-v1"}
    if model_size not in valid_models:
        print(
            f"Error: Invalid LOCAL_WHISPER_MODEL '{model_size}'. "
            f"Valid options: {', '.join(sorted(valid_models))}",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "Error: faster-whisper is not installed in this Python environment.\n"
            "Run: pip install faster-whisper\n"
            "Or, if using the project venv: activate whisper-env first.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        f"[local-whisper] Loading model '{model_size}' (device=cpu, compute_type=int8)...",
        file=sys.stderr,
    )

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        print(f"Error: Failed to load faster-whisper model '{model_size}': {e}", file=sys.stderr)
        print(
            "Note: The first run with a new model size downloads weights from Hugging Face "
            "(one-time, ~150MB for 'small'). Ensure internet access on first use.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"[local-whisper] Transcribing: {audio_path}", file=sys.stderr)

    try:
        segments_iter, info = model.transcribe(audio_path, beam_size=5)
    except Exception as e:
        print(f"Error: Transcription failed for '{audio_path}': {e}", file=sys.stderr)
        sys.exit(1)

    print(
        f"[local-whisper] Detected language '{info.language}' "
        f"(probability {info.language_probability:.2f})",
        file=sys.stderr,
    )

    segments = []
    for seg in segments_iter:
        segments.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
            }
        )

    if not segments:
        print(
            "Warning: Transcription produced zero segments — audio may be silent or too short.",
            file=sys.stderr,
        )

    # Write JSON to stdout — this is what Node reads
    print(json.dumps(segments, ensure_ascii=False))


if __name__ == "__main__":
    main()
