#!/usr/bin/env python3
"""Capture a real camera frame and post it as an Altiair camera event."""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
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


def command_exists(name: str) -> bool:
    return subprocess.run(
        ["sh", "-lc", f"command -v {name} >/dev/null 2>&1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def default_capture_commands(output: Path, video_device: str | None) -> list[list[str]]:
    commands: list[list[str]] = []
    if command_exists("rpicam-still"):
        commands.append(["rpicam-still", "-n", "--immediate", "--timeout", "1000", "-o", str(output)])
    if command_exists("libcamera-still"):
        commands.append(["libcamera-still", "-n", "--immediate", "--timeout", "1000", "-o", str(output)])
    if command_exists("fswebcam"):
        commands.append(["fswebcam", "--no-banner", "-r", "1280x720", str(output)])
    if command_exists("ffmpeg") and video_device:
        commands.append([
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "v4l2",
            "-i",
            video_device,
            "-frames:v",
            "1",
            str(output),
        ])
    return commands


def find_video_device() -> str | None:
    for pattern in ("/dev/video0", "/dev/video1"):
        if Path(pattern).exists():
            return pattern
    return None


def has_camera_surface() -> bool:
    return any(Path(path).exists() for path in ("/dev/video0", "/dev/media0", "/dev/vchiq"))


def run_capture(args: argparse.Namespace, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    if args.capture_command:
        command = [part.replace("{output}", str(output)) for part in args.capture_command]
        commands = [command]
    else:
        commands = default_capture_commands(output, args.video_device or find_video_device())

    if not commands:
        raise RuntimeError("No supported camera capture command found.")

    for command in commands:
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=args.timeout)
        except Exception as exc:  # pragma: no cover - hardware path
            failures.append(f"{command[0]}: {exc}")
            continue
        if result.returncode == 0 and output.exists() and output.stat().st_size > 0:
            return
        failures.append(f"{command[0]} rc={result.returncode}: {result.stderr.strip() or result.stdout.strip()}")

    raise RuntimeError("; ".join(failures))


def post_event(args: argparse.Namespace, frame_path: Path) -> None:
    event = {
        "kind": "camera_detection",
        "sourceNodeId": args.node_id,
        "observedAt": iso_now(),
        "zoneId": args.zone_id,
        "cameraId": args.camera_id,
        "detectionClass": args.detection_class,
        "confidence": args.confidence,
        "frameRef": str(frame_path),
        "retentionPolicy": args.retention_policy,
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
    parser.add_argument("--camera-id", default=os.environ.get("ALTIAIR_CAMERA_ID", "camera-primary"))
    parser.add_argument("--detection-class", default=os.environ.get("ALTIAIR_CAMERA_DETECTION_CLASS", "camera_frame_captured"))
    parser.add_argument("--confidence", type=float, default=float(os.environ.get("ALTIAIR_CAMERA_CONFIDENCE", "1.0")))
    parser.add_argument("--retention-policy", default=os.environ.get("ALTIAIR_CAMERA_RETENTION_POLICY", "metadata_only"))
    parser.add_argument("--output-dir", default=os.environ.get("ALTIAIR_CAMERA_OUTPUT_DIR", "/tmp/altiair-camera"))
    parser.add_argument("--video-device", default=os.environ.get("ALTIAIR_VIDEO_DEVICE"))
    parser.add_argument("--timeout", type=positive_float, default=float(os.environ.get("ALTIAIR_CAMERA_TIMEOUT", "8")))
    parser.add_argument("--post-timeout", type=positive_float, default=float(os.environ.get("ALTIAIR_POST_TIMEOUT", "5")))
    parser.add_argument("--interval", type=positive_float, default=float(os.environ.get("ALTIAIR_CAMERA_INTERVAL", "5")))
    parser.add_argument("--once", action="store_true", default=os.environ.get("ALTIAIR_ONCE") == "1")
    parser.add_argument(
        "--capture-command",
        nargs="+",
        help="Custom capture command. Use {output} where the frame path should be written.",
    )
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    if not has_camera_surface() and not args.capture_command:
        sys.stderr.write("No /dev/video*, /dev/media0, or /dev/vchiq camera surface is visible.\n")
        return 2

    while True:
        frame_path = Path(args.output_dir) / f"{args.camera_id}-{int(time.time())}.jpg"
        try:
            run_capture(args, frame_path)
            post_event(args, frame_path)
        except Exception as exc:
            sys.stderr.write(f"camera adapter error: {exc}\n")
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
