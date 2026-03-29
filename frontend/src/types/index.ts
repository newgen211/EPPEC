// File: frontend/src/types/index.ts

// ── Shared application types ──────────────────────────────

export type AppStage = "modeSelect" | "scenario" | "briefing" | "camera" | "results";
export type AppMode = "hurricane" | "medical" | null;

export type DetectionConfidence = {
  item: string;
  confidence: number;
};

// Re-exported from api.ts for convenience in components
export type { BackendScenario, Detection, DetectAndGradeResponse } from "../api";