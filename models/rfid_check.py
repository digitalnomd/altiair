"""
Standalone RC522 hardware check for Raspberry Pi.

Run this on the Pi, not on Windows:

  python models/rfid_check.py

It verifies the Python libraries, checks for SPI device files, then polls the
RC522 reader for a tag. Put an RFID card/tag on the reader while it runs.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path


def main() -> int:
    print("Altiair RC522 RFID hardware check")
    print("=" * 36)

    if os.name == "nt":
        print("This script must run on the Raspberry Pi, not Windows.")
        return 2

    spi_devices = sorted(str(path) for path in Path("/dev").glob("spidev*"))
    if spi_devices:
        print(f"SPI devices: {', '.join(spi_devices)}")
    else:
        print("SPI devices: none found")
        print("Fix: run sudo raspi-config, enable SPI, then reboot.")
        return 2

    try:
        import RPi.GPIO as GPIO  # noqa: F401

        print("RPi.GPIO import: ok")
    except Exception as error:
        print(f"RPi.GPIO import: failed - {error}")
        return 2

    try:
        from mfrc522 import SimpleMFRC522

        print("mfrc522 import: ok")
    except Exception as error:
        print(f"mfrc522 import: failed - {error}")
        print("Fix: python -m pip install -r requirements.txt")
        return 2

    reader = SimpleMFRC522()
    print("RC522 reader initialized.")
    print("Place a tag/card on the reader. Polling for 20 seconds...")

    try:
        deadline = time.time() + 20
        while time.time() < deadline:
            tag_id, text = reader.read_no_block()
            if tag_id is not None:
                clean_text = str(text or "").strip().replace("\x00", "")
                print(f"TAG READ tag_id={tag_id} text={clean_text!r}")
                return 0
            print("no tag present")
            time.sleep(0.5)
    finally:
        try:
            import RPi.GPIO as GPIO

            GPIO.cleanup()
        except Exception:
            pass

    print("No tag was read. Check wiring, tag distance, SPI, and power.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
