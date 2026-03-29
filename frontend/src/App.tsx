// File: frontend/src/App.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectUpload,
  fetchGeneratedScenario,
  fetchScenarios,
  type BackendScenario,
  type DetectAndGradeResponse,
  type Detection,
} from "./api";
import ConfidenceBar from "./components/ConfidenceBar";
import ResultScreen from "./screens/ResultScreen";

type AppStage = "modeSelect" | "scenario" | "camera" | "results";
type AppMode = "hurricane" | "medical" | null;

type DetectionConfidence = {
  item: string;
  confidence: number;
};

const AI_SCENARIO_OPTION_ID = -1;

const HURRICANE_SCENARIO: BackendScenario = {
  id: 1000,
  text: "A responder is entering a flood-damaged area with contaminated standing water, debris, unstable surfaces, and possible exposure to mold and sharp objects.",
  category: "Flood Response",
};

const FALLBACK_MEDICAL_SCENARIOS: BackendScenario[] = [
  { id: 1, text: "Routine blood draw on a stable patient.", category: "Standard" },
  { id: 2, text: "Patient presenting with fever and productive cough — suspected influenza.", category: "Droplet" },
  { id: 3, text: "Entering an isolation room for a patient with C. diff infection.", category: "Contact" },
  { id: 4, text: "Suspected tuberculosis — patient has persistent cough and night sweats.", category: "Airborne" },
  { id: 5, text: "Emergency intubation on an unknown-status patient with high aerosolization risk.", category: "High-Risk" },
];

const MEDICAL_PPE_OPTIONS = ["Gloves", "Coverall", "Mask", "Eye Protection", "Face Shield"];
const CONSTRUCTION_PPE_OPTIONS = ["Hard Hat", "Gloves", "Safety Vest", "Eye Protection"];

const LABEL_TO_DISPLAY: Record<string, string> = {
  gloves: "Gloves",
  coverall: "Coverall",
  mask: "Mask",
  goggles: "Eye Protection",
  eye_protection: "Eye Protection",
  face_shield: "Face Shield",
  hard_hat: "Hard Hat",
  safety_vest: "Safety Vest",
};

function toDisplayLabel(label: string): string {
  return LABEL_TO_DISPLAY[label] ?? label;
}

function getRequiredCountForTimer(selectedScenario: BackendScenario | null, mode: AppMode): number {
  if (!selectedScenario || mode !== "medical") return 1;
  if (selectedScenario.required?.length) return selectedScenario.required.length;
  switch (selectedScenario.category) {
    case "Standard": return 1;
    case "Contact": return 2;
    case "Droplet": return 4;
    case "Airborne": return 4;
    case "High-Risk": return 5;
    default: return 1;
  }
}

function getMedicalTimerSeconds(selectedScenario: BackendScenario | null, mode: AppMode): number {
  return 30 + Math.max(0, getRequiredCountForTimer(selectedScenario, mode) - 1) * 5;
}

function normalizeDetectionsToConfidence(detections: Detection[], options: string[]): DetectionConfidence[] {
  const map = new Map<string, number>();
  for (const option of options) map.set(option, 0);
  for (const detection of detections) {
    const displayLabel = toDisplayLabel(detection.label);
    const confidence = Math.round(detection.confidence * 100);
    const existing = map.get(displayLabel) ?? 0;
    map.set(displayLabel, Math.max(existing, confidence));
  }
  return options.map((item) => ({ item, confidence: map.get(item) ?? 0 }));
}

type UnsafeVestMatch = { vestIndex: number; vest: Detection };

function getBoxCenterX(d: Detection) { return (d.bbox.x1 + d.bbox.x2) / 2; }
function getBoxCenterY(d: Detection) { return (d.bbox.y1 + d.bbox.y2) / 2; }
function getHorizontalOverlap(a: Detection, b: Detection) {
  return Math.max(0, Math.min(a.bbox.x2, b.bbox.x2) - Math.max(a.bbox.x1, b.bbox.x1));
}

function hasHelmetAboveVest(vest: Detection, helmets: Detection[]): boolean {
  const vestCenterY = getBoxCenterY(vest);
  const vestWidth = vest.bbox.x2 - vest.bbox.x1;
  return helmets.some((helmet) => {
    const helmetCenterX = getBoxCenterX(helmet);
    const overlap = getHorizontalOverlap(vest, helmet);
    return (
      ((helmetCenterX >= vest.bbox.x1 && helmetCenterX <= vest.bbox.x2) || overlap >= vestWidth * 0.2) &&
      getBoxCenterY(helmet) < vestCenterY
    );
  });
}

