import { useEffect, useRef, useState } from "react";

type AppStage = "modeSelect" | "scenario" | "camera" | "results";
type AppMode = "hurricane" | "medical" | null;

type BackendScenario = {
  id: number;
  text: string;
  category: string;
};

type SubmitResult = {
  scenario: string;
  category: string;
  required: string[];
  selected: string[];
  outcome: string;
  correct: string[];
  missing: string[];
  extra: string[];
  explanation: string;
};

const API_BASE_URL = "http://localhost:8000";

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

const PPE_OPTIONS = [
  "Gloves",
  "Gown",
  "Surgical Mask",
  "N95",
  "Eye Protection",
  "Face Shield",
];

export default function App() {
  const [stage, setStage] = useState<AppStage>("modeSelect");
  const [mode, setMode] = useState<AppMode>(null);

  const [medicalScenarios, setMedicalScenarios] = useState<BackendScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<BackendScenario | null>(null);

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [selectedPPE, setSelectedPPE] = useState<string[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
  const loadMedicalScenarios = async () => {
    try {
      setLoadingScenarios(true);
      setErrorMessage(null);

      const scenariosUrl = `${API_BASE_URL}/scenarios`;
      console.log("API_BASE_URL:", API_BASE_URL);
      console.log("Loading scenarios from:", scenariosUrl);

      const response = await fetch(scenariosUrl);

      console.log("Response URL:", response.url);
      console.log("Response status:", response.status);
      console.log("Response content-type:", response.headers.get("content-type"));

      const responseText = await response.text();
      console.log("Raw /scenarios response:", responseText);

      if (!response.ok) {
        throw new Error(
          `Failed to load scenarios: ${response.status} ${responseText}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          `Expected JSON but got ${contentType}. Response started with: ${responseText.slice(0, 120)}`
        );
      }

      const data: BackendScenario[] = JSON.parse(responseText);
      setMedicalScenarios(data);
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? `${error.message} — using fallback medical scenarios.`
          : "Failed to load medical scenarios from the backend — using fallback medical scenarios.";

      setErrorMessage(message);
      setMedicalScenarios(FALLBACK_MEDICAL_SCENARIOS);
    } finally {
      setLoadingScenarios(false);
    }
  };

  loadMedicalScenarios();
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

    startPlayback();
  }, [isCameraOn, cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOn(false);
  };

  const resetForNewRun = () => {
    stopCamera();
    setUploadedImage(null);
    setSelectedPPE([]);
    setResult(null);
    setErrorMessage(null);
  };

  const handleSelectMode = (selectedMode: AppMode) => {
    resetForNewRun();
    setMode(selectedMode);

    if (selectedMode === "hurricane") {
      setSelectedScenario(HURRICANE_SCENARIO);
    } else {
      setSelectedScenario(medicalScenarios[0] ?? null);
    }

    setStage("scenario");
  };

  const handleRestart = () => {
    resetForNewRun();
    setMode(null);
    setSelectedScenario(null);
    setStage("modeSelect");
  };

  const handleBackToScenario = () => {
    stopCamera();
    setUploadedImage(null);
    setSelectedPPE([]);
    setResult(null);
    setErrorMessage(null);
    setStage("scenario");
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedImage(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      setCameraStream(stream);
      setIsCameraOn(true);
    } catch (error) {
      console.error(error);
      alert("Unable to access the camera. Please allow camera permissions.");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        setUploadedImage(file);
        stopCamera();
      },
      "image/jpeg",
      0.95
    );
  };

  const togglePPE = (item: string) => {
    setSelectedPPE((prev) =>
      prev.includes(item)
        ? prev.filter((p) => p !== item)
        : [...prev, item]
    );
  };

  const handleSubmit = async () => {
    if (!selectedScenario) return;

    if (selectedPPE.length === 0) {
      setErrorMessage("Please select at least one PPE item before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const submitUrl = `${API_BASE_URL}/submit`;
      console.log("Submitting to:", submitUrl);

      const response = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario_text: selectedScenario.text,
          selected: selectedPPE,
          mode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Submit failed with status ${response.status}: ${errorText}`
        );
      }

      const data: SubmitResult = await response.json();
      setResult(data);
      setStage("results");
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit PPE selection to the backend.";

      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-gray-800">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">PPE Scenario Classifier</h1>

        {stage === "modeSelect" && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">Choose Test Mode</h2>
            <p className="mb-6 text-gray-600">
              Select which PPE workflow you want to test.
            </p>

            <div className="mb-4 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
              <div>
                <span className="font-semibold">Frontend URL:</span>{" "}
                http://localhost:5173
              </div>
              <div>
                <span className="font-semibold">Backend URL:</span>{" "}
                {API_BASE_URL || "Missing VITE_API_BASE_URL"}
              </div>
              <div>
                <span className="font-semibold">Medical scenarios loaded:</span>{" "}
                {medicalScenarios.length}
              </div>
            </div>

            {loadingScenarios && (
              <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-blue-700">
                Loading medical scenarios...
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <button
                onClick={() => handleSelectMode("hurricane")}
                className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
              >
                <div className="mb-2 text-lg font-semibold">
                  General PPE for Hurricane Flood Response
                </div>
                <p className="text-sm text-gray-600">
                  Test disaster-response PPE selection for contaminated flood
                  environments.
                </p>
              </button>

              <button
                onClick={() => handleSelectMode("medical")}
                disabled={loadingScenarios || medicalScenarios.length === 0}
                className={`rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition ${
                  loadingScenarios || medicalScenarios.length === 0
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-blue-400 hover:shadow"
                }`}
              >
                <div className="mb-2 text-lg font-semibold">Medical PPE</div>
                <p className="text-sm text-gray-600">
                  Test clinical PPE selection using backend-loaded scenarios.
                </p>
              </button>
            </div>
          </div>
        )}

        {stage === "scenario" && selectedScenario && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">Scenario</h2>

            {mode === "medical" && medicalScenarios.length > 0 && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Choose a medical scenario
                </label>
                <select
                  value={selectedScenario.id}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const found =
                      medicalScenarios.find((s) => s.id === id) ?? null;
                    setSelectedScenario(found);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                >
                  {medicalScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.text}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p className="leading-7">{selectedScenario.text}</p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStage("camera")}
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
              >
                Start PPE Challenge
              </button>

              <button
                onClick={handleRestart}
                className="rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {stage === "camera" && selectedScenario && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">
              Upload or Capture PPE Image
            </h2>
            <p className="mb-4 text-gray-600">
              Upload an image or use your laptop camera to take a photo. For
              now, the backend grading uses the PPE checklist below.
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">
                {errorMessage}
              </div>
            )}

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Upload Image
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
              />
            </label>

            <div className="mb-4 flex flex-wrap gap-3">
              {!isCameraOn ? (
                <button
                  onClick={startCamera}
                  className="rounded-xl bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-700"
                >
                  Open Camera
                </button>
              ) : (
                <>
                  <button
                    onClick={capturePhoto}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
                  >
                    Capture Photo
                  </button>

                  <button
                    onClick={stopCamera}
                    className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700"
                  >
                    Stop Camera
                  </button>
                </>
              )}
            </div>

            {isCameraOn && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="mb-4 block w-full rounded-xl border border-gray-300 bg-black"
              />
            )}

            <canvas ref={canvasRef} className="hidden" />

            <div className="mb-6 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="PPE preview"
                  className="h-80 w-full object-contain"
                />
              ) : (
                <div className="flex h-80 items-center justify-center text-gray-500">
                  No image selected
                </div>
              )}
            </div>

            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-lg font-semibold">Select PPE Worn</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {PPE_OPTIONS.map((item) => (
                  <label
                    key={item}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPPE.includes(item)}
                      onChange={() => togglePPE(item)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`rounded-xl px-4 py-2 font-medium text-white transition ${
                  submitting
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {submitting ? "Processing..." : "Submit PPE"}
              </button>

              <button
                onClick={handleBackToScenario}
                className="rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {stage === "results" && result && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {mode === "hurricane"
                ? "General PPE for Hurricane Flood Response"
                : "Medical PPE"}
            </div>

            <h2 className="mb-4 text-2xl font-semibold">Results</h2>

            {previewUrl && (
              <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">
                  Submitted Image
                </p>
                <img
                  src={previewUrl}
                  alt="Submitted PPE"
                  className="max-h-72 w-full rounded-lg object-contain"
                />
              </div>
            )}

            <div className="mb-3 rounded-lg bg-yellow-50 px-4 py-3 text-yellow-800">
              <span className="font-semibold">Outcome:</span> {result.outcome}
            </div>

            <p className="mb-2">
              <span className="font-semibold">Category:</span> {result.category}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Required:</span>{" "}
              {result.required.join(", ") || "None"}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Selected:</span>{" "}
              {result.selected.join(", ") || "None"}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Correct:</span>{" "}
              {result.correct.join(", ") || "None"}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Missing:</span>{" "}
              {result.missing.join(", ") || "None"}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Extra:</span>{" "}
              {result.extra.join(", ") || "None"}
            </p>
            <p className="mb-6">
              <span className="font-semibold">Why:</span> {result.explanation}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleRestart}
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
              >
                Restart
              </button>

              <button
                onClick={() => setStage("scenario")}
                className="rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Back to Scenario
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}