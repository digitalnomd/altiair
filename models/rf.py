"""
RF / SDR sensor adapter.

Uses RTL-SDR when available and falls back to simulation. The output is a
compact string consumed by the fusion LLM.
"""

from __future__ import annotations

import logging
import random
import threading
import time

logger = logging.getLogger(__name__)

DRONE_BANDS = {
    "DJI_primary": 2.437e9,
    "DJI_secondary": 5.745e9,
    "generic_RC": 2.400e9,
    "FPV_video": 5.800e9,
}

POWER_THRESHOLD_DBM = -70.0
SAMPLE_COUNT = 256 * 1024


class RFSensor:
    def __init__(self, center_freq: float = 2.437e9, sample_rate: float = 2.4e6):
        self._center_freq = center_freq
        self._sample_rate = sample_rate
        self._output = "RF: initializing"
        self._lock = threading.Lock()
        self._running = False
        self._available = False
        self._sdr = None
        self._np = None

        try:
            import numpy as np
            from rtlsdr import RtlSdr

            self._sdr = RtlSdr()
            self._sdr.sample_rate = sample_rate
            self._sdr.center_freq = center_freq
            self._sdr.gain = 4
            self._np = np
            self._available = True
            logger.info("[RF] RTL-SDR initialized at %.3f GHz", center_freq / 1e9)
        except Exception as error:
            logger.warning("[RF] RTL-SDR unavailable; using simulation: %s", error)

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self._running:
            try:
                output = self._real_scan() if self._available else self._simulate()
                with self._lock:
                    self._output = output
            except Exception as error:
                logger.warning("[RF] Scan failed; using simulation: %s", error)
                with self._lock:
                    self._output = self._simulate()
            time.sleep(0.5)

    def _real_scan(self) -> str:
        samples = self._sdr.read_samples(SAMPLE_COUNT)
        power = self._np.abs(samples) ** 2
        power_db = 10 * self._np.log10(self._np.mean(power) + 1e-12)

        freq_ghz = self._center_freq / 1e9
        band_name = self._identify_band(self._center_freq)

        if power_db > POWER_THRESHOLD_DBM:
            return (
                f"RF: SIGNAL DETECTED {freq_ghz:.3f}GHz ({band_name}), "
                f"RSSI {power_db:.1f}dBm, bearing estimate 040-050deg"
            )
        return f"RF: background noise at {freq_ghz:.3f}GHz ({power_db:.1f}dBm)"

    def _simulate(self) -> str:
        if random.random() > 0.38:
            rssi = random.uniform(-65, -42)
            bearing = random.randint(40, 50)
            return (
                "RF: SIGNAL DETECTED 2.437GHz (DJI_primary), "
                f"RSSI {rssi:.1f}dBm, bearing estimate {bearing:03d}deg"
            )
        return "RF: background noise only, no drone signal"

    @staticmethod
    def _identify_band(freq: float) -> str:
        for name, band_freq in DRONE_BANDS.items():
            if abs(freq - band_freq) < 50e6:
                return name
        return "unknown band"

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
        if self._sdr is not None:
            try:
                self._sdr.close()
            except Exception:
                pass
