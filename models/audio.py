"""
Microphone sensor adapter.

The runtime prefers faster-whisper for simple Python setup. If the audio stack
is unavailable it emits tactical simulation strings. The rest of the system
only depends on the normalized string output, so swapping to whisper.cpp later
does not change the fusion/coordinator/UI contract.
"""

from __future__ import annotations

import logging
import queue
import random
import threading
import time

logger = logging.getLogger(__name__)

THREAT_KEYWORDS = [
    "drone",
    "contact",
    "overhead",
    "rotor",
    "operator",
    "controller",
    "fall back",
    "man down",
]


class AudioSensor:
    def __init__(self, sample_rate: int = 16000, chunk_seconds: int = 2):
        self._sample_rate = sample_rate
        self._chunk_seconds = chunk_seconds
        self._audio_queue: queue.Queue = queue.Queue(maxsize=3)
        self._output = "AUDIO: initializing"
        self._lock = threading.Lock()
        self._running = False
        self._available = False
        self._model = None
        self._np = None

        try:
            import numpy as np
            from faster_whisper import WhisperModel

            logger.info("[Audio] Loading Whisper tiny model")
            self._model = WhisperModel("tiny", device="cpu", compute_type="int8")
            self._np = np
            self._available = True
            logger.info("[Audio] Whisper ready")
        except Exception as error:
            logger.warning("[Audio] Whisper unavailable; using simulation: %s", error)

    def start(self) -> None:
        self._running = True
        if self._available:
            threading.Thread(target=self._record_loop, daemon=True).start()
        threading.Thread(target=self._transcribe_loop, daemon=True).start()

    def _record_loop(self) -> None:
        try:
            import sounddevice as sd

            chunk_frames = self._sample_rate * self._chunk_seconds

            def callback(indata, frames, time_info, status):
                try:
                    self._audio_queue.put_nowait(indata.copy())
                except queue.Full:
                    pass

            with sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="float32",
                blocksize=chunk_frames,
                callback=callback,
            ):
                while self._running:
                    sd.sleep(200)

        except Exception as error:
            logger.warning("[Audio] Record loop unavailable; switching to simulation: %s", error)
            self._available = False

    def _transcribe_loop(self) -> None:
        while self._running:
            if not self._available:
                self._set_output(self._simulate())
                time.sleep(self._chunk_seconds)
                continue

            try:
                chunk = self._audio_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            try:
                audio_np = chunk.flatten().astype(self._np.float32)
                segments, _ = self._model.transcribe(
                    audio_np,
                    language="en",
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 300},
                )
                text = " ".join(segment.text.strip() for segment in segments).strip()
                if text:
                    flags = [keyword for keyword in THREAT_KEYWORDS if keyword in text.lower()]
                    flag_str = f" KEYWORD: [{', '.join(flags)}]" if flags else ""
                    output = f'AUDIO: "{text}"{flag_str}'
                else:
                    output = "AUDIO: ambient only, no speech detected"
                self._set_output(output)
            except Exception as error:
                logger.warning("[Audio] Transcription failed; using last/simulated output: %s", error)
                self._set_output(self._simulate())

    def _simulate(self) -> str:
        return random.choice(
            [
                'AUDIO: "drone overhead moving south" KEYWORD: [drone, overhead]',
                "AUDIO: ambient only, no speech detected",
                'AUDIO: "contact right, bearing zero four five" KEYWORD: [contact]',
                "AUDIO: rotor sound pattern detected, no speech",
                "AUDIO: ambient wind and movement only",
            ]
        )

    def _set_output(self, output: str) -> None:
        with self._lock:
            self._output = output

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
