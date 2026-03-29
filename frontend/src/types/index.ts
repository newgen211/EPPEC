// ── Shared application types ──────────────────────────────

export type AppStage = "modeSelect" | "scenario" | "camera" | "results";
export type AppMode = "hurricane" | "medical" | null;

export type DetectionConfidence = {
  item: string;
  confidence: number;
};

// Re-exported from api.ts for convenience in components
export type { BackendScenario, Detection, DetectAndGradeResponse } from "../api";