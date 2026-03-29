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
import { AUDIO } from "./audio/keys";
import { useSound } from "./audio/useSound";
import { useAiScenarioAudio } from "./audio/useAiScenarioAudio";

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

  // ── Audio ─────────────────────────────────────────────
  const { play, playBlob, stop } = useSound();
  const { blobUrl: aiScenarioBlobUrl } = useAiScenarioAudio(
    aiScenario?.text ?? null
  );

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
        play(AUDIO.TIMER_END);
        const file = await capturePhotoFile();
        if (!file) { setErrorMessage("Could not capture image when timer ended."); return; }
        await handleSubmit(file);
      })();
      return;
    }
    const timeout = setTimeout(() => setTimerSecondsLeft((p) => p - 1), 1000);
    // Play warning once when hitting 10s
    if (timerSecondsLeft === 10) play(AUDIO.TIMER_WARNING);
    return () => clearTimeout(timeout);
  }, [timerActive, timerSecondsLeft]);

  useEffect(() => {
    if (mode !== "hurricane") { setUnsafeVestCountdownActive(false); setUnsafeVestCountdownSecondsLeft(5); return; }
    if (mustLeaveOverlay) return; // already failed — don't restart the warning
    const hasUnsafeVest = unsafeVestMatches.length > 0;
    if (!isCameraOn || !hasUnsafeVest) { setUnsafeVestCountdownActive(false); setUnsafeVestCountdownSecondsLeft(5); return; }
    setUnsafeVestCountdownActive((prev) => {
      if (!prev) {
        setUnsafeVestCountdownSecondsLeft(5);
        play(AUDIO.WARNING_HELMET_NEEDED);
      }
      return true;
    });
  }, [mode, isCameraOn, unsafeVestMatches, mustLeaveOverlay]);

  useEffect(() => {
    if (!unsafeVestCountdownActive || unsafeVestMatches.length === 0) return;
    if (unsafeVestCountdownSecondsLeft <= 0) {
      setUnsafeVestCountdownActive(false);
      setMustLeaveOverlay(true);
      play(AUDIO.WARNING_MUST_LEAVE);
      return;
    }
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
    play(AUDIO.TIMER_START);
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

      // Play outcome audio
      const outcomeAudioMap: Record<string, typeof AUDIO[keyof typeof AUDIO]> = {
        correct:        AUDIO.OUTCOME_CORRECT,
        incomplete:     AUDIO.OUTCOME_INCOMPLETE,
        "over-protected": AUDIO.OUTCOME_OVER_PROTECTED,
        incorrect:      AUDIO.OUTCOME_INCORRECT,
      };
      const outcomeKey = outcomeAudioMap[data.outcome];
      if (outcomeKey) play(outcomeKey);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit image to the backend.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  // ── Category badge colours ───────────────────────────────
  const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Standard:  { bg: "#419D78",  text: "#fff",     border: "#419D78"  },
    Contact:   { bg: "#4059AD",  text: "#fff",     border: "#4059AD"  },
    Droplet:   { bg: "#F5CB5C",  text: "#2E1F27",  border: "#F5CB5C"  },
    Airborne:  { bg: "#E07A5F",  text: "#fff",     border: "#E07A5F"  },
    "High-Risk":{ bg: "#C62828", text: "#fff",     border: "#C62828"  },
    AI:        { bg: "#7B2D8B",  text: "#fff",     border: "#7B2D8B"  },
  };

  const allScenarioCards = [
    ...medicalScenarios,
    ...(aiScenario ? [{ ...aiScenario, id: AI_SCENARIO_OPTION_ID, _isAi: true }] : []),
  ] as (BackendScenario & { _isAi?: boolean })[];

  return (
    <div className="min-h-screen bg-[#E2CFEA] text-[#2E1F27]" style={{ backgroundImage: "radial-gradient(circle, #2E1F2718 1px, transparent 1px)", backgroundSize: "24px 24px" }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="border-b-4 border-[#F5CB5C] bg-[#4059AD] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#E2CFEA]/40 bg-[#E2CFEA]/10 text-xl">
              🛡️
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-none text-[#E2CFEA]">EPPEC</h1>
              <p className="text-xs text-[#E2CFEA]/70">Personal Protection Equipment Checker</p>
            </div>
          </div>
          {/* Stage breadcrumb */}
          <div className="hidden items-center gap-2 text-xs font-medium text-[#E2CFEA]/60 sm:flex">
            {(["modeSelect","scenario","camera","results"] as AppStage[]).map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span>›</span>}
                <span className={stage === s ? "text-[#F5CB5C]" : ""}>
                  {s === "modeSelect" ? "Mode" : s === "scenario" ? "Scenario" : s === "camera" ? "Camera" : "Results"}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Hurricane "must leave" overlay ───────────────────── */}
      {mustLeaveOverlay && (
        <>
          <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-black">
            <div className="text-8xl">⚠️</div>
            <h2 className="text-5xl font-black tracking-tight text-white">You must leave now.</h2>
            <p className="text-lg text-white/60">PPE non-compliance detected — area unsafe.</p>
          </div>
          <button
            onClick={handleRestart}
            className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-xl border-2 border-white bg-[#F5CB5C] px-8 py-3 font-bold text-[#2E1F27] transition hover:brightness-95"
          >
            ← Restart
          </button>
        </>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8">

        {/* ── Mode Select ──────────────────────────────────────── */}
        {stage === "modeSelect" && (
          <div>
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-3xl font-bold">Choose a Mode</h2>
              <p className="text-[#2E1F27]/60">Select the PPE workflow to run the live check against.</p>
              <div className="mx-auto mt-4 flex items-center justify-center gap-1.5">
                <span className="h-1.5 w-6 rounded-full bg-[#4059AD]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#419D78]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#F5CB5C]" />
              </div>
            </div>

            {(loadingScenarios || loadingAiScenario) && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-[#4059AD] bg-[#E2CFEA] px-4 py-3 text-sm">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#4059AD] border-t-transparent" />
                Loading scenarios…
              </div>
            )}
            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              {/* Hurricane card */}
              <button
                onClick={() => handleSelectMode("hurricane")}
                className="group flex flex-col rounded-2xl border-2 border-t-4 border-[#2E1F27] border-t-[#F5CB5C] bg-[#E2CFEA] p-6 text-left transition hover:shadow-lg hover:shadow-[#F5CB5C]/20"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#2E1F27] bg-[#4059AD] text-3xl transition group-hover:scale-105">
                  🌊
                </div>
                <div className="mb-1 text-xl font-bold">Hurricane Response</div>
                <p className="mb-4 flex-1 text-sm text-[#2E1F27]/65">
                  Live construction-model detection. Vest without a hard hat triggers a countdown evacuation warning.
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#4059AD] px-3 py-0.5 text-xs font-semibold text-white">Construction model</span>
                  <span className="rounded-full bg-[#2E1F27]/10 px-3 py-0.5 text-xs font-semibold text-[#2E1F27]/60">Live only</span>
                </div>
              </button>

              {/* Medical card */}
              <button
                onClick={() => {
                  if (!loadingScenarios && !loadingAiScenario && (medicalScenarios.length > 0 || aiScenario)) {
                    handleSelectMode("medical");
                  }
                }}
                disabled={loadingScenarios || loadingAiScenario}
                className="group flex flex-col rounded-2xl border-2 border-t-4 border-[#2E1F27] border-t-[#419D78] bg-[#E2CFEA] p-6 text-left transition hover:shadow-lg hover:shadow-[#419D78]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#2E1F27] bg-[#419D78] text-3xl transition group-hover:scale-105">
                  🏥
                </div>
                <div className="mb-1 text-xl font-bold">Medical PPE</div>
                <p className="mb-4 flex-1 text-sm text-[#2E1F27]/65">
                  Pick a clinical scenario, don your PPE, then capture a photo or race the timer to get graded.
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#419D78] px-3 py-0.5 text-xs font-semibold text-white">Medical model</span>
                  <span className="rounded-full bg-[#2E1F27]/10 px-3 py-0.5 text-xs font-semibold text-[#2E1F27]/60">Timed challenge</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Scenario Select ──────────────────────────────────── */}
        {stage === "scenario" && selectedScenario && (
          <div>
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#4059AD]" />
                <div className="text-xs font-semibold uppercase tracking-widest text-[#4059AD]">Medical PPE</div>
              </div>
              <h2 className="text-3xl font-bold">Pick a Scenario</h2>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            {/* Clickable scenario cards */}
            <div className="mb-6 space-y-3">
              {allScenarioCards.map((scenario) => {
                const catKey = scenario._isAi ? "AI" : scenario.category;
                const colors = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS["Standard"];
                const isSelected = selectedMedicalScenarioId === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    onClick={() => {
                      setResult(null);
                      setErrorMessage(null);
                      setSelectedScenario(scenario);
                      setSelectedMedicalScenarioId(scenario.id);
                    }}
                    className="flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition hover:shadow-md"
                    style={isSelected
                      ? { borderColor: colors.bg, backgroundColor: colors.bg + "18" }
                      : { borderColor: "#2E1F2730", backgroundColor: "#E2CFEA" }
                    }
                  >
                    {/* Category badge */}
                    <span
                      className="mt-0.5 flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {catKey}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed">{scenario.text}</span>
                    {isSelected && (
                      <span className="mt-0.5 flex-shrink-0 font-bold" style={{ color: colors.bg }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStage("camera");
                  if (selectedMedicalScenarioId === AI_SCENARIO_OPTION_ID && aiScenarioBlobUrl) {
                    playBlob(aiScenarioBlobUrl);
                  } else if (mode === "hurricane") {
                    play(AUDIO.SCENARIO_BRIEFING_HURRICANE);
                  } else {
                    // Map scenario ID to its pre-recorded briefing key
                    const briefingMap: Record<number, typeof AUDIO[keyof typeof AUDIO]> = {
                      1: AUDIO.SCENARIO_BRIEFING_1,
                      2: AUDIO.SCENARIO_BRIEFING_2,
                      3: AUDIO.SCENARIO_BRIEFING_3,
                      4: AUDIO.SCENARIO_BRIEFING_4,
                      5: AUDIO.SCENARIO_BRIEFING_5,
                    };
                    const key = selectedMedicalScenarioId !== null
                      ? briefingMap[selectedMedicalScenarioId]
                      : undefined;
                    if (key) play(key);
                    else play(AUDIO.SCENARIO_SELECTED);
                  }
                }}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-5 py-2.5 font-semibold transition hover:brightness-95"
              >
                Start PPE Challenge →
              </button>
              <button
                onClick={handleRestart}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-5 py-2.5 font-medium transition hover:border-[#419D78]"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Camera Stage ─────────────────────────────────────── */}
        {stage === "camera" && selectedScenario && (
          <div className="rounded-2xl border-2 border-l-4 border-[#2E1F27] border-l-[#4059AD] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#4059AD]">
              {mode === "hurricane" ? "Hurricane Response" : "Medical PPE"}
            </div>
            <h2 className="mb-1 text-2xl font-bold">Live Detection</h2>
            <p className="mb-5 text-sm text-[#2E1F27]/60">
              {mode === "hurricane"
                ? "Vest without a hard hat triggers a 5-second evacuation countdown."
                : "Put on your PPE, then capture or start the timed challenge."}
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3 text-sm">{errorMessage}</div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
              {/* ── Left column ── */}
              <div>
                {mode !== "hurricane" && (
                  <label className="mb-4 block">
                    <span className="mb-1.5 block text-sm font-semibold">Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="block w-full rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-2 text-sm"
                    />
                  </label>
                )}

                {/* Action buttons */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {!isCameraOn ? (
                    <button
                      onClick={startCamera}
                      className="flex items-center gap-2 rounded-xl border-2 border-[#2E1F27] bg-[#4059AD] px-4 py-2 font-semibold text-[#E2CFEA] transition hover:brightness-95"
                    >
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      Open Camera
                    </button>
                  ) : (
                    <>
                      {mode !== "hurricane" && (
                        <button
                          onClick={() => void capturePhoto()}
                          className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-semibold transition hover:brightness-95"
                        >
                          📸 Capture
                        </button>
                      )}
                      {mode === "medical" ? (
                        timerActive ? (
                          <button
                            onClick={handleCancelMedicalTimer}
                            className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-semibold text-white transition hover:brightness-95"
                          >
                            ⏹ Cancel ({timerSecondsLeft}s)
                          </button>
                        ) : (
                          <button
                            onClick={handleStartMedicalTimer}
                            className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-semibold text-white transition hover:brightness-95"
                          >
                            ⏱ Start Timer ({getMedicalTimerSeconds(selectedScenario, mode)}s)
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => void sendLiveFrameForDetection()}
                          className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-semibold text-white transition hover:brightness-95"
                        >
                          ▶ Detect Now
                        </button>
                      )}
                      <button
                        onClick={stopCamera}
                        className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-red-400 hover:text-red-500"
                      >
                        ■ Stop
                      </button>
                    </>
                  )}
                </div>

                {/* Timer bar */}
                {mode === "medical" && (
                  <div className="mb-4 rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Timed Challenge</div>
                        <div className="text-xs text-[#2E1F27]/60">30s base + 5s per extra item required</div>
                      </div>
                      <div className={`text-3xl font-black tabular-nums transition-colors ${timerActive && timerSecondsLeft <= 10 ? "text-red-600" : "text-[#2E1F27]"}`}>
                        {timerActive ? `${timerSecondsLeft}` : `${getMedicalTimerSeconds(selectedScenario, mode)}`}
                        <span className="text-base font-normal text-[#2E1F27]/50">s</span>
                      </div>
                    </div>
                    {timerActive && (
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#2E1F27]/10">
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

                {/* Camera feed */}
                {isCameraOn && (
                  <div className={`relative mb-4 overflow-hidden rounded-xl border-2 bg-black transition-colors ${showMedicalCountdownWarning ? "border-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.25)]" : "border-[#2E1F27]"}`}>
                    <div ref={videoOverlayRef} className="relative">
                      <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
                      {flashActive && (
                        <div className="pointer-events-none absolute inset-0 bg-white opacity-90" />
                      )}
                      {mode === "hurricane" && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                          {lastDetections.map((detection, index) => {
                            const isUnsafeVest = detection.label === "safety_vest" && unsafeVestMatches.some((m) => m.vestIndex === index);
                            return (
                              <div
                                key={`${detection.label}-${index}`}
                                style={getScaledBBoxStyle(detection, videoRef.current)}
                                className={`border-2 ${isUnsafeVest ? "border-red-500" : "border-[#F5CB5C]"}`}
                              >
                                <div className={`absolute left-0 top-0 -translate-y-full px-2 py-0.5 text-xs font-bold ${isUnsafeVest ? "bg-red-500 text-white" : "bg-[#F5CB5C] text-[#2E1F27]"}`}>
                                  {toDisplayLabel(detection.label)} {Math.round(detection.confidence * 100)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Countdown overlays */}
                    {showMedicalCountdownWarning && (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-3">
                        <div className="rounded-lg bg-red-600 px-4 py-2 text-2xl font-black text-white shadow-lg">
                          {timerSecondsLeft}s
                        </div>
                      </div>
                    )}
                    {mode === "hurricane" && unsafeVestCountdownActive && unsafeVestMatches.length > 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-start p-3">
                        <div className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg">
                          ⚠️ Helmet needed: {unsafeVestCountdownSecondsLeft}s
                        </div>
                      </div>
                    )}

                    {/* Live indicator chip */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      LIVE
                    </div>
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />

                {mode !== "hurricane" && (
                  <div className="mb-5 overflow-hidden rounded-xl border-2 border-[#2E1F27] bg-[#2E1F27]/5">
                    {previewUrl ? (
                      <img src={previewUrl} alt="PPE preview" className="h-72 w-full object-contain" />
                    ) : (
                      <div className="flex h-72 flex-col items-center justify-center gap-2 text-[#2E1F27]/40">
                        <span className="text-3xl">📷</span>
                        <span className="text-sm">No image yet</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  {mode === "hurricane" && !mustLeaveOverlay && (
                    <button onClick={handleRestart} className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-semibold transition hover:brightness-95">
                      ← Restart
                    </button>
                  )}
                  {mode !== "hurricane" && (
                    <button
                      onClick={() => void handleSubmit()}
                      disabled={submitting}
                      className={`rounded-xl border-2 border-[#2E1F27] px-5 py-2 font-semibold transition ${submitting ? "cursor-not-allowed bg-[#2E1F27]/15 text-[#2E1F27]/40" : "bg-[#F5CB5C] hover:brightness-95"}`}
                    >
                      {submitting ? "Analysing…" : "Submit & Grade →"}
                    </button>
                  )}
                  <button onClick={handleBackToScenario} className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]">
                    ← Back
                  </button>
                </div>
              </div>

              {/* ── Right aside — confidence bars ── */}
              {mode !== "hurricane" && (
                <aside className="flex flex-col gap-4">
                  {/* Live status header */}
                  <div className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wide">PPE Confidence</h3>
                      <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${visionOnline ? "border-[#419D78] text-[#419D78]" : "border-[#2E1F27]/30 text-[#2E1F27]/40"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${visionOnline ? "animate-pulse bg-[#419D78]" : "bg-[#2E1F27]/30"}`} />
                        {visionOnline ? "Live" : "Offline"}
                      </span>
                    </div>
                    {liveConfidences.map(({ item, confidence }) => (
                      <ConfidenceBar key={item} item={item} confidence={confidence} />
                    ))}
                  </div>

                  {/* Scenario reminder */}
                  <div className="rounded-xl border-2 border-[#2E1F27]/20 bg-[#E2CFEA] p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2E1F27]/40">Active Scenario</p>
                    <p className="text-sm leading-relaxed text-[#2E1F27]/80">{selectedScenario.text}</p>
                    {selectedScenario.category && (
                      <span
                        className="mt-3 inline-block rounded-lg px-2.5 py-1 text-xs font-bold"
                        style={{
                          backgroundColor: (CATEGORY_COLORS[selectedScenario.category] ?? CATEGORY_COLORS["Standard"]).bg,
                          color: (CATEGORY_COLORS[selectedScenario.category] ?? CATEGORY_COLORS["Standard"]).text,
                        }}
                      >
                        {selectedScenario.category}
                      </span>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* ── Results ── */}
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