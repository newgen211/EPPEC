import { useEffect, useMemo, useRef, useState } from "react";
import ModeSelectScreen from "./screens/ModeSelectScreen";
import ScenarioScreen from "./screens/ScenarioScreen";
import CameraScreen from "./screens/CameraScreen";
import ResultsScreen from "./screens/ResultsScreen";

import type { AppMode, AppStage, DetectionConfidence } from "./types/app";
import type {
  BackendScenario,
  DetectAndGradeResponse,
  Detection,
} from "./types/api";

import {
  fetchGeneratedScenario,
  fetchScenarios,
  detectAndGrade,
  detectUpload,
} from "./utils/apiClient";
import { normalizeDetectionsToConfidence } from "./utils/detection";
import {
  CONSTRUCTION_PPE_OPTIONS,
  MEDICAL_PPE_OPTIONS,
} from "./utils/labels";
import { getMedicalTimerSeconds } from "./utils/timer";
import { createDetectionSocket } from "./utils/liveDetectionSocket";

const AI_SCENARIO_OPTION_ID = -1;

const CONSTRUCTION_SCENARIO: BackendScenario = {
  id: 1000,
  text: "A responder is entering a flood-damaged area with contaminated standing water, debris, unstable surfaces, and possible exposure to mold and sharp objects.",
  category: "Flood Response",
};

const FALLBACK_MEDICAL_SCENARIOS: BackendScenario[] = [
  {
    id: 1,
    text: "Routine blood draw on a stable patient.",
    category: "Standard",
  },
  {
    id: 2,
    text: "Patient presenting with fever and productive cough — suspected influenza.",
    category: "Droplet",
  },
  {
    id: 3,
    text: "Entering an isolation room for a patient with C. diff infection.",
    category: "Contact",
  },
  {
    id: 4,
    text: "Suspected tuberculosis — patient has persistent cough and night sweats.",
    category: "Airborne",
  },
  {
    id: 5,
    text: "Emergency intubation on an unknown-status patient with high aerosolization risk.",
    category: "High-Risk",
  },
];

