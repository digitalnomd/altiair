"""
sensors/rf.py

RTL-SDR dongle connected to Raspberry Pi via USB.
Scans the 2.4GHz band for drone RC link signatures.

For the hackathon demo: if RTL-SDR is not connected,
falls back to a plausible simulation so the rest of the
pipeline still works.

Real deployment: pre-characterize your specific drone's RF
signature and update POWER_THRESHOLD_DBM accordingly.
"""

import time
import threading
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Known drone frequency bands (Hz)
DRONE_BANDS = {
    "DJI_primary": 2.437e9,
    "DJI_secondary": 5.745e9,
    "generic_RC": 2.400e9,
    "FPV_video": 5.800e9,
}

# Signal above this = probable drone transmission
POWER_THRESHOLD_DBM = -70.0

# How many samples per scan
SAMPLE_COUNT = 256 * 1024


class RFSensor:
    def __init__(self, center_freq: float = 2.437e9, sample_rate: float = 2.4e6):
        self._center_freq = center_freq
        self._sample_rate = sample_rate
        self._output = "RF: initializing"
        self._lock = threading.Lock()
        self._running = False

        try:
            from rtlsdr import RtlSdr

            self._sdr = RtlSdr()
            self._sdr.sample_rate = sample_rate
            self._sdr.center_freq = center_freq
            self._sdr.gain = 4
            self._available = True
            logger.info(f"[RF] RTL-SDR initialized at {center_freq/1e9:.3f} GHz")
        except Exception as e:
            logger.warning(f"[RF] RTL-SDR unavailable: {e} — using simulation")
            self._available = False

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self._running:
            try:
                output = self._real_scan() if self._available else self._simulate()
                with self._lock:
                    self._output = output
            except Exception as e:
                logger.error(f"[RF] Scan error: {e}")
                with self._lock:
                    self._output = f"RF: scan error"
            time.sleep(0.5)

    def _real_scan(self) -> str:
        samples = self._sdr.read_samples(SAMPLE_COUNT)
        power = np.abs(samples) ** 2
        power_db = 10 * np.log10(np.mean(power) + 1e-12)

        freq_ghz = self._center_freq / 1e9
        band_name = self._identify_band(self._center_freq)

        if power_db > POWER_THRESHOLD_DBM:
            return (
                f"RF: SIGNAL DETECTED {freq_ghz:.3f}GHz ({band_name}), "
                f"RSSI {power_db:.1f}dBm — probable drone RC/video link"
            )
        return f"RF: background noise at {freq_ghz:.3f}GHz ({power_db:.1f}dBm)"

    def _simulate(self) -> str:
        import random

        if random.random() > 0.4:
            rssi = random.uniform(-65, -42)
            return (
                f"RF: SIGNAL DETECTED 2.437GHz (DJI_primary), "
                f"RSSI {rssi:.1f}dBm — probable drone RC/video link"
            )
        return "RF: background noise only, no drone signal"

    @staticmethod
    def _identify_band(freq: float) -> str:
        for name, f in DRONE_BANDS.items():
            if abs(freq - f) < 50e6:  # within 50 MHz
                return name
        return "unknown band"

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
        if self._available:
            try:
                self._sdr.close()
            except Exception:
                pass
