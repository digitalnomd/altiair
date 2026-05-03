#!/usr/bin/env python3
"""Read a real RFID reader and post Altiair rfid_read events."""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import socket
import struct
import sys
import termios
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib import request


EV_KEY = 1
KEY_ENTER = 28
KEY_KPENTER = 96
KEY_LEFTSHIFT = 42
KEY_RIGHTSHIFT = 54
INPUT_EVENT = struct.Struct("llHHI")

KEYMAP = {
    2: ("1", "!"),
    3: ("2", "@"),
    4: ("3", "#"),
    5: ("4", "$"),
    6: ("5", "%"),
    7: ("6", "^"),
    8: ("7", "&"),
    9: ("8", "*"),
    10: ("9", "("),
    11: ("0", ")"),
    12: ("-", "_"),
    13: ("=", "+"),
    16: ("q", "Q"),
    17: ("w", "W"),
    18: ("e", "E"),
    19: ("r", "R"),
    20: ("t", "T"),
    21: ("y", "Y"),
    22: ("u", "U"),
    23: ("i", "I"),
    24: ("o", "O"),
    25: ("p", "P"),
    26: ("[", "{"),
    27: ("]", "}"),
    30: ("a", "A"),
    31: ("s", "S"),
    32: ("d", "D"),
    33: ("f", "F"),
    34: ("g", "G"),
    35: ("h", "H"),
    36: ("j", "J"),
    37: ("k", "K"),
    38: ("l", "L"),
    39: (";", ":"),
    40: ("'", '"'),
    41: ("`", "~"),
    43: ("\\", "|"),
    44: ("z", "Z"),
    45: ("x", "X"),
    46: ("c", "C"),
    47: ("v", "V"),
    48: ("b", "B"),
    49: ("n", "N"),
    50: ("m", "M"),
    51: (",", "<"),
    52: (".", ">"),
    53: ("/", "?"),
    57: (" ", " "),
    71: ("7", "7"),
    72: ("8", "8"),
    73: ("9", "9"),
    75: ("4", "4"),
    76: ("5", "5"),
    77: ("6", "6"),
    79: ("1", "1"),
    80: ("2", "2"),
    81: ("3", "3"),
    82: ("0", "0"),
    83: (".", "."),
}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def default_post_url() -> str:
    if os.environ.get("ALTIAIR_SENSOR_POST_URL"):
        return os.environ["ALTIAIR_SENSOR_POST_URL"]
    host = os.environ.get("ALTIAIR_POST_HOST", "127.0.0.1")
    port = os.environ.get("ALTIAIR_API_PORT", "8080")
    return f"http://{host}:{port}/sensor-events"


def post_rfid(args: argparse.Namespace, tag_id: str, read_count: int = 1) -> None:
    clean_tag = tag_id.strip()
    if not clean_tag:
        return
    event = {
        "kind": "rfid_read",
        "sourceNodeId": args.node_id,
        "observedAt": iso_now(),
        "zoneId": args.zone_id,
        "readerId": args.reader_id,
        "tagId": clean_tag,
        "antennaId": args.antenna_id,
        "readCount": read_count,
        "confidence": args.confidence,
        "providerStyle": {
            "providerName": "Altiair local RFID adapter",
            "transport": "wifi_rfid",
            "verificationMethod": "rfid_wifi_proximity",
            "isSimulated": False,
        },
    }
    if args.rssi is not None:
        event["rssi"] = args.rssi
    body = json.dumps({"events": [event]}).encode("utf-8")
    headers = {"content-type": "application/json"}
    if args.api_token:
        headers["authorization"] = f"Bearer {args.api_token}"
    req = request.Request(args.post_url, data=body, headers=headers, method="POST")
    with request.urlopen(req, timeout=args.post_timeout) as response:
        sys.stdout.write(response.read().decode("utf-8", errors="replace"))
        sys.stdout.write("\n")


def serial_candidates() -> list[str]:
    paths = []
    for pattern in ("/dev/serial/by-id/*", "/dev/ttyUSB*", "/dev/ttyACM*"):
        paths.extend(glob.glob(pattern))
    return sorted(dict.fromkeys(paths))


def open_serial(path: str, baud: int) -> int:
    fd = os.open(path, os.O_RDONLY | os.O_NOCTTY)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    speed = getattr(termios, f"B{baud}", termios.B9600)
    attrs[4] = speed
    attrs[5] = speed
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


def read_serial_tags(args: argparse.Namespace) -> int:
    candidates = [args.device] if args.device else serial_candidates()
    if not candidates:
        raise RuntimeError("No serial RFID device found under /dev/serial/by-id, /dev/ttyUSB*, or /dev/ttyACM*.")
    fd = open_serial(candidates[0], args.baud)
    sys.stderr.write(f"reading serial RFID from {candidates[0]}\n")
    buffer = bytearray()
    posted = 0
    try:
        while True:
            chunk = os.read(fd, 1)
            if not chunk:
                continue
            if chunk in (b"\r", b"\n"):
                tag = buffer.decode("utf-8", errors="ignore").strip()
                buffer.clear()
                if tag:
                    post_rfid(args, tag)
                    posted += 1
                    if args.once:
                        return posted
            else:
                buffer.extend(chunk)
    finally:
        os.close(fd)


