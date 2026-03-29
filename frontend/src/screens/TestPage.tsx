import { useState, useRef, useEffect } from "react";
import styles from "./TestPage.module.css";
import { checkCompliance, ComplianceResult } from "../utils/compliance";

interface Detection {
  class: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface TestResult {
  model_type: string;
  detections: Detection[];
  num_detections: number;
  elapsed_time: number;
  image_size: [number, number];
}

const POLLING_INTERVAL = 800; // ms

export default function TestPage() {
  const [modelType, setModelType] = useState<"construction" | "medical">(
    "construction",
  );
  const [mode, setMode] = useState<"upload" | "webcam">("upload");

  // Upload mode
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Webcam mode
  const [cameraActive, setCameraActive] = useState(false);
  const [webcamResult, setWebcamResult] = useState<TestResult | null>(null);
  const [webcamCompliance, setWebcamCompliance] =
    useState<ComplianceResult | null>(null);
  const [webcamStats, setWebcamStats] = useState({
    fps: 0,
    lastDetectionTime: 0,
    frameCount: 0,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Upload mode handlers
  const handleImageSelect = (file: File) => {
    setImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setError("");
    setResult(null);
  };

  const handleRunDetection = async () => {
    if (!image) {
      setError("Please select an image first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", image);
      formData.append("model_type", modelType);

      const response = await fetch("http://localhost:8000/test-detect", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // Webcam mode handlers
    const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });

        streamRef.current = stream;
        setCameraActive(true);
        setError("");
        setWebcamStats({ fps: 0, lastDetectionTime: 0, frameCount: 0 });
    } catch (err) {
        setError(
        `Camera error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
        console.error("[WEBCAM] Failed to start camera:", err);
    }
    };

  const stopCamera = () => {
    console.log("[WEBCAM] Stopping camera...");
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setWebcamResult(null);
    setWebcamCompliance(null);
    console.log("[WEBCAM] Camera stopped");
  };

  const captureFrame = (): Promise<Blob | null> => {
    if (!videoRef.current || !canvasRef.current) {
      console.warn("[CAPTURE] Missing video or canvas ref");
      return Promise.resolve(null);
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.warn("[CAPTURE] Failed to get canvas context");
      return Promise.resolve(null);
    }

    // Check if video is actually playing and has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn(
        `[CAPTURE] Video not ready: ${video.videoWidth}x${video.videoHeight}`,
      );
      return Promise.resolve(null);
    }

    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current frame onto canvas
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      // Convert canvas to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.warn("[CAPTURE] Failed to create blob");
              resolve(null);
            } else {
              console.log(
                "[CAPTURE] Frame captured successfully",
                blob.size,
                "bytes",
              );
              resolve(blob);
            }
          },
          "image/jpeg",
          0.85,
        );
      });
    } catch (err) {
      console.error("[CAPTURE] Error capturing frame:", err);
      return Promise.resolve(null);
    }
  };

  const startPollingLoop = () => {
    const POLLING_INTERVAL = 800; // milliseconds

    pollingRef.current = setInterval(async () => {
      if (inFlightRef.current) {
        console.log("[POLLING] Skipping frame - request in flight");
        return;
      }

      const frameBlob = await captureFrame();
      if (!frameBlob) {
        console.warn("[POLLING] Failed to capture frame");
        return;
      }

      inFlightRef.current = true;

      try {
        const formData = new FormData();
        formData.append("file", frameBlob, "frame.jpg");
        formData.append("model_type", modelType);

        console.log("[POLLING] Sending frame for detection...");
        const start = Date.now();

        const response = await fetch("http://localhost:8000/test-detect", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: TestResult = await response.json();
        const elapsed = ((Date.now() - start) / 1000).toFixed(3);

        console.log(
          `[DETECTION] Got ${data.num_detections} detections in ${elapsed}s`,
        );
        console.log(
          "[DETECTION] Classes:",
          data.detections.map((d) => d.class),
        );

        setWebcamResult(data);

        // Check compliance
        const complianceResult = checkCompliance(data.detections, modelType);
        setWebcamCompliance(complianceResult);

        // Update stats
        setWebcamStats((prev) => ({
          ...prev,
          lastDetectionTime: Date.now(),
          frameCount: prev.frameCount + 1,
        }));

        // Draw bounding boxes only if canvas is ready
        if (
          canvasRef.current &&
          canvasRef.current.width > 0 &&
          canvasRef.current.height > 0
        ) {
          drawBoundingBoxes(data.detections, data.image_size);
        } else {
          console.warn(
            "[POLLING] Canvas not ready for drawing:",
            canvasRef.current?.width,
            "x",
            canvasRef.current?.height,
          );
        }
      } catch (err) {
        console.error(
          "[POLLING] Error:",
          err instanceof Error ? err.message : "Unknown error",
        );
        setError(
          `Polling error: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        inFlightRef.current = false;
      }
    }, POLLING_INTERVAL);

    console.log("[POLLING] Loop started, interval:", POLLING_INTERVAL, "ms");
  };

  const drawBoundingBoxes = (
    detections: Detection[],
    imageSize: [number, number],
  ) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const [imgWidth, imgHeight] = imageSize;

    // Clear canvas completely (transparent)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate scale factors
    const scaleX = canvasWidth / imgWidth;
    const scaleY = canvasHeight / imgHeight;

    console.log(
      `[DRAW] Canvas: ${canvasWidth}x${canvasHeight}, Image: ${imgWidth}x${imgHeight}, Scale: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`,
    );

    // Draw bounding boxes
    detections.forEach((det, idx) => {
      const x1 = det.bbox.x1 * scaleX;
      const y1 = det.bbox.y1 * scaleY;
      const x2 = det.bbox.x2 * scaleX;
      const y2 = det.bbox.y2 * scaleY;
      const width = x2 - x1;
      const height = y2 - y1;

      // Color based on confidence
      const conf = det.confidence;
      const hue = conf > 0.8 ? 120 : conf > 0.5 ? 60 : 0; // Green -> Yellow -> Red
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, width, height);

      // Label background
      const label = `${det.class} ${(conf * 100).toFixed(0)}%`;
      ctx.fillStyle = `hsl(${hue}, 100%, 40%)`;
      ctx.font = "bold 14px Arial";
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(x1, y1 - 24, textWidth + 8, 22);

      // Label text
      ctx.fillStyle = "white";
      ctx.fillText(label, x1 + 4, y1 - 7);

      console.log(
        `[DRAW] Box ${idx}: ${det.class} at (${x1.toFixed(0)}, ${y1.toFixed(0)})`,
      );
    });
  };

  const handleModelSwitch = (type: "construction" | "medical") => {
    setModelType(type);
    setResult(null);
    setWebcamResult(null);
    setWebcamCompliance(null);
  };

  const handleModeSwitch = (newMode: "upload" | "webcam") => {
    if (cameraActive) {
      stopCamera();
    }
    setMode(newMode);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
  if (!cameraActive || !videoRef.current || !streamRef.current) return;

  const video = videoRef.current;
  const stream = streamRef.current;

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  video.onloadedmetadata = () => {
    console.log(
      "[WEBCAM] loadedmetadata:",
      video.videoWidth,
      "x",
      video.videoHeight
    );
  };

  video.oncanplay = () => {
    console.log(
      "[WEBCAM] canplay:",
      video.videoWidth,
      "x",
      video.videoHeight
    );
    if (!pollingRef.current) {
      setTimeout(() => {
        console.log("[WEBCAM] Starting polling loop from oncanplay");
        startPollingLoop();
      }, 100);
    }
  };

  video.play().catch((err) => {
    console.error("[WEBCAM] Play error:", err);
    setError("Failed to play video stream");
  });

  return () => {
    video.onloadedmetadata = null;
    video.oncanplay = null;
  };
}, [cameraActive]);

  return (
    <div className={styles.container}>
      <h1>🎥 PPE Model Tester</h1>

      {/* Model Selection */}
      <div className={styles.modelSelector}>
        <button
          className={`${styles.modelBtn} ${modelType === "construction" ? styles.active : ""}`}
          onClick={() => handleModelSwitch("construction")}
        >
          🏗️ Construction
        </button>
        <button
          className={`${styles.modelBtn} ${modelType === "medical" ? styles.active : ""}`}
          onClick={() => handleModelSwitch("medical")}
        >
          🏥 Medical
        </button>
      </div>

      {/* Mode Selection */}
      <div className={styles.modeSelector}>
        <button
          className={`${styles.modeBtn} ${mode === "upload" ? styles.active : ""}`}
          onClick={() => handleModeSwitch("upload")}
        >
          📤 Upload Image
        </button>
        <button
          className={`${styles.modeBtn} ${mode === "webcam" ? styles.active : ""}`}
          onClick={() => handleModeSwitch("webcam")}
        >
          📹 Webcam
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* UPLOAD MODE */}
      {mode === "upload" && (
        <>
          <div className={styles.uploadSection}>
            <button
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Select Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImageSelect(file);
                }
              }}
              style={{ display: "none" }}
            />
            {image && <p>Selected: {image.name}</p>}
          </div>

          {preview && (
            <div className={styles.preview}>
              <img src={preview} alt="Preview" />
            </div>
          )}

          {preview && (
            <button
              className={styles.detectBtn}
              onClick={handleRunDetection}
              disabled={loading}
            >
              {loading ? "Running Detection..." : "▶️ Run Detection"}
            </button>
          )}

          {result && (
            <div className={styles.results}>
              <h2>Results</h2>
              <div className={styles.stats}>
                <div>
                  <strong>Model:</strong> {result.model_type}
                </div>
                <div>
                  <strong>Detections:</strong> {result.num_detections}
                </div>
                <div>
                  <strong>Time:</strong> {result.elapsed_time}s
                </div>
                <div>
                  <strong>Image Size:</strong> {result.image_size[0]}x
                  {result.image_size[1]}
                </div>
              </div>

              {result.detections.length > 0 ? (
                <div className={styles.detectionsList}>
                  <h3>Detections:</h3>
                  {result.detections.map((detection, idx) => (
                    <div key={idx} className={styles.detectionItem}>
                      <span className={styles.class}>{detection.class}</span>
                      <span className={styles.confidence}>
                        {(detection.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No detections found</p>
              )}
            </div>
          )}
        </>
      )}

      {/* WEBCAM MODE */}
      {mode === "webcam" && (
        <>
          <div className={styles.webcamControls}>
            <button
              className={`${styles.webcamBtn} ${cameraActive ? styles.active : ""}`}
              onClick={cameraActive ? stopCamera : startCamera}
            >
              {cameraActive ? "🛑 Stop Camera" : "▶️ Start Camera"}
            </button>
          </div>

          {cameraActive && (
            <div className={styles.webcamContainer}>
              <video
                ref={videoRef}
                className={styles.video}
                muted
                playsInline
              />
              <canvas ref={canvasRef} className={styles.canvas} />
            </div>
          )}

          {/* Webcam Stats */}
          {cameraActive && (
            <div className={styles.stats}>
              <div>
                <strong>Mode:</strong> {modelType}
              </div>
              <div>
                <strong>Frames Processed:</strong> {webcamStats.frameCount}
              </div>
              {webcamResult && (
                <>
                  <div>
                    <strong>Detections:</strong>
                    {webcamResult.num_detections}
                  </div>
                  <div>
                    <strong>Last Detection:</strong> {webcamResult.elapsed_time}
                    s
                  </div>
                </>
              )}
            </div>
          )}

          {/* Compliance Status */}
          {webcamCompliance && (
            <div
              className={
                styles.compliancePanel +
                (webcamCompliance.isCompliant
                  ? ` ${styles.compliant}`
                  : ` ${styles.notCompliant}`)
              }
            >
              <h3>
                {webcamCompliance.isCompliant
                  ? "✅ COMPLIANT"
                  : "⚠️ NOT COMPLIANT"}
              </h3>
              <div className={styles.complianceDetails}>
                <div>
                  <strong>Compliance Level:</strong>{" "}
                  {webcamCompliance.compliancePercent}%
                </div>
                <div>
                  <strong>
                    Detected ({webcamCompliance.detected.length}):
                  </strong>{" "}
                  {webcamCompliance.detected.length > 0
                    ? webcamCompliance.detected.join(", ")
                    : "None"}
                </div>
                {webcamCompliance.missing.length > 0 && (
                  <div>
                    <strong>
                      Missing ({webcamCompliance.missing.length}):
                    </strong>{" "}
                    {webcamCompliance.missing.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {webcamResult && (
            <div className={styles.detectionsList}>
              <h3>Current Detections:</h3>
              {webcamResult.detections.length > 0 ? (
                webcamResult.detections.map((det, idx) => (
                  <div key={idx} className={styles.detectionItem}>
                    <span className={styles.class}>{det.class}</span>
                    <span className={styles.confidence}>
                      {(det.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))
              ) : (
                <p>No items detected</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
