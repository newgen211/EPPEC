// File: frontend/src/screens/BriefingScreen.tsx

import type { BackendScenario } from "../api";
import type { AppMode } from "../types";

type Props = {
  scenario: BackendScenario;
  requiredPPE: string[];
  mode: AppMode;
  audioPlaying: boolean;
  onBeginScan: () => void;
  onBack: () => void;
};

const HAZARD_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  Standard:         { label: "LOW RISK",      bg: "#419D78", text: "#fff",     border: "#2d7a5a" },
  Contact:          { label: "CONTACT RISK",  bg: "#4059AD", text: "#fff",     border: "#2d4080" },
  Droplet:          { label: "DROPLET RISK",  bg: "#F5CB5C", text: "#2E1F27",  border: "#d4a832" },
  Airborne:         { label: "AIRBORNE RISK", bg: "#E07A5F", text: "#fff",     border: "#b85a40" },
  "High-Risk":      { label: "CRITICAL RISK", bg: "#C62828", text: "#fff",     border: "#8a1a1a" },
  "Flood Response": { label: "FLOOD HAZARD",  bg: "#4059AD", text: "#fff",     border: "#2d4080" },
};

const PPE_ICONS: Record<string, string> = {
  "Gloves":         "🧤",
  "Coverall":       "🥼",
  "Mask":           "😷",
  "Eye Protection": "🥽",
  "Face Shield":    "🛡️",
  "Hard Hat":       "⛑️",
  "Safety Vest":    "🦺",
};

export default function BriefingScreen({
  scenario,
  requiredPPE,
  mode,
  audioPlaying,
  onBeginScan,
  onBack,
}: Props) {
  const hazard = HAZARD_CONFIG[scenario.category] ?? HAZARD_CONFIG["Standard"];

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      {/* Label */}
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hazard.bg }} />
        <span className="text-xs font-bold uppercase tracking-widest text-[#2E1F27]/50">
          Pre-Deployment Briefing
        </span>
      </div>

      {/* Main card */}
      <div className="eppec-card overflow-hidden rounded-2xl border border-[#2E1F27]/15 shadow-lg">

        {/* Hazard level header */}
        <div
          className="px-6 py-5"
          style={{ backgroundColor: hazard.bg }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="mb-1 text-xs font-bold uppercase tracking-widest opacity-75"
                style={{ color: hazard.text }}
              >
                {mode === "hurricane" ? "Flood Response" : "Medical"} — Hazard Level
              </div>
              <div
                className="font-syne text-3xl font-black tracking-tight"
                style={{ color: hazard.text }}
              >
                {hazard.label}
              </div>
            </div>
            {/* Pulse indicator */}
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 animate-pulse rounded-full opacity-80"
                style={{ backgroundColor: hazard.text }}
              />
              <span
                className="text-xs font-semibold opacity-70"
                style={{ color: hazard.text }}
              >
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Scenario briefing text */}
          <div className="mb-6">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#2E1F27]/40">
              Situation
            </p>
            <p className="text-lg font-medium leading-relaxed text-[#2E1F27]">
              {scenario.text}
            </p>
          </div>

          {/* Divider */}
          <div className="mb-6 h-px bg-[#2E1F27]/10" />

          {/* Required PPE list */}
          <div className="mb-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#2E1F27]/40">
              Required PPE for Entry
            </p>
            <div className="grid grid-cols-2 gap-2">
              {requiredPPE.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl border-2 border-[#2E1F27]/10 bg-[#2E1F27]/4 px-4 py-3"
                >
                  <span className="text-lg leading-none">
                    {PPE_ICONS[item] ?? "•"}
                  </span>
                  <span className="text-sm font-semibold text-[#2E1F27]">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Audio indicator */}
          {audioPlaying && (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-[#4059AD]/8 px-4 py-3">
              <span className="flex gap-0.5">
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-1 rounded-full bg-[#4059AD]"
                    style={{
                      height: `${8 + i * 4}px`,
                      animation: `pulse 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                      opacity: 0.7 + i * 0.075,
                    }}
                  />
                ))}
              </span>
              <span className="text-sm font-medium text-[#4059AD]">
                Audio briefing playing…
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="rounded-xl border-2 border-[#2E1F27]/20 bg-transparent px-5 py-2.5 font-medium text-[#2E1F27]/60 transition hover:border-[#2E1F27]/40 hover:text-[#2E1F27]"
            >
              ← Back
            </button>
            <button
              onClick={onBeginScan}
              className="flex items-center gap-2 rounded-xl px-6 py-3 font-black text-white transition hover:brightness-95"
              style={{ backgroundColor: hazard.bg }}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
              Begin Scan →
            </button>
          </div>
        </div>
      </div>

      {/* Warning footer */}
      <p className="mt-4 text-center text-xs text-[#2E1F27]/40">
        Ensure all required PPE is on before proceeding to the camera scan.
      </p>
    </div>
  );
}