import type { Detection } from "../types/api";
import type { DetectionConfidence } from "../types/app";
import { getConfidenceColor } from "../utils/detection";

interface DetectionSidebarProps {
  liveConfidences: DetectionConfidence[];
  lastDetections: Detection[];
  visionOnline: boolean;
  visionBusy: boolean;
}

export default function DetectionSidebar({
  liveConfidences,
  lastDetections,
  visionOnline,
  visionBusy,
}: DetectionSidebarProps) {
  return (
    <aside className="rounded-2xl border-2 border-[#2E1F27] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Latest Model Detections</h3>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              visionOnline ? "bg-green-500" : "bg-slate-400"
            }`}
          />
          <span>{visionBusy ? "Scanning..." : visionOnline ? "Online" : "Offline"}</span>
        </div>
      </div>

      <div className="space-y-3">
        {liveConfidences.map((item) => (
          <div key={item.item}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{item.item}</span>
              <span>{item.confidence}%</span>
            </div>
            <div className="h-3 rounded-full bg-slate-200">
              <div
                className="h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${item.confidence}%`,
                  backgroundColor: getConfidenceColor(item.confidence),
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h4 className="mb-2 font-semibold">Raw detections</h4>
        {lastDetections.length === 0 ? (
          <p className="text-sm text-slate-500">No detections yet.</p>
        ) : (
          <div className="space-y-2">
            {lastDetections.map((det, idx) => (
              <div
                key={`${det.label}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span>{det.label}</span>
                <span className="font-medium">
                  {(det.confidence * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}