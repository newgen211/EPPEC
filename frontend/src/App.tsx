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

const AI_SCENARIO_OPTION_ID = -1;

const CONSTRUCTION_SCENARIO: BackendScenario = {
  id: 1000,
  text: "A construction worker is entering a site with potential hazards.",
  category: "Construction Response",
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ppeOptions = useMemo(() => {
    return mode === "construction" ? CONSTRUCTION_PPE_OPTIONS : MEDICAL_PPE_OPTIONS;
  }, [mode]);

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
    if (!isCameraOn) return;

    const intervalId = window.setInterval(() => {
      void sendLiveFrameForDetection();
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [isCameraOn, mode, uploadedImage, selectedScenario, visionBusy]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [previewUrl, cameraStream]);

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
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to access the camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setIsCameraOn(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhotoFile = async (): Promise<File | null> => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
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

  const sendLiveFrameForDetection = async () => {
    if (visionBusy) return;
    if (!videoRef.current || !canvasRef.current) return;

    const file = await capturePhotoFile();
    if (!file) return;

    const modelType = mode === "construction" ? "construction" : "medical";

    try {
      setVisionBusy(true);
      const response = await detectUpload(file, modelType);

      setLastDetections(response.detections);
      setLiveConfidences(
        normalizeDetectionsToConfidence(response.detections, ppeOptions),
      );
      setVisionOnline(true);
    } catch (error) {
      console.error(error);
      setVisionOnline(false);
    } finally {
      setVisionBusy(false);
    }
  };

  const handleRunUploadDetection = async () => {
    if (!uploadedImage) {
      setErrorMessage("Please upload or capture an image first.");
      return;
    }

    const modelType = mode === "construction" ? "construction" : "medical";

    try {
      setErrorMessage(null);
      setVisionBusy(true);

      const response = await detectUpload(uploadedImage, modelType);

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

    const modelType = mode === "construction" ? "construction" : "medical";

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const response = await detectAndGrade(
        uploadedImage,
        modelType,
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
            videoRef={videoRef}
            canvasRef={canvasRef}
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