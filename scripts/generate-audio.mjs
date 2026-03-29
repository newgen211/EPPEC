// File: scripts/generate-audio.mjs
//
// Run once before the hackathon to pre-generate every static audio clip.
//
//   node scripts/generate-audio.mjs
//
// Requires a .env file at the project root (or env vars already exported):
//   ELEVENLABS_API_KEY=your-key
//   ELEVENLABS_VOICE_ID=your-voice-id   (e.g. "21m00Tcm4TlvDq8ikWAM" = Rachel)
//
// Output: frontend/public/audio/*.mp3
// Skips any file that already exists — safe to re-run.

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

// ── Load .env manually (no dotenv dependency needed) ──────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.trim().split("=");
    if (key && !key.startsWith("#") && rest.length) {
      process.env[key] = rest.join("=").trim();
    }
  }
}

const API_KEY  = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

if (!API_KEY) {
  console.error("❌  ELEVENLABS_API_KEY not set. Add it to .env or export it.");
  process.exit(1);
}

// ── Output directory ──────────────────────────────────────
const OUT_DIR = path.resolve(__dirname, "../frontend/public/audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── All static phrases ────────────────────────────────────
// key → spoken text
// The key becomes the filename: key.mp3
// Keep keys in sync with frontend/src/audio/keys.ts

const PHRASES = {
  // ── Outcomes ──────────────────────────────────────────
  "outcome-correct":
    "All clear. You have the correct PPE for this scenario.",
  "outcome-incomplete":
    "Incomplete. You are missing required PPE. Please check the results.",
  "outcome-over-protected":
    "You are over-protected. You have more PPE than required, but you are safe.",
  "outcome-incorrect":
    "Incorrect PPE. Both items are missing and unnecessary items are present.",

  // ── Timer ─────────────────────────────────────────────
  "timer-start":
    "Timer started. Put on your PPE before time runs out.",
  "timer-end":
    "Time's up. Capturing your photo now.",
  "timer-warning":
    "Ten seconds remaining.",

  // ── Hurricane warnings ────────────────────────────────
  "warning-helmet-needed":
    "Warning. A safety vest has been detected without a hard hat. Put on a helmet immediately.",
  "warning-must-leave":
    "You must leave now. PPE non-compliance detected. This area is unsafe.",

  // ── PPE item names (read out in missing/correct lists) ─
  "item-gloves":       "Gloves.",
  "item-coverall":     "Coverall.",
  "item-mask":         "Mask.",
  "item-eye-protection": "Eye protection.",
  "item-face-shield":  "Face shield.",
  "item-hard-hat":     "Hard hat.",
  "item-safety-vest":  "Safety vest.",

  // ── Category briefings ────────────────────────────────
  "category-standard":
    "Standard precautions. Gloves required.",
  "category-droplet":
    "Droplet precautions. Gloves, coverall, mask, and eye protection required.",
  "category-contact":
    "Contact precautions. Gloves and coverall required.",
  "category-airborne":
    "Airborne precautions. Gloves, coverall, mask, and eye protection required. An N95 or higher mask is mandatory.",
  "category-high-risk":
    "High risk procedure. Full PPE required — gloves, coverall, mask, face shield, and eye protection.",

  // ── Hurricane scenario briefing ───────────────────────
  "scenario-hurricane":
    "A responder is entering a flood-damaged area with contaminated standing water, debris, unstable surfaces, and possible exposure to mold and sharp objects.",

  // ── Generic UI ───────────────────────────────────────
  "scenario-selected":
    "Scenario selected. Read the briefing and start the camera.",

  // ── Scenario briefings (read aloud on Start PPE Challenge) ──
  // Format: intro + scenario text + action prompt
  "scenario-briefing-hurricane":
    "Scenario selected. A responder is entering a flood-damaged area with contaminated standing water, debris, unstable surfaces, and possible exposure to mold and sharp objects. Put on your PPE and open the camera when ready.",

  "scenario-briefing-1":
    "Scenario selected. Routine blood draw on a stable patient. Put on your PPE and open the camera when ready.",

  "scenario-briefing-2":
    "Scenario selected. Patient presenting with fever and productive cough — suspected influenza. Put on your PPE and open the camera when ready.",

  "scenario-briefing-3":
    "Scenario selected. Entering an isolation room for a patient with C. diff infection. Put on your PPE and open the camera when ready.",

  "scenario-briefing-4":
    "Scenario selected. Suspected tuberculosis — patient has persistent cough and night sweats. Put on your PPE and open the camera when ready.",

  "scenario-briefing-5":
    "Scenario selected. Emergency intubation on an unknown-status patient with high aerosolization risk. Put on your PPE and open the camera when ready.",
};

// ── ElevenLabs TTS fetch ──────────────────────────────────

function synthesize(text, outPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    });

    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let err = "";
        res.on("data", (d) => (err += d));
        res.on("end", () =>
          reject(new Error(`HTTP ${res.statusCode}: ${err}`))
        );
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        fs.writeFileSync(outPath, Buffer.concat(chunks));
        resolve();
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Main loop ─────────────────────────────────────────────

const entries = Object.entries(PHRASES);
let generated = 0;
let skipped   = 0;

console.log(`\n🎙  Generating ${entries.length} audio clips → ${OUT_DIR}\n`);

for (const [key, text] of entries) {
  const outPath = path.join(OUT_DIR, `${key}.mp3`);

  if (fs.existsSync(outPath)) {
    console.log(`  ⏭  skip   ${key}.mp3`);
    skipped++;
    continue;
  }

  process.stdout.write(`  ⏳  gen    ${key}.mp3 … `);

  try {
    await synthesize(text, outPath);
    console.log("✓");
    generated++;

    // Polite rate-limit pause between requests (ElevenLabs free tier)
    await new Promise((r) => setTimeout(r, 500));
  } catch (err) {
    console.log(`✗  ${err.message}`);
  }
}

console.log(`\n✅  Done — ${generated} generated, ${skipped} skipped.\n`);
console.log("Next step: node scripts/generate-audio.mjs is idempotent,");
console.log("re-run any time you add new keys to PHRASES.\n");
