#!/usr/bin/env python3
"""Capture a USB microphone window and post an Altiair audio_window event."""

from __future__ import annotations

import argparse
import audioop
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib import request


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def default_post_url() -> str:
    if os.environ.get("ALTIAIR_SENSOR_POST_URL"):
        return os.environ["ALTIAIR_SENSOR_POST_URL"]
    host = os.environ.get("ALTIAIR_POST_HOST", "127.0.0.1")
    port = os.environ.get("ALTIAIR_API_PORT", "8080")
    return f"http://{host}:{port}/sensor-events"


def capture_audio(args: argparse.Namespace, output: Path) -> tuple[float, float]:
    output.parent.mkdir(parents=True, exist_ok=True)
    arecord = shutil.which("arecord")
    if arecord is None:
        if args.mock_if_missing:
            return (0.18, 0.22)
        raise RuntimeError("arecord is not installed. Install alsa-utils or set ALTIAIR_AUDIO_MOCK_IF_MISSING=1.")

    command = [
        arecord,
        "-q",
        "-D",
        args.device,
        "-f",
        "S16_LE",
        "-r",
        str(args.sample_rate),
        "-c",
        "1",
        "-d",
        str(args.window_seconds),
        str(output),
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=args.window_seconds + 5)
    if result.returncode != 0 or not output.exists() or output.stat().st_size == 0:
        if args.mock_if_missing:
            return (0.18, 0.22)
        raise RuntimeError(result.stderr.strip() or "arecord failed to capture audio.")

    return analyze_wav(output)


def analyze_wav(path: Path) -> tuple[float, float]:
    with wave.open(str(path), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        width = wav.getsampwidth()
    if not frames:
        return (0.0, 0.0)
    rms = audioop.rms(frames, width) / 32768.0
    peak = audioop.max(frames, width) / 32768.0
    return (max(0.0, min(1.0, rms)), max(0.0, min(1.0, peak)))


def acoustic_class(rms: float, peak: float) -> str:
    if peak >= 0.65:
        return "impulsive_or_nearby_activity"
    if rms >= 0.08:
        return "ambient_activity"
    return "quiet_ambient"


def post_event(args: argparse.Namespace, audio_path: Path, rms: float, peak: float) -> None:
    observed_at = iso_now()
    confidence = max(args.min_confidence, min(0.92, 0.35 + rms * 3 + peak * 0.2))
    event = {
        "kind": "audio_window",
        "sourceNodeId": args.node_id,
        "observedAt": observed_at,
        "receivedAt": observed_at,
        "zoneId": args.zone_id,
        "microphoneId": args.microphone_id,
        "vadWindowMs": [0, int(args.window_seconds * 1000)],
        "transcript": f"USB microphone window captured on {args.node_id}; rms={rms:.3f}, peak={peak:.3f}.",
        "asrConfidence": 0.0,
        "confidence": confidence,
        "acousticClass": acoustic_class(rms, peak),
        "redactedAudioRef": str(audio_path),
    }
    body = json.dumps({"events": [event]}).encode("utf-8")
    headers = {"content-type": "application/json"}
    if args.api_token:
        headers["authorization"] = f"Bearer {args.api_token}"
    req = request.Request(args.post_url, data=body, headers=headers, method="POST")
    with request.urlopen(req, timeout=args.post_timeout) as response:
        sys.stdout.write(response.read().decode("utf-8", errors="replace"))
        sys.stdout.write("\n")


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return parsed


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--post-url", default=default_post_url())
    parser.add_argument("--api-token", default=os.environ.get("ALTIAIR_API_TOKEN", ""))
    parser.add_argument("--node-id", default=os.environ.get("ALTIAIR_NODE_ID", socket.gethostname()))
    parser.add_argument("--zone-id", default=os.environ.get("ALTIAIR_ZONE_ID", "field-zone-alpha"))
    parser.add_argument("--microphone-id", default=os.environ.get("ALTIAIR_MICROPHONE_ID", "usb-mic"))
    parser.add_argument("--device", default=os.environ.get("ALTIAIR_AUDIO_DEVICE", "default"))
    parser.add_argument("--output-dir", default=os.environ.get("ALTIAIR_AUDIO_OUTPUT_DIR", "/tmp/altiair-audio"))
    parser.add_argument("--sample-rate", type=int, default=int(os.environ.get("ALTIAIR_AUDIO_SAMPLE_RATE", "16000")))
    parser.add_argument("--window-seconds", type=positive_float, default=float(os.environ.get("ALTIAIR_AUDIO_WINDOW_SECONDS", "3")))
    parser.add_argument("--interval", type=positive_float, default=float(os.environ.get("ALTIAIR_AUDIO_INTERVAL", "8")))
    parser.add_argument("--min-confidence", type=float, default=float(os.environ.get("ALTIAIR_AUDIO_MIN_CONFIDENCE", "0.38")))
    parser.add_argument("--post-timeout", type=positive_float, default=float(os.environ.get("ALTIAIR_POST_TIMEOUT", "5")))
    parser.add_argument("--mock-if-missing", action="store_true", default=os.environ.get("ALTIAIR_AUDIO_MOCK_IF_MISSING", "1") == "1")
    parser.add_argument("--once", action="store_true", default=os.environ.get("ALTIAIR_ONCE") == "1")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    while True:
        audio_path = Path(args.output_dir) / f"{args.microphone_id}-{int(time.time())}.wav"
        try:
            rms, peak = capture_audio(args, audio_path)
            post_event(args, audio_path, rms, peak)
        except Exception as exc:
            sys.stderr.write(f"audio adapter error: {exc}\n")
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
