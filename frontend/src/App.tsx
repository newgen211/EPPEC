import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectAndGrade,
  detectUpload,
  fetchGeneratedScenario,
  fetchScenarios,
  type BackendScenario,
  type DetectAndGradeResponse,
  type Detection,
} from "./api";

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

const MEDICAL_PPE_OPTIONS = [
  "Gloves",
  "Coverall",
  "Mask",
  "Eye Protection",
  "Face Shield",
];

const CONSTRUCTION_PPE_OPTIONS = [
  "Hard Hat",
  "Gloves",
  "Safety Vest",
  "Eye Protection",
];

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

function getConfidenceColor(confidence: number): string {
  if (confidence >= 75) return "#419D78";
  if (confidence >= 40) return "#F5CB5C";
  return "#4059AD";
}

function toDisplayLabel(label: string): string {
  return LABEL_TO_DISPLAY[label] ?? label;
}

function getRequiredCountForTimer(
  selectedScenario: BackendScenario | null,
  mode: AppMode
): number {
  if (!selectedScenario || mode !== "medical") return 1;

  if (selectedScenario.required?.length) {
    return selectedScenario.required.length;
  }

  switch (selectedScenario.category) {
    case "Standard":
      return 1;
    case "Contact":
      return 2;
    case "Droplet":
      return 4;
    case "Airborne":
      return 4;
    case "High-Risk":
      return 5;
    default:
      return 1;
  }
}

function getMedicalTimerSeconds(
  selectedScenario: BackendScenario | null,
  mode: AppMode
): number {
  const requiredCount = getRequiredCountForTimer(selectedScenario, mode);
  return 30 + Math.max(0, requiredCount - 1) * 5;
}