function getUnsafeVestMatches(detections: Detection[]): UnsafeVestMatch[] {
  const vests = detections.map((d, i) => ({ detection: d, index: i })).filter(({ detection }) => detection.label === "safety_vest");
  const helmets = detections.filter((d) => d.label === "hard_hat");
  return vests
    .filter(({ detection }) => !hasHelmetAboveVest(detection, helmets))
    .map(({ detection, index }) => ({ vestIndex: index, vest: detection }));
}

function getScaledBBoxStyle(detection: Detection, video: HTMLVideoElement | null): React.CSSProperties {
  if (!video || video.videoWidth === 0) return { display: "none" };
  const scaleX = video.clientWidth / video.videoWidth;
  const scaleY = video.clientHeight / video.videoHeight;
  return {
    position: "absolute",
    left: `${detection.bbox.x1 * scaleX}px`,
    top: `${detection.bbox.y1 * scaleY}px`,
    width: `${(detection.bbox.x2 - detection.bbox.x1) * scaleX}px`,
    height: `${(detection.bbox.y2 - detection.bbox.y1) * scaleY}px`,
  };
}

// ── Truncate scenario text for select option labels ────────
function truncate(text: string, max = 60): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoOverlayRef = useRef<HTMLDivElement | null>(null);

  const [timerActive, setTimerActive] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);

  const [unsafeVestCountdownActive, setUnsafeVestCountdownActive] = useState(false);
  const [unsafeVestCountdownSecondsLeft, setUnsafeVestCountdownSecondsLeft] = useState(5);

  const [flashActive, setFlashActive] = useState(false);
  const [mustLeaveOverlay, setMustLeaveOverlay] = useState(false);

  const showMedicalCountdownWarning = mode === "medical" && isCameraOn && timerActive && timerSecondsLeft <= 10;

  const ppeOptions = useMemo(() => (mode === "hurricane" ? CONSTRUCTION_PPE_OPTIONS : MEDICAL_PPE_OPTIONS), [mode]);

  const unsafeVestMatches = useMemo(() => {
    if (mode !== "hurricane") return [];
    return getUnsafeVestMatches(lastDetections);
  }, [mode, lastDetections]);

  useEffect(() => {
    setLiveConfidences(ppeOptions.map((item) => ({ item, confidence: 0 })));
  }, [ppeOptions]);

  useEffect(() => {
    const loadMedicalData = async () => {
      try {
        setLoadingScenarios(true);
        setLoadingAiScenario(true);
        setErrorMessage(null);
        const [scenariosResult, aiResult] = await Promise.allSettled([fetchScenarios(), fetchGeneratedScenario()]);
        setMedicalScenarios(scenariosResult.status === "fulfilled" ? scenariosResult.value : FALLBACK_MEDICAL_SCENARIOS);
        setAiScenario(
          aiResult.status === "fulfilled"
            ? aiResult.value
            : { id: AI_SCENARIO_OPTION_ID, text: "A patient under airborne isolation precautions requires assessment.", category: "Airborne" }
        );
        if (scenariosResult.status === "rejected") setErrorMessage("Backend scenarios could not be loaded. Using fallback scenarios.");
      } catch {
        setMedicalScenarios(FALLBACK_MEDICAL_SCENARIOS);
        setAiScenario({ id: AI_SCENARIO_OPTION_ID, text: "A patient under airborne isolation precautions requires assessment.", category: "Airborne" });
        setErrorMessage("Failed to load backend scenarios. Using fallback content.");
      } finally {
        setLoadingScenarios(false);
        setLoadingAiScenario(false);
      }
    };
    void loadMedicalData();
  }, []);

  useEffect(() => {
    if (!uploadedImage) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(uploadedImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedImage]);

  useEffect(() => {
    if (!isCameraOn || !cameraStream || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = cameraStream;
    void video.play().catch(console.error);
  }, [isCameraOn, cameraStream]);

  useEffect(() => {
    return () => { cameraStream?.getTracks().forEach((t) => t.stop()); };
  }, [cameraStream]);

  useEffect(() => {
    if (stage !== "camera" || !isCameraOn) return;
    const interval = setInterval(() => { void sendLiveFrameForDetection(); }, 1000);
    return () => clearInterval(interval);
  }, [stage, isCameraOn, mode, ppeOptions]);

  useEffect(() => {
    if (!timerActive) return;
    if (timerSecondsLeft <= 0) {
      void (async () => {
        setTimerActive(false);
        const file = await capturePhotoFile();
        if (!file) { setErrorMessage("Could not capture image when timer ended."); return; }
        await handleSubmit(file);
      })();
      return;
    }
    const timeout = setTimeout(() => setTimerSecondsLeft((p) => p - 1), 1000);
    return () => clearTimeout(timeout);
  }, [timerActive, timerSecondsLeft]);

  useEffect(() => {
    if (mode !== "hurricane") { setUnsafeVestCountdownActive(false); setUnsafeVestCountdownSecondsLeft(5); return; }
    const hasUnsafeVest = unsafeVestMatches.length > 0;
    if (!isCameraOn || !hasUnsafeVest) { setUnsafeVestCountdownActive(false); setUnsafeVestCountdownSecondsLeft(5); return; }
    setUnsafeVestCountdownActive((prev) => { if (!prev) setUnsafeVestCountdownSecondsLeft(5); return true; });
  }, [mode, isCameraOn, unsafeVestMatches]);

  useEffect(() => {
    if (!unsafeVestCountdownActive || unsafeVestMatches.length === 0) return;
    if (unsafeVestCountdownSecondsLeft <= 0) { setUnsafeVestCountdownActive(false); setMustLeaveOverlay(true); return; }
    const timeout = setTimeout(() => setUnsafeVestCountdownSecondsLeft((p) => p - 1), 1000);
    return () => clearTimeout(timeout);
  }, [unsafeVestCountdownActive, unsafeVestCountdownSecondsLeft, unsafeVestMatches]);

  // ── Camera helpers ────────────────────────────────────────

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
    setVisionBusy(false);
    setTimerActive(false);
    setTimerSecondsLeft(0);
    setUnsafeVestCountdownActive(false);
    setUnsafeVestCountdownSecondsLeft(5);
    setMustLeaveOverlay(false);
  };

  const resetForNewRun = () => {
    stopCamera();
    setMustLeaveOverlay(false);
    setUploadedImage(null);
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    setLiveConfidences(ppeOptions.map((item) => ({ item, confidence: 0 })));
    setTimerActive(false);
    setTimerSecondsLeft(0);
    setUnsafeVestCountdownActive(false);
    setUnsafeVestCountdownSecondsLeft(5);
  };

  const handleSelectMode = (selectedMode: AppMode) => {
    resetForNewRun();
    setMode(selectedMode);
    if (selectedMode === "hurricane") {
      setSelectedScenario(HURRICANE_SCENARIO);
      setSelectedMedicalScenarioId(null);
      setStage("camera");
      return;
    }
    const firstScenario = medicalScenarios[0] ?? aiScenario ?? null;
    setSelectedScenario(firstScenario);
    setSelectedMedicalScenarioId(firstScenario?.id ?? null);
    setTimerActive(false);
    setTimerSecondsLeft(0);
    setStage("scenario");
  };

  const handleMedicalScenarioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = Number(event.target.value);
    setResult(null);
    setErrorMessage(null);
    if (selectedId === AI_SCENARIO_OPTION_ID && aiScenario) {
      setSelectedScenario(aiScenario);
      setSelectedMedicalScenarioId(AI_SCENARIO_OPTION_ID);
      return;
    }
    setSelectedScenario(medicalScenarios.find((s) => s.id === selectedId) ?? null);
    setSelectedMedicalScenarioId(selectedId);
  };

  const handleRestart = () => {
    resetForNewRun();
    setMode(null);
    setSelectedScenario(null);
    setSelectedMedicalScenarioId(null);
    setStage("modeSelect");
  };

  // FIX: hurricane has no scenario screen, go back to modeSelect
  const handleBackToScenario = () => {
    setMustLeaveOverlay(false);
    stopCamera();
    setUploadedImage(null);
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    setLiveConfidences(ppeOptions.map((item) => ({ item, confidence: 0 })));
    setStage(mode === "hurricane" ? "modeSelect" : "scenario");
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadedImage(event.target.files?.[0] ?? null);
    setResult(null);
    setErrorMessage(null);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCameraStream(stream);
      setIsCameraOn(true);
      setVisionOnline(false);
    } catch {
      alert("Unable to access the camera. Please allow camera permissions.");
    }
  };

  const capturePhotoFile = async (): Promise<File | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) return null;
    return new File([blob], "timer-capture.jpg", { type: "image/jpeg" });
  };

  const triggerCameraFlash = () => {
    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 120);
  };

  const capturePhoto = async () => {
    triggerCameraFlash();
    const file = await capturePhotoFile();
    if (file) setUploadedImage(file);
  };

  const handleStartMedicalTimer = () => {
    if (!isCameraOn) { setErrorMessage("Please open the live camera before starting the timer."); return; }
    if (!selectedScenario) { setErrorMessage("No scenario selected."); return; }
    setErrorMessage(null);
    setTimerSecondsLeft(getMedicalTimerSeconds(selectedScenario, mode));
    setTimerActive(true);
  };

  const handleCancelMedicalTimer = () => { setTimerActive(false); setTimerSecondsLeft(0); };

  const sendLiveFrameForDetection = async () => {
    if (visionBusy || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setVisionBusy(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) return;
      const liveFile = new File([blob], "live-frame.jpg", { type: "image/jpeg" });
      const modelType = mode === "hurricane" ? "construction" : "medical";
      const data = await detectUpload(liveFile, modelType);
      setLastDetections(data.detections);
      setLiveConfidences(normalizeDetectionsToConfidence(data.detections, ppeOptions));
      setVisionOnline(true);
    } catch {
      setVisionOnline(false);
    } finally {
      setVisionBusy(false);
    }
  };

  const handleSubmit = async (overrideFile?: File) => {
    if (!selectedScenario) return;
    const fileToSubmit = overrideFile ?? uploadedImage;
    if (!fileToSubmit) { setErrorMessage("Please upload or capture an image before submitting."); return; }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      const formData = new FormData();
      formData.append("file", fileToSubmit);
      const response = await fetch(
        `http://localhost:8000/detect-and-grade?scenario_text=${encodeURIComponent(selectedScenario.text)}&model_type=medical`,
        { method: "POST", body: formData }
      );
      if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
      const data = await response.json() as DetectAndGradeResponse;
      setUploadedImage(fileToSubmit);
      setResult(data);
      setLastDetections(data.detections);
      setVisionOnline(true);
      setStage("results");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit image to the backend.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#E2CFEA] text-[#2E1F27]">
      <header className="border-b-4 border-[#2E1F27] bg-[#4059AD] px-6 py-5">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold text-[#E2CFEA]">EPPEC</h1>
          <p className="mt-1 text-sm text-[#E2CFEA]/90">Employee Personal Protection Equipment Checker</p>
        </div>
      </header>

      {/* Hurricane "must leave" overlay */}
      {mustLeaveOverlay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black">
          <div className="px-6 text-center text-white">
            <h2 className="text-4xl font-bold">You need to leave</h2>
          </div>
        </div>
      )}
      {mustLeaveOverlay && (
        <button
          onClick={handleRestart}
          className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border-2 border-white bg-[#F5CB5C] px-6 py-3 font-medium text-[#2E1F27] transition hover:brightness-95"
        >
          Restart
        </button>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* ── Mode Select ── */}
        {stage === "modeSelect" && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">Choose Test Mode</h2>
            <p className="mb-6 text-[#2E1F27]/75">Select which PPE workflow you want to test.</p>

            {(loadingScenarios || loadingAiScenario) && (
              <div className="mb-4 rounded-xl border-2 border-[#4059AD] bg-[#E2CFEA] px-4 py-3 text-sm">
                Loading medical scenarios…
              </div>
            )}
            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div
                onClick={() => handleSelectMode("hurricane")}
                className="cursor-pointer rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-5 transition hover:border-[#419D78]"
              >
                <div className="mb-2 text-lg font-semibold">Hurricane Flood Response</div>
                <p className="text-sm text-[#2E1F27]/75">Live construction-model detection with helmet/vest safety checks.</p>
              </div>
              <div
                onClick={() => {
                  if (!loadingScenarios && !loadingAiScenario && (medicalScenarios.length > 0 || aiScenario)) {
                    handleSelectMode("medical");
                  }
                }}
                className={`rounded-2xl border-2 p-5 transition ${
                  loadingScenarios || loadingAiScenario
                    ? "cursor-not-allowed border-[#2E1F27] opacity-50"
                    : "cursor-pointer border-[#2E1F27] hover:border-[#419D78]"
                }`}
              >
                <div className="mb-2 text-lg font-semibold">Medical PPE</div>
                <p className="text-sm text-[#2E1F27]/75">Select a clinical scenario, then let the camera verify your PPE.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Scenario Select ── */}
        {stage === "scenario" && selectedScenario && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">Medical PPE</div>
            <h2 className="mb-3 text-2xl font-semibold">Choose a Scenario</h2>

            {/* FIX: show scenario text in options, not just category */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Select a clinical scenario</label>
              <select
                value={selectedMedicalScenarioId ?? ""}
                onChange={handleMedicalScenarioChange}
                disabled={loadingAiScenario}
                className="w-full rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-3 py-3"
              >
                {medicalScenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    [{scenario.category}] {truncate(scenario.text)}
                  </option>
                ))}
                {aiScenario && (
                  <option value={AI_SCENARIO_OPTION_ID}>
                    [AI] {truncate(aiScenario.text)}
                  </option>
                )}
              </select>
            </div>

            {/* Full scenario text */}
            <div className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
              <p className="leading-7">{selectedScenario.text}</p>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStage("camera")}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
              >
                Start PPE Challenge
              </button>
              <button
                onClick={handleRestart}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Camera Stage ── */}
        {stage === "camera" && selectedScenario && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
              {mode === "hurricane" ? "Hurricane Flood Response" : "Medical PPE"}
            </div>
            <h2 className="mb-1 text-2xl font-semibold">Live Camera Detection</h2>
            <p className="mb-5 text-sm text-[#2E1F27]/75">
              {mode === "hurricane"
                ? "Stand in front of the camera in your PPE. A vest without a hard hat triggers a warning."
                : "Put on your PPE, then capture a photo or start the timed challenge."}
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
              {/* Left column */}
              <div>
                {mode !== "hurricane" && (
                  <label className="mb-4 block">
                    <span className="mb-2 block font-semibold text-[#07020D]">Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="block w-full rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-2 text-[#07020D]"
                    />
                  </label>
                )}

                <div className="mb-4 flex flex-wrap gap-3">
                  {!isCameraOn ? (
                    <button
                      onClick={startCamera}
                      className="rounded-xl border-2 border-[#2E1F27] bg-[#4059AD] px-4 py-2 font-medium text-[#E2CFEA] transition hover:brightness-95"
                    >
                      Open Live Camera
                    </button>
                  ) : (
                    <>
                      {mode !== "hurricane" && (
                        <button
                          onClick={() => void capturePhoto()}
                          className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
                        >
                          Capture Snapshot
                        </button>
                      )}

                      {mode === "medical" ? (
                        timerActive ? (
                          <button
                            onClick={handleCancelMedicalTimer}
                            className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-medium text-[#E2CFEA] transition hover:brightness-95"
                          >
                            Cancel Timer ({timerSecondsLeft}s)
                          </button>
                        ) : (
                          <button
                            onClick={handleStartMedicalTimer}
                            className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-medium text-[#E2CFEA] transition hover:brightness-95"
                          >
                            Start Timer ({getMedicalTimerSeconds(selectedScenario, mode)}s)
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => void sendLiveFrameForDetection()}
                          className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-medium text-[#E2CFEA] transition hover:brightness-95"
                        >
                          Run Detection Now
                        </button>
                      )}

                      <button
                        onClick={stopCamera}
                        className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
                      >
                        Stop Camera
                      </button>
                    </>
                  )}
                </div>

                {mode === "medical" && (
                  <div className="mb-4 rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Timed Medical PPE Challenge</div>
                        <div className="text-xs text-[#2E1F27]/75">Base 30s + 5s per additional required item.</div>
                      </div>
                      <div
                        className={`text-2xl font-bold transition-colors ${
                          timerActive && timerSecondsLeft <= 10 ? "text-red-600" : "text-[#2E1F27]"
                        }`}
                      >
                        {timerActive ? `${timerSecondsLeft}s` : `${getMedicalTimerSeconds(selectedScenario, mode)}s`}
                      </div>
                    </div>
                    {/* Timer progress bar */}
                    {timerActive && (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#2E1F27]/10">
                        <div
                          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                          style={{
                            width: `${(timerSecondsLeft / getMedicalTimerSeconds(selectedScenario, mode)) * 100}%`,
                            backgroundColor: timerSecondsLeft <= 10 ? "#ef4444" : "#419D78",
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isCameraOn && (
                  <div
                    className={`relative mb-4 rounded-xl border-2 bg-black p-2 transition-colors ${
                      showMedicalCountdownWarning ? "border-red-600" : "border-[#2E1F27]"
                    }`}
                  >
                    <div ref={videoOverlayRef} className="relative">
                      <video ref={videoRef} autoPlay playsInline muted className="block w-full rounded-lg" />
                      {flashActive && (
                        <div className="pointer-events-none absolute inset-0 rounded-lg bg-white opacity-90" />
                      )}
                      {/* Hurricane bounding boxes */}
                      {mode === "hurricane" && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                          {lastDetections.map((detection, index) => {
                            const isUnsafeVest =
                              detection.label === "safety_vest" &&
                              unsafeVestMatches.some((m) => m.vestIndex === index);
                            return (
                              <div
                                key={`${detection.label}-${index}`}
                                style={getScaledBBoxStyle(detection, videoRef.current)}
                                className={`border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${isUnsafeVest ? "border-red-600" : "border-[#F5CB5C]"}`}
                              >
                                <div
                                  className={`absolute left-0 top-0 -translate-y-full rounded-t-md px-2 py-1 text-xs font-bold ${
                                    isUnsafeVest ? "bg-red-600 text-white" : "bg-[#F5CB5C] text-[#2E1F27]"
                                  }`}
                                >
                                  {toDisplayLabel(detection.label)} {Math.round(detection.confidence * 100)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {showMedicalCountdownWarning && (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-4">
                        <div className="rounded-lg bg-red-600 px-4 py-2 text-lg font-bold text-white shadow-lg">
                          {timerSecondsLeft}s
                        </div>
                      </div>
                    )}
                    {mode === "hurricane" && unsafeVestCountdownActive && unsafeVestMatches.length > 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-start p-4">
                        <div className="rounded-lg bg-red-600 px-4 py-2 text-lg font-bold text-white shadow-lg">
                          Helmet needed: {unsafeVestCountdownSecondsLeft}s
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />

                {mode !== "hurricane" && (
                  <div className="mb-6 overflow-hidden rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA]">
                    {previewUrl ? (
                      <img src={previewUrl} alt="PPE preview" className="h-80 w-full object-contain" />
                    ) : (
                      <div className="flex h-80 items-center justify-center text-sm text-[#2E1F27]/65">
                        No captured or uploaded image selected
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  {mode === "hurricane" && !mustLeaveOverlay && (
                    <button
                      onClick={handleRestart}
                      className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
                    >
                      Restart
                    </button>
                  )}
                  {mode !== "hurricane" && (
                    <button
                      onClick={() => void handleSubmit()}
                      disabled={submitting}
                      className={`rounded-xl border-2 border-[#2E1F27] px-4 py-2 font-medium transition ${
                        submitting ? "cursor-not-allowed bg-[#2E1F27]/20" : "bg-[#F5CB5C] hover:brightness-95"
                      }`}
                    >
                      {submitting ? "Processing…" : "Submit Image"}
                    </button>
                  )}
                  <button
                    onClick={handleBackToScenario}
                    className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
                  >
                    Back
                  </button>
                </div>
              </div>

              {/* Right aside — FIX: show confidence bars instead of raw bbox coords */}
              {mode !== "hurricane" && (
                <aside className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Live Detection</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        visionOnline ? "border-[#419D78] text-[#419D78]" : "border-[#4059AD] text-[#4059AD]"
                      }`}
                    >
                      {visionOnline ? "Vision Online" : "Waiting…"}
                    </span>
                  </div>

                  {/* Confidence bars for each PPE option */}
                  <div className="mb-4">
                    {liveConfidences.map(({ item, confidence }) => (
                      <ConfidenceBar key={item} item={item} confidence={confidence} />
                    ))}
                  </div>

                  {/* Scenario reminder */}
                  <div className="mt-4 rounded-lg border border-[#2E1F27]/20 bg-[#E2CFEA] p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#2E1F27]/50">Scenario</p>
                    <p className="text-xs leading-relaxed text-[#2E1F27]/80">{selectedScenario.text}</p>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* ── Results ── FIX: use ResultScreen component */}
        {stage === "results" && result && (
          <ResultScreen
            result={result}
            previewUrl={previewUrl}
            mode={mode}
            onRestart={handleRestart}
            onBackToScenario={handleBackToScenario}
          />
        )}
      </main>
    </div>
  );
}