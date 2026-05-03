"""
RC522 RFID sensor adapter.

The rest of the pipeline still calls this class RFSensor because earlier
iterations treated the third sensor as generic RF. For the current hardware,
the third signal is a Raspberry Pi RC522 RFID reader. Output strings make the
source explicit:

  RFID(real): TAG READ tag_id=...
  RFID(real): no tag present
  RFID(simulated): TAG READ tag_id=...
  RFID(error): RC522 unavailable ...
"""

from __future__ import annotations

import logging
import random
import threading
import time

try:
    import config
except ImportError:  # pragma: no cover
    from . import config  # type: ignore

logger = logging.getLogger(__name__)


class RFSensor:
    def __init__(self, _unused_center_freq: float = 0.0, _unused_sample_rate: float = 0.0):
        self._output = "RFID: initializing"
        self._lock = threading.Lock()
        self._running = False
        self._reader = None
        self._gpio = None
        self._available = False
        self._simulation_enabled = config.RFID_SIMULATION_ENABLED

        try:
            from mfrc522 import SimpleMFRC522

            try:
                import RPi.GPIO as GPIO
            except Exception:
                GPIO = None

            self._reader = SimpleMFRC522()
            self._gpio = GPIO
            self._available = True
            logger.info("[RFID] RC522 reader initialized")
        except Exception as error:
            logger.warning("[RFID] RC522 unavailable: %s", error)
            if not self._simulation_enabled:
                self._set_output(f"RFID(error): RC522 unavailable - {error}")

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self._running:
            try:
                if self._available:
                    output = self._real_read()
                elif self._simulation_enabled:
                    output = self._simulate()
                else:
                    output = self._output
                self._set_output(output)
            except Exception as error:
                logger.warning("[RFID] Read failed: %s", error)
                if self._simulation_enabled:
                    self._set_output(self._simulate())
                else:
                    self._set_output(f"RFID(error): read failed - {error}")
            time.sleep(config.RFID_POLL_INTERVAL)

    def _real_read(self) -> str:
        tag_id = None
        text = ""

        if hasattr(self._reader, "read_no_block"):
            tag_id, text = self._reader.read_no_block()
        else:
            return "RFID(error): installed mfrc522 reader does not support non-blocking reads"

        if tag_id is None:
            return "RFID(real): no tag present"

        clean_text = str(text or "").strip().replace("\x00", "")
        if clean_text:
            return f'RFID(real): TAG READ tag_id={tag_id} text="{clean_text}" confidence=0.98'
        return f"RFID(real): TAG READ tag_id={tag_id} confidence=0.98"

    def _simulate(self) -> str:
        if random.random() > 0.45:
            tag_id = random.choice(["training-tag-001", "training-tag-014", "asset-alpha"])
            return f'RFID(simulated): TAG READ tag_id="{tag_id}" text="authorized training tag" confidence=0.82'
        return "RFID(simulated): no tag present"

    def _set_output(self, output: str) -> None:
        with self._lock:
            self._output = output

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
        if self._gpio is not None:
            try:
                self._gpio.cleanup()
            except Exception:
                pass
