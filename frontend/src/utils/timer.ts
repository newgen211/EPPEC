import type { BackendScenario } from "../types/api";
import type { AppMode } from "../types/app";

export function getRequiredCountForTimer(
  selectedScenario: BackendScenario | null,
  mode: AppMode,
): number {
  if (!selectedScenario || mode !== "medical") return 1;

  if (selectedScenario.required?.length) {
    return selectedScenario.required.length;
  }

  switch (selectedScenario.category) {
    case "Standard":
      return 1;
    case "Contact":
      return 2;
    case "Droplet":
      return 4;
    case "Airborne":
      return 4;
    case "High-Risk":
      return 5;
    default:
      return 1;
  }
}

export function getMedicalTimerSeconds(
  selectedScenario: BackendScenario | null,
  mode: AppMode,
): number {
  const requiredCount = getRequiredCountForTimer(selectedScenario, mode);
  return 30 + Math.max(0, requiredCount - 1) * 5;
}