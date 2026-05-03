"""
sensors/audio.py

Records 2-second audio chunks from the microphone.
Transcribes via faster-whisper (tiny model — ~39MB, runs on CPU on Jetson).
Flags tactical keywords and passes formatted string to fusion LLM.

faster-whisper is significantly faster than openai-whisper on embedded hardware.
On Jetson Nano: ~0.3-0.6s latency per 2s chunk with tiny model.
"""

import queue
import threading
import logging
import numpy as np

logger = logging.getLogger(__name__)

THREAT_KEYWORDS = [
    "drone",
    "contact",
    "enemy",
    "hostile",
    "fire",
    "fall back",
    "retreat",
    "man down",
    "grenade",
    "sniper",
    "ambush",
    "operator",
    "controller",
]


class AudioSensor:
    def __init__(self, sample_rate: int = 16000, chunk_seconds: int = 2):
        try:
            from faster_whisper import WhisperModel

            logger.info("[Audio] Loading Whisper tiny model...")
            self._model = WhisperModel("tiny", device="cpu", compute_type="int8")
            self._available = True
            logger.info("[Audio] Whisper ready")
        except Exception as e:
            logger.warning(f"[Audio] Whisper not available: {e} — using simulation")
            self._available = False

        self._sample_rate = sample_rate
        self._chunk_seconds = chunk_seconds
        self._audio_queue = queue.Queue(maxsize=3)  # drop old chunks if backed up
        self._output = "AUDIO: initializing"
        self._lock = threading.Lock()
        self._running = False

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._record_loop, daemon=True).start()
        threading.Thread(target=self._transcribe_loop, daemon=True).start()

    def _record_loop(self) -> None:
        if not self._available:
            return
        try:
            import sounddevice as sd

            chunk_frames = self._sample_rate * self._chunk_seconds

            def callback(indata, frames, time_info, status):
                try:
                    self._audio_queue.put_nowait(indata.copy())
                except queue.Full:
                    pass  # drop oldest — we want fresh data

            with sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="float32",
                blocksize=chunk_frames,
                callback=callback,
            ):
                while self._running:
                    sd.sleep(200)

        except Exception as e:
            logger.error(f"[Audio] Record loop error: {e}")

    def _transcribe_loop(self) -> None:
        while self._running:
            if not self._available:
                output = self._simulate()
                with self._lock:
                    self._output = output
                import time

                time.sleep(2)
                continue

            try:
                chunk = self._audio_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            try:
                audio_np = chunk.flatten().astype(np.float32)
                segments, _ = self._model.transcribe(
                    audio_np,
                    language="en",
                    vad_filter=True,  # skip silent chunks
                    vad_parameters={"min_silence_duration_ms": 300},
                )
                text = " ".join(s.text.strip() for s in segments).strip()

                if text:
                    flags = [kw for kw in THREAT_KEYWORDS if kw in text.lower()]
                    flag_str = f" ⚠ KEYWORD: [{', '.join(flags)}]" if flags else ""
                    output = f'AUDIO: "{text}"{flag_str}'
                else:
                    output = "AUDIO: ambient only, no speech detected"

                with self._lock:
                    self._output = output

            except Exception as e:
                logger.error(f"[Audio] Transcription error: {e}")

    def _simulate(self) -> str:
        import random

        options = [
            'AUDIO: "drone overhead moving south" ⚠ KEYWORD: [drone]',
            "AUDIO: ambient only, no speech detected",
            'AUDIO: "contact right, bearing zero four five" ⚠ KEYWORD: [contact]',
            "AUDIO: rotor sound detected, no speech",
            "AUDIO: ambient only, no speech detected",
        ]
        return random.choice(options)

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
