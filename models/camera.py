"""
Camera sensor adapter.

Uses YOLO when OpenCV, ultralytics, and a camera are available. Otherwise it
emits realistic simulated detections so the fusion, gossip, coordinator, and UI
paths remain runnable on a laptop or partially configured Pi.
"""

from __future__ import annotations

import logging
import random
import threading
import time

logger = logging.getLogger(__name__)

THREAT_CLASSES = {"drone", "airplane", "bird", "person", "car", "truck", "motorcycle"}
CAMERA_FOV_DEG = 60.0


class CameraSensor:
    def __init__(self, camera_index: int = 0, model_path: str = "yolov8n.pt"):
        self._output = "VISUAL: initializing"
        self._lock = threading.Lock()
        self._running = False
        self._simulated = True
        self._model = None
        self._cap = None

        try:
            import cv2
            from ultralytics import YOLO

            logger.info("[Camera] Loading YOLO model %s", model_path)
            self._model = YOLO(model_path)
            self._cap = cv2.VideoCapture(camera_index)
            if self._cap.isOpened():
                self._simulated = False
                logger.info("[Camera] Camera ready")
            else:
                logger.warning("[Camera] Camera not found; using simulation")
        except Exception as error:
            logger.warning("[Camera] YOLO/OpenCV unavailable; using simulation: %s", error)

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self._running:
            if self._simulated:
                output = self._simulate()
                time.sleep(0.5)
            else:
                ret, frame = self._cap.read()
                if not ret:
                    time.sleep(0.05)
                    continue
                output = self._process(frame)

            with self._lock:
                self._output = output

    def _process(self, frame) -> str:
        results = self._model(frame, verbose=False)
        height, width = frame.shape[:2]
        detections: list[str] = []

        for result in results:
            for box in result.boxes:
                confidence = float(box.conf)
                if confidence < 0.45:
                    continue

                cls = result.names[int(box.cls)]
                if cls not in THREAT_CLASSES:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].tolist()
                center_x = (x1 + x2) / 2
                bearing_offset = ((center_x / width) - 0.5) * CAMERA_FOV_DEG

                size = ((x2 - x1) * (y2 - y1)) / (width * height)
                if size > 0.15:
                    est_dist = "near"
                elif size > 0.03:
                    est_dist = "mid"
                else:
                    est_dist = "far"

                detections.append(
                    f"{cls} conf={confidence:.2f} bearing_offset={bearing_offset:+.0f}deg {est_dist}"
                )

        if detections:
            return "VISUAL: " + " | ".join(detections)
        return "VISUAL: no threats detected in frame"

    def _simulate(self) -> str:
        if random.random() > 0.48:
            bearing = random.uniform(-18, 18)
            confidence = random.uniform(0.72, 0.96)
            distance = random.choice(["mid", "far", "far"])
            return f"VISUAL: drone conf={confidence:.2f} bearing_offset={bearing:+.0f}deg {distance}"
        if random.random() > 0.78:
            bearing = random.uniform(120, 230)
            return f"VISUAL: person conf=0.67 bearing={bearing:.0f}deg mid"
        return "VISUAL: no threats detected in frame"

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
