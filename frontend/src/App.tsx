import { useState } from "react";

type AppStage = "scenario" | "camera" | "results";

export default function App() {
  const [stage, setStage] = useState<AppStage>("scenario");

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>Medical PPE Scenario Classifier</h1>

      <p>Current stage: {stage}</p>

      {stage === "scenario" && (
        <div>
          <h2>Scenario</h2>
          <p>
            Patient presents with persistent cough, weight loss, and suspected
            tuberculosis.
          </p>

          <button onClick={() => setStage("camera")}>
            Start PPE Challenge
          </button>
        </div>
      )}

      {stage === "camera" && (
        <div>
          <h2>Camera Screen</h2>
          <p>(Camera will go here later)</p>

          <button onClick={() => setStage("results")}>
            Submit PPE
          </button>
        </div>
      )}

      {stage === "results" && (
        <div>
          <h2>Results</h2>
          <p>Status: Partial</p>
          <p>Missing: gown, eye protection</p>

          <button onClick={() => setStage("scenario")}>
            Restart
          </button>
        </div>
      )}
    </div>
  );
}