function normalizeDetectionsToConfidence(
  detections: Detection[],
  options: string[]
): DetectionConfidence[] {
  const map = new Map<string, number>();

  for (const option of options) {
    map.set(option, 0);
  }

  for (const detection of detections) {
    const displayLabel = toDisplayLabel(detection.label);
    const confidence = Math.round(detection.confidence * 100);
    const existing = map.get(displayLabel) ?? 0;
    map.set(displayLabel, Math.max(existing, confidence));
  }

  return options.map((item) => ({
    item,
    confidence: map.get(item) ?? 0,
  }));
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
  
  const [timerActive, setTimerActive] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);

  const showMedicalCountdownWarning =
    mode === "medical" &&
    isCameraOn &&
    timerActive &&
    timerSecondsLeft <= 10;

  const ppeOptions = useMemo(() => {
    return mode === "hurricane" ? CONSTRUCTION_PPE_OPTIONS : MEDICAL_PPE_OPTIONS;
  }, [mode]);

  useEffect(() => {
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      }))
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
          setErrorMessage("Backend scenarios could not be loaded. Using fallback medical scenarios.");
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
    if (!uploadedImage) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(uploadedImage);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadedImage]);

  useEffect(() => {
    if (!isCameraOn || !cameraStream || !videoRef.current) return;

    const video = videoRef.current;
    video.srcObject = cameraStream;

    const startPlayback = async () => {
      try {
        await video.play();
      } catch (error) {
        console.error("Video playback failed:", error);
      }
    };

    void startPlayback();
  }, [isCameraOn, cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  useEffect(() => {
    if (stage !== "camera" || !isCameraOn) return;

    const interval = setInterval(() => {
      void sendLiveFrameForDetection();
    }, 1000);

    return () => clearInterval(interval);
  }, [stage, isCameraOn, mode, ppeOptions]);

  useEffect(() => {
  if (!timerActive) return;

  if (timerSecondsLeft <= 0) {
    const autoCaptureAndSubmit = async () => {
      setTimerActive(false);

      const file = await capturePhotoFile();
      if (!file) {
        setErrorMessage("Could not capture image when timer ended.");
        return;
      }

      await handleSubmit(file);
    };

    void autoCaptureAndSubmit();
    return;
  }

  const timeout = setTimeout(() => {
    setTimerSecondsLeft((prev) => prev - 1);
  }, 1000);

  return () => clearTimeout(timeout);
}, [timerActive, timerSecondsLeft]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOn(false);
    setVisionBusy(false);
    setTimerActive(false);
    setTimerSecondsLeft(0);
  };

  const resetForNewRun = () => {
    stopCamera();
    setUploadedImage(null);
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      }))
    );
    setTimerActive(false);
    setTimerSecondsLeft(0);
  };

  const handleSelectMode = (selectedMode: AppMode) => {
    resetForNewRun();
    setMode(selectedMode);

    if (selectedMode === "hurricane") {
      setSelectedScenario(HURRICANE_SCENARIO);
      setSelectedMedicalScenarioId(null);
    } else {
      const firstScenario = medicalScenarios[0] ?? aiScenario ?? null;
      setSelectedScenario(firstScenario);
      setSelectedMedicalScenarioId(firstScenario?.id ?? null);
    }
    
    setTimerActive(false);
    setTimerSecondsLeft(0);

    setStage("scenario");
  };

  const handleMedicalScenarioChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedId = Number(event.target.value);

    setResult(null);
    setErrorMessage(null);

    if (selectedId === AI_SCENARIO_OPTION_ID && aiScenario) {
      setSelectedScenario(aiScenario);
      setSelectedMedicalScenarioId(AI_SCENARIO_OPTION_ID);
      return;
    }

    const foundScenario =
      medicalScenarios.find((scenario) => scenario.id === selectedId) ?? null;

    setSelectedScenario(foundScenario);
    setSelectedMedicalScenarioId(selectedId);
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
    setResult(null);
    setErrorMessage(null);
    setLastDetections([]);
    setVisionOnline(false);
    setLiveConfidences(
      ppeOptions.map((item) => ({
        item,
        confidence: 0,
      }))
    );
    setStage("scenario");
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedImage(file);
    setResult(null);
    setErrorMessage(null);
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
    } catch (error) {
      console.error(error);
      alert("Unable to access the camera. Please allow camera permissions.");
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

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    setVisionBusy(true);

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.8);
      });

      if (!blob) return;

      const liveFile = new File([blob], "live-frame.jpg", { type: "image/jpeg" });
      const modelType = mode === "hurricane" ? "construction" : "medical";

      const data = await detectUpload(liveFile, modelType);

      setLastDetections(data.detections);
      setLiveConfidences(
        normalizeDetectionsToConfidence(data.detections, ppeOptions)
      );
      setVisionOnline(true);
    } catch (error) {
      console.error(error);
      setVisionOnline(false);
    } finally {
      setVisionBusy(false);
    }
  };

  const handleSubmit = async (overrideFile?: File) => {
  if (!selectedScenario) return;

  const fileToSubmit = overrideFile ?? uploadedImage;

  if (!fileToSubmit) {
    setErrorMessage("Please upload or capture an image before submitting.");
    return;
  }

  if (mode === "hurricane") {
    setErrorMessage(
      "The new detect-and-grade backend route is currently medical-mode only. Live construction detection is wired, but final grading still needs a construction grading route."
    );
    return;
  }

  try {
    setSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", fileToSubmit);

    const response = await fetch(
      `http://localhost:8000/detect-and-grade?scenario_text=${encodeURIComponent(
        selectedScenario.text
      )}&model_type=medical`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error ${response.status}: ${text}`);
    }

    const data = await response.json();

    setUploadedImage(fileToSubmit);
    setResult(data);
    setLastDetections(data.detections);
    setVisionOnline(true);
    setStage("results");
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit image to the backend.";

    setErrorMessage(message);
  } finally {
    setSubmitting(false);
  }
};

  return (
    <div className="min-h-screen bg-[#E2CFEA] text-[#2E1F27]">
      <header className="border-b-4 border-[#2E1F27] bg-[#4059AD] px-6 py-5">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold text-[#E2CFEA]">
            PPE Scenario Classifier
          </h1>
          <p className="mt-1 text-sm text-[#E2CFEA]/90">
            Emergency responder PPE verification and training
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {stage === "modeSelect" && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">Choose Test Mode</h2>
            <p className="mb-6 text-[#2E1F27]/75">
              Select which PPE workflow you want to test.
            </p>

            {(loadingScenarios || loadingAiScenario) && (
              <div className="mb-4 rounded-xl border-2 border-[#4059AD] bg-[#E2CFEA] px-4 py-3">
                Loading medical scenarios...
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3">
                {errorMessage}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div
                onClick={() => handleSelectMode("hurricane")}
                className="cursor-pointer rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-5 transition hover:border-[#419D78]"
              >
                <div className="mb-2 text-lg font-semibold">
                  General PPE for Hurricane Flood Response
                </div>
                <p className="text-sm text-[#2E1F27]/75">
                  Uses the construction detector for live model inference.
                </p>
              </div>

              <div
                onClick={() => {
                  if (
                    !loadingScenarios &&
                    !loadingAiScenario &&
                    (medicalScenarios.length > 0 || aiScenario)
                  ) {
                    handleSelectMode("medical");
                  }
                }}
                className={`rounded-2xl border-2 bg-[#E2CFEA] p-5 transition ${
                  loadingScenarios || loadingAiScenario
                    ? "cursor-not-allowed border-[#2E1F27] opacity-50"
                    : "cursor-pointer border-[#2E1F27] hover:border-[#419D78]"
                }`}
              >
                <div className="mb-2 text-lg font-semibold">Medical PPE</div>
                <p className="text-sm text-[#2E1F27]/75">
                  Uses backend scenarios and model-based detect-and-grade.
                </p>
              </div>
            </div>
          </div>
        )}

        {stage === "scenario" && selectedScenario && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">Scenario</h2>

            {mode === "medical" && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">
                  Choose a medical scenario
                </label>
                <select
                  value={selectedMedicalScenarioId ?? ""}
                  onChange={handleMedicalScenarioChange}
                  disabled={loadingAiScenario}
                  className="w-full rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-3 py-3"
                >
                  {medicalScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.category}
                    </option>
                  ))}
                  {aiScenario && (
                    <option value={AI_SCENARIO_OPTION_ID}>
                      AI Generated Scenario
                    </option>
                  )}
                </select>
              </div>
            )}

            <div className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
              <p className="leading-7">{selectedScenario.text}</p>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3">
                {errorMessage}
              </div>
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

        {stage === "camera" && selectedScenario && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">
              Live Camera Detection
            </h2>
            <p className="mb-6 text-[#2E1F27]/75">
              The live camera feed now calls the backend model route directly.
              Final grading uses the new detect-and-grade API.
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3">
                {errorMessage}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
              <div>
                {mode !== "hurricane" && (
                  <label className="mb-4 block">
                    <span className="mb-2 block font-semibold text-[#07020D]">
                      Upload Image
                    </span>
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
                        <div className="text-sm text-[#2E1F27]/75">
                          Base 30 seconds, plus 5 seconds for each additional required item.
                        </div>
                      </div>
                      <div className="text-2xl font-bold">
                        {timerActive
                          ? `${timerSecondsLeft}s`
                          : `${getMedicalTimerSeconds(selectedScenario, mode)}s`}
                      </div>
                    </div>
                  </div>
                )}

                {isCameraOn && (
                  <div
                    className={`relative mb-4 rounded-xl border-2 bg-black p-2 transition-colors ${
                      showMedicalCountdownWarning
                        ? "border-red-600"
                        : "border-[#2E1F27]"
                    }`}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="block w-full rounded-lg"
                    />

                    {showMedicalCountdownWarning && (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-4">
                        <div className="rounded-lg bg-red-600 px-4 py-2 text-lg font-bold text-white shadow-lg">
                          {timerSecondsLeft}s
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />

                {mode !== "hurricane" && (
                  <div className="mb-6 overflow-hidden rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA]">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="PPE preview"
                        className="h-80 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-80 items-center justify-center text-[#2E1F27]/65">
                        No captured or uploaded image selected
                      </div>
                    )}
                  </div>
                )}

                

                <div className="flex gap-3">
                   {mode !== "hurricane" && (
                      <button
                        onClick={() => void handleSubmit()}
                        disabled={submitting}
                        className={`rounded-xl border-2 border-[#2E1F27] px-4 py-2 font-medium transition ${
                          submitting
                            ? "cursor-not-allowed bg-[#2E1F27]/20"
                            : "bg-[#F5CB5C] hover:brightness-95"
                        }`}
                      >
                        {submitting ? "Processing..." : "Submit Image"}
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

              {mode !== "hurricane" && (
                <aside className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Latest Model Detections</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        visionOnline
                          ? "border-[#419D78] text-[#419D78]"
                          : "border-[#4059AD] text-[#4059AD]"
                      }`}
                    >
                      {visionOnline ? "Vision Online" : "Waiting for Detection"}
                    </span>
                  </div>

                  {lastDetections.length > 0 ? (
                    <div className="space-y-3">
                      {lastDetections.map((detection, index) => (
                        <div
                          key={`${detection.label}-${index}`}
                          className="rounded-lg border-2 border-[#2E1F27] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">
                              {toDisplayLabel(detection.label)}
                            </span>
                            <span className="text-sm font-semibold">
                              {Math.round(detection.confidence * 100)}%
                            </span>
                          </div>

                          {detection.raw_class && detection.raw_class !== detection.label && (
                            <div className="mt-1 text-xs text-[#2E1F27]/70">
                              Raw class: {detection.raw_class}
                            </div>
                          )}

                          <div className="mt-2 text-xs text-[#2E1F27]/70">
                            Box: x1 {detection.bbox.x1}, y1 {detection.bbox.y1}, x2 {detection.bbox.x2}, y2 {detection.bbox.y2}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed border-[#2E1F27] px-4 py-6 text-sm text-[#2E1F27]/70">
                      No detections yet. Run live detection or submit an image.
                    </div>
                  )}
                </aside>
              )}
            </div>
          </div>
        )}

        {stage === "results" && result && (
          <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-4 text-2xl font-semibold">Results</h2>

            {previewUrl && (
              <div className="mb-5 rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
                <p className="mb-3 text-sm font-medium">Submitted Image</p>
                <img
                  src={previewUrl}
                  alt="Submitted PPE"
                  className="max-h-72 w-full rounded-lg object-contain"
                />
              </div>
            )}

            <div className="mb-4 rounded-xl border-2 border-[#F5CB5C] bg-[#E2CFEA] px-4 py-3">
              <span className="font-semibold">Outcome:</span> {result.outcome}
            </div>

            <div className="space-y-2 rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
              <p>
                <span className="font-semibold">Category:</span> {result.category}
              </p>
              <p>
                <span className="font-semibold">Required:</span>{" "}
                {result.required.join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Detected:</span>{" "}
                {result.detections.map((d) => toDisplayLabel(d.label)).join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Correct:</span>{" "}
                {result.correct.join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Missing:</span>{" "}
                {result.missing.join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Extra:</span>{" "}
                {result.extra.join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Low Confidence:</span>{" "}
                {result.low_confidence.map((label) => toDisplayLabel(label)).join(", ") || "None"}
              </p>
              <p>
                <span className="font-semibold">Detections:</span> {result.num_detections}
              </p>
              <p>
                <span className="font-semibold">Inference Time:</span> {result.elapsed_time}s
              </p>
              <p>
                <span className="font-semibold">Why:</span> {result.explanation}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleRestart}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
              >
                Restart
              </button>

              <button
                onClick={() => setStage("scenario")}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
              >
                Back to Scenario
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}