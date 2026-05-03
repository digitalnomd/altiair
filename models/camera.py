"""
sensors/camera.py

Runs YOLOv8n on the Jetson Nano's GPU continuously.
Detects objects, estimates rough bearing from frame position,
and formats a string for the fusion LLM.

YOLOv8n is ~6MB and runs at 15-30fps on Jetson Nano with CUDA.
"""

import threading
import logging
import cv2

logger = logging.getLogger(__name__)

# Classes we care about for threat assessment
THREAT_CLASSES = {"drone", "airplane", "bird", "person", "car", "truck", "motorcycle"}

# Assume ~60° horizontal field of view
CAMERA_FOV_DEG = 60.0


class CameraSensor:
    def __init__(self, camera_index: int = 0, model_path: str = "yolov8n.pt"):
        from ultralytics import YOLO

        logger.info("[Camera] Loading YOLO model...")
        self._model = YOLO(model_path)
        self._cap = cv2.VideoCapture(camera_index)
        self._output = "VISUAL: initializing"
        self._lock = threading.Lock()
        self._running = False

        if not self._cap.isOpened():
            logger.warning("[Camera] Camera not found — using simulated output")
            self._simulated = True
        else:
            self._simulated = False

        logger.info("[Camera] Ready")

    def start(self) -> None:
        self._running = True
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def _loop(self) -> None:
        import random

        while self._running:
            if self._simulated:
                output = self._simulate()
            else:
                ret, frame = self._cap.read()
                if not ret:
                    continue
                output = self._process(frame)

            with self._lock:
                self._output = output

    def _process(self, frame) -> str:
        results = self._model(frame, verbose=False)
        h, w = frame.shape[:2]
        detections = []

        for r in results:
            for box in r.boxes:
                conf = float(box.conf)
                if conf < 0.45:
                    continue

                cls = r.names[int(box.cls)]
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx = (x1 + x2) / 2

                # Convert pixel x-position to bearing offset from center
                bearing_offset = ((cx / w) - 0.5) * CAMERA_FOV_DEG

                size = ((x2 - x1) * (y2 - y1)) / (w * h)
                if size > 0.15:
                    est_dist = "near (<50m)"
                elif size > 0.03:
                    est_dist = "mid (50-200m)"
                else:
                    est_dist = "far (>200m)"

                detections.append(
                    f"{cls} conf={conf:.2f} bearing_offset={bearing_offset:+.0f}° {est_dist}"
                )

        if detections:
            return "VISUAL: " + " | ".join(detections)
        return "VISUAL: no threats detected in frame"

    def _simulate(self) -> str:
        import random, time

        if random.random() > 0.5:
            bearing = random.uniform(-25, 25)
            conf = random.uniform(0.72, 0.96)
            return f"VISUAL: drone conf={conf:.2f} bearing_offset={bearing:+.0f}° far (>200m)"
        return "VISUAL: no threats detected in frame"

    def get_output(self) -> str:
        with self._lock:
            return self._output

    def stop(self) -> None:
        self._running = False
        if not self._simulated:
            self._cap.release()
