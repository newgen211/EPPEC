import type { DetectAndGradeResponse } from "../types/api";
import StatusBanner from "../components/StatusBanner";

interface ResultsScreenProps {
  result: DetectAndGradeResponse;
  onRestart: () => void;
  onBack: () => void;
}

export default function ResultsScreen({
  result,
  onRestart,
  onBack,
}: ResultsScreenProps) {
  const outcomeTone =
    result.outcome === "correct"
      ? "success"
      : result.outcome === "over-protected"
        ? "info"
        : "warning";

  return (
    <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
      <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
        Results
      </div>

      <h2 className="mb-4 text-2xl font-semibold">Submission Outcome</h2>

      <StatusBanner
        tone={outcomeTone}
        message={`Outcome: ${result.outcome}`}
        className="mb-4"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Scenario</h3>
          <p className="text-sm text-[#2E1F27]/75">{result.category}</p>
          {result.explanation && (
            <p className="mt-3 text-sm text-[#2E1F27]/75">{result.explanation}</p>
          )}
        </div>

        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Required PPE</h3>
          <ul className="list-inside list-disc text-sm">
            {result.required.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Correct</h3>
          <ul className="list-inside list-disc text-sm">
            {result.correct.length ? (
              result.correct.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>None</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Missing</h3>
          <ul className="list-inside list-disc text-sm">
            {result.missing.length ? (
              result.missing.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>None</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Extra</h3>
          <ul className="list-inside list-disc text-sm">
            {result.extra.length ? (
              result.extra.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>None</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-[#2E1F27] bg-white p-4">
          <h3 className="mb-2 font-semibold">Detections</h3>
          <ul className="list-inside list-disc text-sm">
            {result.detections.length ? (
              result.detections.map((item, idx) => (
                <li key={`${item.label}-${idx}`}>
                  {item.label} ({(item.confidence * 100).toFixed(1)}%)
                </li>
              ))
            ) : (
              <li>None</li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78]"
        >
          Back
        </button>
        <button
          onClick={onRestart}
          className="rounded-xl border-2 border-[#2E1F27] bg-[#E2CFEA] px-4 py-2 font-medium transition hover:border-[#419D78]"
        >
          Restart
        </button>
      </div>
    </div>
  );
}