export default function App() {
  const [stage, setStage] = useState<AppStage>("modeSelect");
  const [mode, setMode] = useState<AppMode>(null);

  const [medicalScenarios, setMedicalScenarios] = useState<BackendScenario[]>([]);
  const [aiScenario, setAiScenario] = useState<BackendScenario | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<BackendScenario | null>(null);
  const [selectedMedicalScenarioId, setSelectedMedicalScenarioId] = useState<number | null>(null);

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [result, setResult] = useState<DetectAndGradeResponse | null>(null);

  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [loadingAiScenario, setLoadingAiScenario] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [liveConfidences, setLiveConfidences] = useState<DetectionConfidence[]>([]);
  const [visionOnline, setVisionOnline] = useState(false);
  const [visionBusy, setVisionBusy] = useState(false);
  const [lastDetections, setLastDetections] = useState<Detection[]>([]);

  const [timerActive, setTimerActive] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const frameIdRef = useRef(0);
  const lastProcessedFrameRef = useRef(-1);
  const sendIntervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const ppeOptions = useMemo(() => {
    if (mode === "construction") return CONSTRUCTION_PPE_OPTIONS;
    return MEDICAL_PPE_OPTIONS;
  }, [mode]);

  const activeModelType: "construction" | "medical" =
    mode === "construction" ? "construction" : "medical";

  useEffect(() => {
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      })),
    );
  }, [ppeOptions]);

  useEffect(() => {
    const loadMedicalData = async () => {
      try {
        setLoadingScenarios(true);
        setLoadingAiScenario(true);
        setErrorMessage(null);

        const [scenariosResult, aiResult] = await Promise.allSettled([
          fetchScenarios(),
          fetchGeneratedScenario(),
        ]);

        if (scenariosResult.status === "fulfilled") {
          setMedicalScenarios(scenariosResult.value);
        } else {
          setMedicalScenarios(FALLBACK_MEDICAL_SCENARIOS);
          setErrorMessage(
            "Backend scenarios could not be loaded. Using fallback medical scenarios.",
          );
        }

        if (aiResult.status === "fulfilled") {
          setAiScenario(aiResult.value);
        } else {
          setAiScenario({
            id: AI_SCENARIO_OPTION_ID,
            text: "A patient under airborne isolation precautions requires assessment.",
            category: "Airborne",
          });
        }
      } catch (error) {
        console.error(error);
        setMedicalScenarios(FALLBACK_MEDICAL_SCENARIOS);
        setAiScenario({
          id: AI_SCENARIO_OPTION_ID,
          text: "A patient under airborne isolation precautions requires assessment.",
          category: "Airborne",
        });
        setErrorMessage("Failed to load backend scenarios. Using fallback content.");
      } finally {
        setLoadingScenarios(false);
        setLoadingAiScenario(false);
      }
    };

    loadMedicalData();
  }, []);

  useEffect(() => {
    if (!videoRef.current || !cameraStream || !isCameraOn) return;
    videoRef.current.srcObject = cameraStream;
  }, [cameraStream, isCameraOn]);

  useEffect(() => {
    if (!timerActive) return;

    if (timerSecondsLeft <= 0) {
      setTimerActive(false);
      return;
    }

    const id = window.setTimeout(() => {
      setTimerSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(id);
  }, [timerActive, timerSecondsLeft]);

  useEffect(() => {
    if (!isCameraOn || !cameraStream) return;

    startLiveSocketLoop();

    return () => {
      stopLiveSocketLoop();
    };
  }, [isCameraOn, cameraStream, activeModelType]);

  useEffect(() => {
    return () => {
      stopLiveSocketLoop();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const drawBoundingBoxes = (
    detections: Detection[],
    imageSize: [number, number],
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

      const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
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

  const resetForNewRun = () => {
    stopCamera();
    setUploadedImage(null);
    setPreviewUrl(null);
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    setVisionBusy(false);
    setTimerActive(false);
    setTimerSecondsLeft(0);
    clearOverlay();
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      })),
    );
  };

  const handleSelectMode = (nextMode: "construction" | "medical") => {
    resetForNewRun();
    setMode(nextMode);

    if (nextMode === "construction") {
      setSelectedScenario(CONSTRUCTION_SCENARIO);
    } else {
      setSelectedScenario(null);
    }

    setStage("scenario");
  };

  const handleMedicalScenarioChange = (selectedId: number) => {
    const foundScenario =
      selectedId === AI_SCENARIO_OPTION_ID
        ? aiScenario
        : medicalScenarios.find((scenario) => scenario.id === selectedId) ?? null;

    setSelectedScenario(foundScenario);
    setSelectedMedicalScenarioId(selectedId);
  };

  const handleStartScenario = () => {
    if (!selectedScenario) {
      setErrorMessage("Please select a scenario first.");
      return;
    }
    setErrorMessage(null);
    setStage("camera");
  };

  const handleRestart = () => {
    resetForNewRun();
    setMode(null);
    setSelectedScenario(null);
    setSelectedMedicalScenarioId(null);
    setStage("modeSelect");
  };

  const handleBackToScenario = () => {
    stopCamera();
    setUploadedImage(null);
    setPreviewUrl(null);
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    clearOverlay();
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      })),
    );
    setStage("scenario");
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedImage(file);
    setResult(null);
    setErrorMessage(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      setCameraStream(stream);
      setIsCameraOn(true);
      setVisionOnline(false);
      setVisionBusy(false);
      setErrorMessage(null);
      clearOverlay();
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to access the camera. Please allow camera permissions.");
    }
  };

  const stopLiveSocketLoop = () => {
    if (sendIntervalRef.current !== null) {
      window.clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    inFlightRef.current = false;
    frameIdRef.current = 0;
    lastProcessedFrameRef.current = -1;
  };

  const connectLiveSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = createDetectionSocket();

    ws.onopen = () => {
      console.log("[WS] Connected");
      setVisionOnline(true);
      setErrorMessage(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "error") {
          console.error("[WS] Backend error:", data.error);
          setErrorMessage(data.error);
          return;
        }

        if (data.type !== "detection_result") return;

        const frameId = data.frame_id ?? -1;
        if (frameId < lastProcessedFrameRef.current) {
          return;
        }

        lastProcessedFrameRef.current = frameId;

        setLastDetections(data.detections);
        setLiveConfidences(
          normalizeDetectionsToConfidence(data.detections, ppeOptions),
        );
        drawBoundingBoxes(data.detections, data.image_size);
        setVisionOnline(true);
      } catch (error) {
        console.error("[WS] Failed to parse message:", error);
      } finally {
        inFlightRef.current = false;
        setVisionBusy(false);
      }
    };

    ws.onerror = (event) => {
      console.error("[WS] Socket error:", event);
      setVisionOnline(false);
      setVisionBusy(false);
      inFlightRef.current = false;
    };

    ws.onclose = () => {
      console.log("[WS] Closed");
      setVisionOnline(false);
      setVisionBusy(false);
      wsRef.current = null;
      inFlightRef.current = false;
    };

    wsRef.current = ws;
  };

  const captureFrameBase64 = async (): Promise<string | null> => {
    if (!videoRef.current || !captureCanvasRef.current) return null;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const targetWidth = 640;
    const targetHeight = 480;

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1] ?? null;
  };

  const startLiveSocketLoop = () => {
    stopLiveSocketLoop();
    connectLiveSocket();

    const SEND_INTERVAL = 350;

    sendIntervalRef.current = window.setInterval(async () => {
      if (!isCameraOn) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (inFlightRef.current) return;

      const imageBase64 = await captureFrameBase64();
      if (!imageBase64) return;

      const frameId = ++frameIdRef.current;

      inFlightRef.current = true;
      setVisionBusy(true);

      wsRef.current.send(
        JSON.stringify({
          type: "frame",
          frame_id: frameId,
          model_type: activeModelType,
          image: imageBase64,
        }),
      );
    }, SEND_INTERVAL);
  };

  const stopCamera = () => {
    stopLiveSocketLoop();

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setIsCameraOn(false);
    setVisionOnline(false);
    setVisionBusy(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    clearOverlay();
  };

  const capturePhotoFile = async (): Promise<File | null> => {
    if (!videoRef.current || !captureCanvasRef.current) return null;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.95);
    });

    if (!blob) return null;

    return new File([blob], "timer-capture.jpg", { type: "image/jpeg" });
  };

  const capturePhoto = async () => {
    const file = await capturePhotoFile();
    if (!file) return;
    setUploadedImage(file);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleStartMedicalTimer = () => {
    if (mode !== "medical") return;

    if (!isCameraOn) {
      setErrorMessage("Please open the live camera before starting the timer.");
      return;
    }

    if (!selectedScenario) {
      setErrorMessage("No scenario selected.");
      return;
    }

    setErrorMessage(null);
    setTimerSecondsLeft(getMedicalTimerSeconds(selectedScenario, mode));
    setTimerActive(true);
  };

  const handleCancelMedicalTimer = () => {
    setTimerActive(false);
    setTimerSecondsLeft(0);
  };

  const handleRunUploadDetection = async () => {
    if (!uploadedImage) {
      setErrorMessage("Please upload or capture an image first.");
      return;
    }

    try {
      setErrorMessage(null);
      setVisionBusy(true);

      const response = await detectUpload(uploadedImage, activeModelType);

      setLastDetections(response.detections);
      setLiveConfidences(
        normalizeDetectionsToConfidence(response.detections, ppeOptions),
      );
      setVisionOnline(true);
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to analyze the selected image.");
    } finally {
      setVisionBusy(false);
    }
  };

  const handleSubmitFinal = async () => {
    if (!uploadedImage) {
      setErrorMessage("Please upload or capture an image first.");
      return;
    }

    if (!selectedScenario) {
      setErrorMessage("No scenario selected.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const response = await detectAndGrade(
        uploadedImage,
        activeModelType,
        selectedScenario.text,
      );

      setResult(response);
      setStage("results");
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to submit final grading request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F4F1] px-4 py-8 text-[#2E1F27]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 text-center">
          <div className="mb-2 text-sm font-medium uppercase tracking-[0.3em] text-[#4059AD]">
            Computer Vision Hackathon
          </div>
          <h1 className="text-4xl font-bold">EPPEC</h1>
          <p className="mt-3 text-[#2E1F27]/75">
            PPE scenario training with image upload, live camera capture, and backend grading.
          </p>
          {submitting && (
            <p className="mt-2 text-sm text-[#4059AD]">Submitting final grading...</p>
          )}
        </header>

        {stage === "modeSelect" && (
          <ModeSelectScreen
            loadingScenarios={loadingScenarios}
            loadingAiScenario={loadingAiScenario}
            errorMessage={errorMessage}
            onSelectMode={handleSelectMode}
          />
        )}

        {stage === "scenario" && (
          <ScenarioScreen
            mode={mode}
            selectedScenario={selectedScenario}
            selectedMedicalScenarioId={selectedMedicalScenarioId}
            medicalScenarios={medicalScenarios}
            aiScenario={aiScenario}
            loadingAiScenario={loadingAiScenario}
            errorMessage={errorMessage}
            onMedicalScenarioChange={handleMedicalScenarioChange}
            onBack={handleRestart}
            onStart={handleStartScenario}
          />
        )}

        {stage === "camera" && selectedScenario && (
          <CameraScreen
            mode={mode}
            selectedScenario={selectedScenario}
            errorMessage={errorMessage}
            uploadedImage={uploadedImage}
            previewUrl={previewUrl}
            isCameraOn={isCameraOn}
            timerActive={timerActive}
            timerSecondsLeft={timerSecondsLeft}
            visionOnline={visionOnline}
            visionBusy={visionBusy}
            liveConfidences={liveConfidences}
            lastDetections={lastDetections}
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            overlayCanvasRef={overlayCanvasRef as React.RefObject<HTMLCanvasElement>}
            captureCanvasRef={captureCanvasRef as React.RefObject<HTMLCanvasElement>}
            onBack={handleBackToScenario}
            onImageChange={handleImageChange}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            onCapturePhoto={capturePhoto}
            onRunUploadDetection={handleRunUploadDetection}
            onSubmitFinal={handleSubmitFinal}
            onStartMedicalTimer={handleStartMedicalTimer}
            onCancelMedicalTimer={handleCancelMedicalTimer}
          />
        )}

        {stage === "results" && result && (
          <ResultsScreen
            result={result}
            onRestart={handleRestart}
            onBack={handleBackToScenario}
          />
        )}
      </div>
    </div>
  );
}