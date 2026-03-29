/**
 * PPE Compliance checking utility
 */

export const REQUIRED_PPE = {
  medical: ["coverall", "mask", "gloves", "face_shield", "goggles"],
  construction: ["hard_hat", "safety_vest", "gloves", "eye_protection"],
};

export interface ComplianceResult {
  isCompliant: boolean;
  detected: string[];
  missing: string[];
  compliancePercent: number;
}

export function checkCompliance(
  detections: Array<{ class: string }>,
  modelType: "medical" | "construction",
): ComplianceResult {
  const required = REQUIRED_PPE[modelType];
  const detected = Array.from(
    new Set(detections.map((d) => d.class.toLowerCase())),
  );

  const missing = required.filter((item) => !detected.includes(item));

  return {
    isCompliant: missing.length === 0,
    detected,
    missing,
    compliancePercent: Math.round(
      ((required.length - missing.length) / required.length) * 100,
    ),
  };
}
