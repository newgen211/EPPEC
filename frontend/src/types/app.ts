export type AppStage = "modeSelect" | "scenario" | "camera" | "results";
export type AppMode = "construction" | "medical" | null;

export type DetectionConfidence = {
  item: string;
  confidence: number;
};