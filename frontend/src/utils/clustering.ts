// File: frontend/src/utils/clustering.ts
//
// Clusters PPE bounding boxes into per-person groups using a horizontal
// sweep. Items whose X ranges are within xGapFraction of the image width
// apart are considered to belong to the same person.
//
// No person-detection model required — works purely from PPE item bboxes.

import type { Detection } from "../api";

export type PersonCluster = {
  id: number;                  // 1-indexed display label
  detections: Detection[];     // raw detections assigned to this person
  bbox: {                      // union bbox of all items, with padding
    x1: number; y1: number;
    x2: number; y2: number;
  };
  detectedLabels: string[];    // deduplicated display labels
  correct: string[];
  missing: string[];
  compliant: boolean;
};

/**
 * @param detections    Raw detections from the model
 * @param required      Display labels that are required (e.g. ["Hard Hat", "Safety Vest"])
 * @param toDisplay     Function mapping raw label → display label
 * @param imageWidth    Width of the source image in pixels (used for relative gap)
 * @param xGapFraction  Max gap between clusters as fraction of image width (default 12%)
 * @param bboxPadPx     Pixels of padding added to each person's union bbox
 */
export function clusterDetectionsByPerson(
  detections: Detection[],
  required: string[],
  toDisplay: (label: string) => string,
  imageWidth: number,
  xGapFraction = 0.12,
  bboxPadPx = 10,
): PersonCluster[] {
  if (detections.length === 0) return [];

  const gapPx = imageWidth * xGapFraction;

  // Sort by left edge
  const sorted = [...detections].sort((a, b) => a.bbox.x1 - b.bbox.x1);

  // Greedy horizontal sweep — O(n²) but n is tiny (< 20 items)
  const raw: Detection[][] = [];

  for (const det of sorted) {
    let merged = false;
    for (const cluster of raw) {
      const clusterX2 = Math.max(...cluster.map(d => d.bbox.x2));
      if (det.bbox.x1 - clusterX2 <= gapPx) {
        cluster.push(det);
        merged = true;
        break;
      }
    }
    if (!merged) raw.push([det]);
  }

  // Sort clusters left-to-right so Person 1 is always the leftmost
  raw.sort((a, b) =>
    Math.min(...a.map(d => d.bbox.x1)) - Math.min(...b.map(d => d.bbox.x1))
  );

  const requiredSet = new Set(required);

  return raw.map((dets, i) => {
    // Union bbox + padding
    const bbox = {
      x1: Math.max(0, Math.min(...dets.map(d => d.bbox.x1)) - bboxPadPx),
      y1: Math.max(0, Math.min(...dets.map(d => d.bbox.y1)) - bboxPadPx),
      x2: Math.min(imageWidth, Math.max(...dets.map(d => d.bbox.x2)) + bboxPadPx),
      y2: Math.max(...dets.map(d => d.bbox.y2)) + bboxPadPx,
    };

    const detectedLabels = [...new Set(dets.map(d => toDisplay(d.label)))];
    const detectedSet    = new Set(detectedLabels);
    const correct        = [...requiredSet].filter(x => detectedSet.has(x));
    const missing        = [...requiredSet].filter(x => !detectedSet.has(x));

    return {
      id: i + 1,
      detections: dets,
      bbox,
      detectedLabels,
      correct,
      missing,
      compliant: missing.length === 0,
    };
  });
}