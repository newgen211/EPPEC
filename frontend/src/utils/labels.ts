export const MEDICAL_PPE_OPTIONS = [
  "Gloves",
  "Coverall",
  "Mask",
  "Eye Protection",
  "Face Shield",
];

export const CONSTRUCTION_PPE_OPTIONS = [
  "Hard Hat",
  "Gloves",
  "Safety Vest",
  "Eye Protection",
];

export const LABEL_TO_DISPLAY: Record<string, string> = {
  gloves: "Gloves",
  coverall: "Coverall",
  mask: "Mask",
  goggles: "Eye Protection",
  eye_protection: "Eye Protection",
  face_shield: "Face Shield",
  hard_hat: "Hard Hat",
  safety_vest: "Safety Vest",
};

export function toDisplayLabel(label: string): string {
  return LABEL_TO_DISPLAY[label] ?? label;
}