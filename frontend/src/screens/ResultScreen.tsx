// File: frontend/src/screens/ResultScreen.tsx

import PPEChecklist from "../components/PPEChecklist";
import type { DetectAndGradeResponse } from "../api";

type Props = {
  result: DetectAndGradeResponse;
  previewUrl: string | null;
  mode: "hurricane" | "medical" | null;
  onRestart: () => void;
  onBackToScenario: () => void;
};

const OUTCOME_CONFIG = {
  correct: {
    label: "All Clear — Correct PPE",
    bg: "bg-[#419D78]",
    text: "text-white",
    border: "border-[#419D78]",
    emoji: "✓",
  },
  "over-protected": {
    label: "Over-Protected",
    bg: "bg-[#F5CB5C]",
    text: "text-[#2E1F27]",
    border: "border-[#F5CB5C]",
    emoji: "+",
  },
  incomplete: {
    label: "Incomplete — PPE Missing",
    bg: "bg-red-500",
    text: "text-white",
    border: "border-red-500",
    emoji: "✗",
  },
  incorrect: {
    label: "Incorrect PPE",
    bg: "bg-red-500",
    text: "text-white",
    border: "border-red-500",
    emoji: "✗",
  },
} as const;

function toDisplayLabel(label: string): string {
  const MAP: Record<string, string> = {
    gloves: "Gloves",
    coverall: "Coverall",
    mask: "Mask",
    goggles: "Eye Protection",
    eye_protection: "Eye Protection",
    face_shield: "Face Shield",
    hard_hat: "Hard Hat",
    safety_vest: "Safety Vest",
  };
  return MAP[label] ?? label;
}

export default function ResultScreen({
  result,
  previewUrl,
  mode,
  onRestart,
  onBackToScenario,
}: Props) {
  const outcomeKey = result.outcome as keyof typeof OUTCOME_CONFIG;
  const outcomeConfig =
    OUTCOME_CONFIG[outcomeKey] ?? OUTCOME_CONFIG["incorrect"];

  return (
    <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
      {/* Mode label */}
      <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
        {mode === "hurricane"
          ? "General PPE for Hurricane Flood Response"
          : "Medical PPE"}
      </div>

      <h2 className="mb-5 text-2xl font-semibold">Results</h2>

      {/* Outcome banner */}
      <div
        className={`mb-6 flex items-center gap-4 rounded-xl border-2 px-5 py-4 ${outcomeConfig.bg} ${outcomeConfig.border}`}
      >
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-white/30 text-xl font-bold ${outcomeConfig.text}`}
        >
          {outcomeConfig.emoji}
        </span>
        <div>
          <div className={`text-lg font-bold ${outcomeConfig.text}`}>
            {outcomeConfig.label}
          </div>
          <div className={`text-sm opacity-80 ${outcomeConfig.text}`}>
            Category: {result.category}
          </div>
        </div>
        <div className={`ml-auto text-right text-sm opacity-70 ${outcomeConfig.text}`}>
          <div>{result.num_detections} detection{result.num_detections !== 1 ? "s" : ""}</div>
          <div>{result.elapsed_time}s inference</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left – image + explanation */}
        <div className="space-y-4">
          {previewUrl && (
            <div className="overflow-hidden rounded-xl border-2 border-[#2E1F27]">
              <img
                src={previewUrl}
                alt="Submitted PPE"
                className="max-h-64 w-full object-contain"
              />
            </div>
          )}

          <div className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-4">
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#4059AD]">
              Why
            </p>
            <p className="text-sm leading-relaxed text-[#2E1F27]">
              {result.explanation}
            </p>
          </div>

          {/* Detection metadata */}
          <div className="rounded-xl border-2 border-[#2E1F27]/20 bg-[#E2CFEA] p-4">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#2E1F27]/60">
              Detection Details
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[#2E1F27]/70">Detected labels</span>
                <span className="font-medium">
                  {result.detections.length > 0
                    ? result.detections.map((d) => toDisplayLabel(d.label)).join(", ")
                    : "None"}
                </span>
              </div>
              {result.low_confidence.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#2E1F27]/70">Low confidence</span>
                  <span className="font-medium text-[#F5CB5C]">
                    {result.low_confidence.map(toDisplayLabel).join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right – PPE checklist */}
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#2E1F27]/60">
            PPE Checklist
          </p>
          <PPEChecklist
            required={result.required}
            correct={result.correct}
            missing={result.missing}
            extra={result.extra}
          />

          {/* Summary counts */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border-2 border-[#419D78] bg-[#419D78]/10 py-2">
              <div className="text-lg font-bold text-[#419D78]">
                {result.correct.length}
              </div>
              <div className="text-xs text-[#419D78]">Correct</div>
            </div>
            <div className="rounded-lg border-2 border-red-400 bg-red-50 py-2">
              <div className="text-lg font-bold text-red-500">
                {result.missing.length}
              </div>
              <div className="text-xs text-red-500">Missing</div>
            </div>
            <div className="rounded-lg border-2 border-[#F5CB5C] bg-[#F5CB5C]/10 py-2">
              <div className="text-lg font-bold text-[#2E1F27]">
                {result.extra.length}
              </div>
              <div className="text-xs text-[#2E1F27]/70">Extra</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onRestart}
          className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
        >
          Restart
        </button>
        <button
          onClick={onBackToScenario}
          className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
        >
          Back to Scenario
        </button>
      </div>
    </div>
  );
}