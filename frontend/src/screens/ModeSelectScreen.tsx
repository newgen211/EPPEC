import StatusBanner from "../components/StatusBanner";

interface ModeSelectScreenProps {
  loadingScenarios: boolean;
  loadingAiScenario: boolean;
  errorMessage: string | null;
  onSelectMode: (mode: "construction" | "medical") => void;
}

export default function ModeSelectScreen({
  loadingScenarios,
  loadingAiScenario,
  errorMessage,
  onSelectMode,
}: ModeSelectScreenProps) {
  return (
    <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
      <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
        EPPEC
      </div>
      <h2 className="mb-3 text-2xl font-semibold">Choose a training mode</h2>
      <p className="mb-6 text-[#2E1F27]/75">
        Select the environment first, then choose a scenario and move into live
        detection.
      </p>

      {errorMessage && (
        <StatusBanner tone="warning" message={errorMessage} className="mb-4" />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <button
          onClick={() => onSelectMode("construction")}
          className="rounded-2xl border-2 border-[#2E1F27] bg-white p-6 text-left transition hover:border-[#419D78]"
        >
          <div className="mb-2 text-lg font-semibold">Construction</div>
          <p className="text-sm text-[#2E1F27]/70">
            Construction-style PPE readiness for hazardous response conditions.
          </p>
        </button>

        <button
          onClick={() => onSelectMode("medical")}
          className="rounded-2xl border-2 border-[#2E1F27] bg-white p-6 text-left transition hover:border-[#419D78]"
          disabled={loadingScenarios || loadingAiScenario}
        >
          <div className="mb-2 text-lg font-semibold">Medical</div>
          <p className="text-sm text-[#2E1F27]/70">
            Clinical PPE scenario training using preset and AI-generated cases.
          </p>
        </button>
      </div>
    </div>
  );
}