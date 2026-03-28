import { useState } from "react";

type AppStage = "scenario" | "camera" | "results";

export default function App() {
  const [stage, setStage] = useState<AppStage>("scenario");

  return (
    <div className="min-h-screen bg-white px-6 py-8 text-gray-800">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-bold">
          Medical PPE Scenario Classifier
        </h1>

        {stage === "scenario" && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <h2 className="mb-3 text-2xl font-semibold">Scenario</h2>
            <p className="leading-7">
              Patient presents with persistent cough, weight loss, and suspected
              tuberculosis.
            </p>

            <button
              onClick={() => setStage("camera")}
              className="mt-6 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
            >
              Start PPE Challenge
            </button>
          </div>
        )}

        {stage === "camera" && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <h2 className="mb-3 text-2xl font-semibold">Camera Screen</h2>
            <p className="mb-4 text-gray-600">
              The live camera feed will go here later.
            </p>

            <div className="mb-6 flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-500">
              Camera Placeholder
            </div>

            <button
              onClick={() => setStage("results")}
              className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
            >
              Submit PPE
            </button>
          </div>
        )}

        {stage === "results" && (
          <div className="rounded-2xl bg-gray-50 p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">Results</h2>

            <div className="mb-3 rounded-lg bg-yellow-50 px-4 py-3 text-yellow-800">
              <span className="font-semibold">Status:</span> Partial
            </div>

            <p className="mb-2">
              <span className="font-semibold">Detected:</span> gloves, n95
            </p>
            <p className="mb-2">
              <span className="font-semibold">Missing:</span> gown, eye
              protection
            </p>
            <p className="mb-6">
              <span className="font-semibold">Why:</span> Airborne precautions
              are required for suspected tuberculosis.
            </p>

            <button
              onClick={() => setStage("scenario")}
              className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
            >
              Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}