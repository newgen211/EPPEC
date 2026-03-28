import { useState } from "react";

type AppStage = "modeSelect" | "scenario" | "camera" | "results";
type AppMode = "hurricane" | "medical" | null;

type ScenarioData = {
  title: string;
  scenario: string;
  detected: string[];
  missing: string[];
  status: string;
  why: string;
};

const hurricaneScenario: ScenarioData = {
  title: "General PPE for Hurricane Flood Response",
  scenario:
    "A responder is entering a flood-damaged area with contaminated standing water, debris, unstable surfaces, and possible exposure to mold and sharp objects.",
  detected: ["gloves", "boots", "safety goggles"],
  missing: ["respirator", "protective clothing"],
  status: "Partial",
  why: "Flood response often requires protection from contaminated water, debris, airborne irritants, and skin exposure.",
};

const medicalScenario: ScenarioData = {
  title: "Medical PPE Scenario",
  scenario:
    "Patient presents with persistent cough, weight loss, and suspected tuberculosis.",
  detected: ["gloves", "n95"],
  missing: ["gown", "eye protection"],
  status: "Partial",
  why: "Airborne precautions are required for suspected tuberculosis.",
};

export default function App() {
  const [stage, setStage] = useState<AppStage>("modeSelect");
  const [mode, setMode] = useState<AppMode>(null);

  const selectedScenario =
    mode === "hurricane" ? hurricaneScenario : medicalScenario;

  const handleSelectMode = (selectedMode: AppMode) => {
    setMode(selectedMode);
    setStage("scenario");
  };

  const handleRestart = () => {
    setMode(null);
    setStage("modeSelect");
  };

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-gray-800">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-bold">PPE Scenario Classifier</h1>

        {stage === "modeSelect" && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">Choose Test Mode</h2>
            <p className="mb-6 text-gray-600">
              Select which PPE workflow you want to test.
            </p>

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
                className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
              >
                <div className="mb-2 text-lg font-semibold">Medical PPE</div>
                <p className="text-sm text-gray-600">
                  Test clinical PPE selection for healthcare scenarios.
                </p>
              </button>
            </div>
          </div>
        )}

        {stage === "scenario" && mode && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {selectedScenario.title}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">Scenario</h2>
            <p className="leading-7">{selectedScenario.scenario}</p>

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

        {stage === "camera" && mode && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {selectedScenario.title}
            </div>

            <h2 className="mb-3 text-2xl font-semibold">Camera Screen</h2>
            <p className="mb-4 text-gray-600">
              The live camera feed will go here later.
            </p>

            <div className="mb-6 flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-500">
              Camera Placeholder
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStage("results")}
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
              >
                Submit PPE
              </button>

              <button
                onClick={() => setStage("scenario")}
                className="rounded-xl border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {stage === "results" && mode && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-600">
              {selectedScenario.title}
            </div>

            <h2 className="mb-4 text-2xl font-semibold">Results</h2>

            <div className="mb-3 rounded-lg bg-yellow-50 px-4 py-3 text-yellow-800">
              <span className="font-semibold">Status:</span>{" "}
              {selectedScenario.status}
            </div>

            <p className="mb-2">
              <span className="font-semibold">Detected:</span>{" "}
              {selectedScenario.detected.join(", ")}
            </p>
            <p className="mb-2">
              <span className="font-semibold">Missing:</span>{" "}
              {selectedScenario.missing.join(", ")}
            </p>
            <p className="mb-6">
              <span className="font-semibold">Why:</span>{" "}
              {selectedScenario.why}
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