def parse_input_devices() -> list[tuple[str, str]]:
    text = Path("/proc/bus/input/devices").read_text(errors="ignore") if Path("/proc/bus/input/devices").exists() else ""
    devices: list[tuple[str, str]] = []
    for block in text.split("\n\n"):
        name_match = re.search(r'N: Name="([^"]+)"', block)
        handlers_match = re.search(r"H: Handlers=(.*)", block)
        if not name_match or not handlers_match:
            continue
        name = name_match.group(1)
        handlers = handlers_match.group(1)
        event_match = re.search(r"\bevent\d+\b", handlers)
        if not event_match or "kbd" not in handlers:
            continue
        if re.search(r"rfid|nfc|reader|barcode|keyboard|hid", name, re.IGNORECASE):
            devices.append((f"/dev/input/{event_match.group(0)}", name))
    return devices


def read_hid_tags(args: argparse.Namespace) -> int:
    if args.input_event:
        event_path = args.input_event
        name = event_path
    else:
        devices = parse_input_devices()
        if not devices:
            raise RuntimeError("No keyboard-wedge RFID input event found. Pass --input-event /dev/input/eventN.")
        event_path, name = devices[0]
    sys.stderr.write(f"reading HID RFID from {event_path} ({name})\n")
    fd = os.open(event_path, os.O_RDONLY)
    shift = False
    chars: list[str] = []
    posted = 0
    try:
        while True:
            data = os.read(fd, INPUT_EVENT.size)
            if len(data) != INPUT_EVENT.size:
                continue
            _, _, event_type, code, value = INPUT_EVENT.unpack(data)
            if event_type != EV_KEY:
                continue
            if code in (KEY_LEFTSHIFT, KEY_RIGHTSHIFT):
                shift = value != 0
                continue
            if value != 1:
                continue
            if code in (KEY_ENTER, KEY_KPENTER):
                tag = "".join(chars).strip()
                chars.clear()
                if tag:
                    post_rfid(args, tag)
                    posted += 1
                    if args.once:
                        return posted
                continue
            mapped = KEYMAP.get(code)
            if mapped:
                chars.append(mapped[1 if shift else 0])
    finally:
        os.close(fd)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("auto", "serial", "hid"), default=os.environ.get("ALTIAIR_RFID_MODE", "auto"))
    parser.add_argument("--post-url", default=default_post_url())
    parser.add_argument("--api-token", default=os.environ.get("ALTIAIR_API_TOKEN", ""))
    parser.add_argument("--node-id", default=os.environ.get("ALTIAIR_NODE_ID", socket.gethostname()))
    parser.add_argument("--zone-id", default=os.environ.get("ALTIAIR_ZONE_ID", "field-zone-alpha"))
    parser.add_argument("--reader-id", default=os.environ.get("ALTIAIR_READER_ID", "rfid-primary"))
    parser.add_argument("--antenna-id", default=os.environ.get("ALTIAIR_ANTENNA_ID", "antenna-main"))
    parser.add_argument("--device", default=os.environ.get("ALTIAIR_RFID_DEVICE"))
    parser.add_argument("--input-event", default=os.environ.get("ALTIAIR_RFID_INPUT_EVENT"))
    parser.add_argument("--baud", type=int, default=int(os.environ.get("ALTIAIR_RFID_BAUD", "9600")))
    parser.add_argument("--confidence", type=float, default=float(os.environ.get("ALTIAIR_RFID_CONFIDENCE", "0.98")))
    parser.add_argument("--rssi", type=float, default=None)
    parser.add_argument("--post-timeout", type=float, default=float(os.environ.get("ALTIAIR_POST_TIMEOUT", "5")))
    parser.add_argument("--once", action="store_true", default=os.environ.get("ALTIAIR_ONCE") == "1")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    errors: list[str] = []
    if args.mode in ("auto", "serial"):
        try:
            count = read_serial_tags(args)
            return 0 if count else 1
        except Exception as exc:
            errors.append(f"serial: {exc}")
            if args.mode == "serial":
                sys.stderr.write(errors[-1] + "\n")
                return 2
    if args.mode in ("auto", "hid"):
        try:
            count = read_hid_tags(args)
            return 0 if count else 1
        except Exception as exc:
            errors.append(f"hid: {exc}")
            if args.mode == "hid":
                sys.stderr.write(errors[-1] + "\n")
                return 2
    sys.stderr.write("; ".join(errors) + "\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
