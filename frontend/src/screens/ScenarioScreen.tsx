import type { BackendScenario } from "../types/api";
import type { AppMode } from "../types/app";
import StatusBanner from "../components/StatusBanner";

interface ScenarioScreenProps {
  mode: AppMode;
  selectedScenario: BackendScenario | null;
  selectedMedicalScenarioId: number | null;
  medicalScenarios: BackendScenario[];
  aiScenario: BackendScenario | null;
  loadingAiScenario: boolean;
  errorMessage: string | null;
  onMedicalScenarioChange: (id: number) => void;
  onBack: () => void;
  onStart: () => void;
}

const AI_SCENARIO_OPTION_ID = -1;

export default function ScenarioScreen({
  mode,
  selectedScenario,
  selectedMedicalScenarioId,
  medicalScenarios,
  aiScenario,
  loadingAiScenario,
  errorMessage,
  onMedicalScenarioChange,
  onBack,
  onStart,
}: ScenarioScreenProps) {
  const isMedical = mode === "medical";

  return (
    <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
      <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
        {isMedical ? "Medical PPE" : "General PPE"}
      </div>

      <h2 className="mb-3 text-2xl font-semibold">Scenario selection</h2>

      {errorMessage && (
        <StatusBanner tone="warning" message={errorMessage} className="mb-4" />
      )}

      {isMedical ? (
        <>
          <p className="mb-4 text-[#2E1F27]/75">
            Choose a medical scenario before proceeding to camera detection.
          </p>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium">Scenario</span>
            <select
              value={selectedMedicalScenarioId ?? ""}
              onChange={(e) => onMedicalScenarioChange(Number(e.target.value))}
              className="w-full rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-3"
            >
              <option value="" disabled>
                Select a scenario
              </option>

              {medicalScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.category}: {scenario.text}
                </option>
              ))}

              {aiScenario && (
                <option value={AI_SCENARIO_OPTION_ID}>
                  AI Scenario: {aiScenario.text}
                </option>
              )}
            </select>
          </label>

          {loadingAiScenario && (
            <StatusBanner
              tone="info"
              message="Loading AI-generated scenario..."
              className="mb-4"
            />
          )}
        </>
      ) : (
        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
            Hurricane Scenario
          </div>
          <p className="text-[#2E1F27]/80">
            A responder is entering a flood-damaged area with contaminated
            standing water, debris, unstable surfaces, and possible exposure to
            mold and sharp objects.
          </p>
        </div>
      )}

      {selectedScenario && (
        <div className="mt-5 rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
            Selected scenario
          </div>
          <p className="mb-2">{selectedScenario.text}</p>
          <p className="text-sm text-[#2E1F27]/70">
            Category: {selectedScenario.category}
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78]"
        >
          Back
        </button>
        <button
          onClick={onStart}
          disabled={!selectedScenario}
          className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Camera
        </button>
      </div>
    </div>
  );
}