import { useEffect, useRef, useState } from "react";
import styles from "./TestPage.module.css";

type ModelType = "construction" | "medical";
type ModeType = "upload" | "webcam";

interface Detection {
  class: string;
  raw_class?: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface DetectionResult {
  type?: string;
  frame_id?: number;
  model_type: ModelType;
  detections: Detection[];
  num_detections: number;
  elapsed_time: number;
  image_size: [number, number];
  error?: string;
}

interface ComplianceResult {
  compliant: boolean;
  missing: string[];
  detected: string[];
}

interface WebcamStats {
  fps: number;
  lastDetectionTime: number;
  frameCount: number;
}

const REQUIRED_PPE: Record<ModelType, string[]> = {
  construction: ["hard_hat", "safety_vest", "gloves"],
  medical: ["mask", "gloves", "goggles", "face_shield", "coverall"],
};

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:8000";

function getWsUrl() {
  const envWs = (import.meta as any)?.env?.VITE_WS_BASE;
  if (envWs) return envWs.replace(/\/$/, "") + "/ws/detect";

  const apiUrl = new URL(API_BASE);
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${apiUrl.host}/ws/detect`;
}

export default function TestPage() {
  const [modelType, setModelType] = useState<ModelType>("construction");
  const [mode, setMode] = useState<ModeType>("upload");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [result, setResult] = useState<DetectionResult | null>(null);
  const [webcamResult, setWebcamResult] = useState<DetectionResult | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [webcamCompliance, setWebcamCompliance] =
    useState<ComplianceResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");

  const [webcamStats, setWebcamStats] = useState<WebcamStats>({
    fps: 0,
    lastDetectionTime: 0,
    frameCount: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendIntervalRef = useRef<number | null>(null);

  const inFlightRef = useRef(false);
  const frameIdRef = useRef(0);
  const lastProcessedFrameRef = useRef(-1);

  const drawBoundingBoxes = (
    detections: Detection[],
    imageSize: [number, number]
  ) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.round(rect.width));
    const displayHeight = Math.max(1, Math.round(rect.height));

    if (canvas.width !== displayWidth) canvas.width = displayWidth;
    if (canvas.height !== displayHeight) canvas.height = displayHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const [imgWidth, imgHeight] = imageSize;
    if (!imgWidth || !imgHeight) return;

    const scaleX = canvas.width / imgWidth;
    const scaleY = canvas.height / imgHeight;

    for (const det of detections) {
      const x1 = det.bbox.x1 * scaleX;
      const y1 = det.bbox.y1 * scaleY;
      const x2 = det.bbox.x2 * scaleX;
      const y2 = det.bbox.y2 * scaleY;

      const width = x2 - x1;
      const height = y2 - y1;
      const conf = det.confidence;

      const hue = conf > 0.8 ? 120 : conf > 0.5 ? 50 : 0;
      const stroke = `hsl(${hue}, 100%, 50%)`;
      const fill = `hsla(${hue}, 100%, 45%, 0.9)`;

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, width, height);

      const label = `${det.class} ${(conf * 100).toFixed(0)}%`;
      ctx.font = "bold 14px Arial";
      const textWidth = ctx.measureText(label).width;
      const textX = x1;
      const textY = Math.max(20, y1 - 8);

      ctx.fillStyle = fill;
      ctx.fillRect(textX, textY - 18, textWidth + 10, 20);

      ctx.fillStyle = "white";
      ctx.fillText(label, textX + 5, textY - 4);
    }
  };

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const checkCompliance = (
    detections: Detection[],
    activeModelType: ModelType
  ): ComplianceResult => {
    const required = REQUIRED_PPE[activeModelType];
    const detectedSet = new Set(detections.map((d) => d.class));
    const missing = required.filter((item) => !detectedSet.has(item));

    return {
      compliant: missing.length === 0,
      missing,
      detected: Array.from(detectedSet),
    };
  };

  const resetWebcamState = () => {
    setWebcamResult(null);
    setWebcamCompliance(null);
    setWebcamStats({
      fps: 0,
      lastDetectionTime: 0,
      frameCount: 0,
    });
    frameIdRef.current = 0;
    lastProcessedFrameRef.current = -1;
    inFlightRef.current = false;
    clearOverlay();
  };

  const captureFrameBase64 = (): string | null => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (!video || !canvas) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const targetWidth = 640;
    const targetHeight = 480;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1] ?? null;
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DetectionResult;

        if (data.error) {
          console.error("[WS] Backend error:", data.error);
          setError(data.error);
          return;
        }

        if (data.type !== "detection_result") return;

        const frameId = data.frame_id ?? -1;
        if (frameId < lastProcessedFrameRef.current) {
          return;
        }

        lastProcessedFrameRef.current = frameId;

        setWebcamResult(data);
        const nextCompliance = checkCompliance(data.detections, modelType);
        setWebcamCompliance(nextCompliance);

        drawBoundingBoxes(data.detections, data.image_size);

        setWebcamStats((prev) => ({
          fps:
            data.elapsed_time > 0
              ? Number((1 / data.elapsed_time).toFixed(1))
              : 0,
          lastDetectionTime: data.elapsed_time,
          frameCount: prev.frameCount + 1,
        }));
      } catch (err) {
        console.error("[WS] Parse error:", err);
      } finally {
        inFlightRef.current = false;
      }
    };

    ws.onerror = (event) => {
      console.error("[WS] Error:", event);
      setError("WebSocket connection error");
      inFlightRef.current = false;
    };

    ws.onclose = () => {
      console.log("[WS] Closed");
      wsRef.current = null;
      inFlightRef.current = false;
    };

    wsRef.current = ws;
  };

  const stopSendLoop = () => {
    if (sendIntervalRef.current !== null) {
      window.clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  };

  const startSendLoop = () => {
    stopSendLoop();

    const SEND_INTERVAL = 250;

    sendIntervalRef.current = window.setInterval(() => {
      if (!cameraActive) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (inFlightRef.current) return;

      const imageBase64 = captureFrameBase64();
      if (!imageBase64) return;

      const frameId = ++frameIdRef.current;
      inFlightRef.current = true;

      wsRef.current.send(
        JSON.stringify({
          type: "frame",
          frame_id: frameId,
          model_type: modelType,
          image: imageBase64,
        })
      );
    }, SEND_INTERVAL);
  };

  const startCamera = async () => {
    try {
      setError("");
      resetWebcamState();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);
      connectWebSocket();
    } catch (err) {
      console.error("[WEBCAM] Failed to start:", err);
      setError(
        `Camera error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  const stopCamera = () => {
    stopSendLoop();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    resetWebcamState();
  };

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    setResult(null);
    setCompliance(null);
    setError("");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const runUploadDetection = async () => {
    if (!selectedFile) {
      setError("Please choose an image first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);
      setCompliance(null);

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("model_type", modelType);

      const response = await fetch(`${API_BASE}/test-detect`, {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as DetectionResult;

      if ((data as any).error) {
        setError((data as any).error);
        return;
      }

      setResult(data);
      setCompliance(checkCompliance(data.detections, modelType));
    } catch (err) {
      console.error("[UPLOAD] Detection failed:", err);
      setError("Failed to run detection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    const handleCanPlay = async () => {
      try {
        await video.play();
        startSendLoop();
      } catch (err) {
        console.error("[WEBCAM] video.play() failed:", err);
        setError("Failed to play webcam stream.");
      }
    };

    video.oncanplay = handleCanPlay;

    return () => {
      video.oncanplay = null;
    };
  }, [cameraActive, modelType]);

  useEffect(() => {
    if (!cameraActive) return;
    resetWebcamState();
  }, [modelType]);

  useEffect(() => {
    return () => {
      stopSendLoop();

      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeResult = mode === "upload" ? result : webcamResult;
  const activeCompliance = mode === "upload" ? compliance : webcamCompliance;

  return (
    <div className={styles.container}>
      <h1>PPE Detection</h1>

      <div className={styles.modelSelector}>
        <button
          className={`${styles.modelBtn} ${
            modelType === "construction" ? styles.active : ""
          }`}
          onClick={() => setModelType("construction")}
        >
          Construction
        </button>
        <button
          className={`${styles.modelBtn} ${
            modelType === "medical" ? styles.active : ""
          }`}
          onClick={() => setModelType("medical")}
        >
          Medical
        </button>
      </div>

      <div className={styles.modeSelector}>
        <button
          className={`${styles.modeBtn} ${mode === "upload" ? styles.active : ""}`}
          onClick={() => {
            if (cameraActive) stopCamera();
            setMode("upload");
          }}
        >
          Upload Image
        </button>
        <button
          className={`${styles.modeBtn} ${mode === "webcam" ? styles.active : ""}`}
          onClick={() => {
            setMode("webcam");
            setError("");
          }}
        >
          Webcam
        </button>
      </div>

      {mode === "upload" && (
        <>
          <div className={styles.uploadSection}>
            <input
              id="fileInput"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button
              className={styles.uploadBtn}
              onClick={() => document.getElementById("fileInput")?.click()}
            >
              Choose Image
            </button>
            {selectedFile && <p>{selectedFile.name}</p>}
          </div>

          {previewUrl && (
            <div className={styles.preview}>
              <img src={previewUrl} alt="Preview" />
            </div>
          )}

          <button
            className={styles.detectBtn}
            onClick={runUploadDetection}
            disabled={!selectedFile || loading}
          >
            {loading ? "Detecting..." : "Run Detection"}
          </button>
        </>
      )}

      {mode === "webcam" && (
        <>
          <div className={styles.webcamControls}>
            <button
              className={`${styles.webcamBtn} ${
                cameraActive ? styles.active : ""
              }`}
              onClick={cameraActive ? stopCamera : startCamera}
            >
              {cameraActive ? "🛑 Stop Camera" : "▶️ Start Camera"}
            </button>
          </div>

          {cameraActive && (
            <div className={styles.webcamContainer}>
              <video ref={videoRef} className={styles.video} muted playsInline />
              <canvas ref={overlayCanvasRef} className={styles.canvas} />
              <canvas ref={captureCanvasRef} style={{ display: "none" }} />
            </div>
          )}

          {cameraActive && (
            <div className={styles.stats}>
              <div>
                <strong>Mode:</strong> {modelType}
              </div>
              <div>
                <strong>Frames Processed:</strong> {webcamStats.frameCount}
              </div>
              <div>
                <strong>Inference FPS:</strong> {webcamStats.fps}
              </div>
              <div>
                <strong>Last Detection:</strong> {webcamStats.lastDetectionTime}s
              </div>
              <div>
                <strong>Detections:</strong> {webcamResult?.num_detections ?? 0}
              </div>
            </div>
          )}
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {activeCompliance && (
        <div
          className={`${styles.compliancePanel} ${
            activeCompliance.compliant ? styles.compliant : styles.notCompliant
          }`}
        >
          <h3>
            {activeCompliance.compliant
              ? "Compliant"
              : "Not Compliant"}
          </h3>
          <div className={styles.complianceDetails}>
            <div>
              <strong>Detected:</strong>{" "}
              {activeCompliance.detected.length
                ? activeCompliance.detected.join(", ")
                : "None"}
            </div>
            <div>
              <strong>Missing:</strong>{" "}
              {activeCompliance.missing.length
                ? activeCompliance.missing.join(", ")
                : "None"}
            </div>
          </div>
        </div>
      )}

      {activeResult && mode === "upload" && (
        <div className={styles.results}>
          <h2>Results</h2>

          <div className={styles.stats}>
            <div>
              <strong>Model:</strong> {activeResult.model_type}
            </div>
            <div>
              <strong>Detections:</strong> {activeResult.num_detections}
            </div>
            <div>
              <strong>Elapsed Time:</strong> {activeResult.elapsed_time}s
            </div>
            <div>
              <strong>Image Size:</strong>{" "}
              {activeResult.image_size[0]} x {activeResult.image_size[1]}
            </div>
          </div>

          <div className={styles.detectionsList}>
            <h3>Detections</h3>
            {activeResult.detections.length === 0 ? (
              <p>No detections found.</p>
            ) : (
              activeResult.detections.map((det, idx) => (
                <div key={idx} className={styles.detectionItem}>
                  <span className={styles.class}>{det.class}</span>
                  <span className={styles.confidence}>
                    {(det.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}