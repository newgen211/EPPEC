import type { Detection } from "../types/api";
import type { DetectionConfidence } from "../types/app";
import { toDisplayLabel } from "./labels";

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 75) return "#419D78";
  if (confidence >= 40) return "#F5CB5C";
  return "#4059AD";
}

export function normalizeDetectionsToConfidence(
  detections: Detection[],
  options: string[],
): DetectionConfidence[] {
  const map = new Map<string, number>();

  for (const option of options) {
    map.set(option, 0);
  }

  for (const detection of detections) {
    const displayLabel = toDisplayLabel(detection.label);
    const confidence = Math.round(detection.confidence * 100);
    const existing = map.get(displayLabel) ?? 0;
    map.set(displayLabel, Math.max(existing, confidence));
  }

  return options.map((item) => ({
    item,
    confidence: map.get(item) ?? 0,
  }));
}