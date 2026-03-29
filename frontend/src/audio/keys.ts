// File: frontend/src/audio/keys.ts
//
// Single source of truth for every static audio key.
// Must stay in sync with the PHRASES map in scripts/generate-audio.mjs.

export const AUDIO = {
  // Outcomes
  OUTCOME_CORRECT:        "outcome-correct",
  OUTCOME_INCOMPLETE:     "outcome-incomplete",
  OUTCOME_OVER_PROTECTED: "outcome-over-protected",
  OUTCOME_INCORRECT:      "outcome-incorrect",

  // Timer
  TIMER_START:            "timer-start",
  TIMER_END:              "timer-end",
  TIMER_WARNING:          "timer-warning",

  // Hurricane warnings
  WARNING_HELMET_NEEDED:  "warning-helmet-needed",
  WARNING_MUST_LEAVE:     "warning-must-leave",

  // PPE item names
  ITEM_GLOVES:            "item-gloves",
  ITEM_COVERALL:          "item-coverall",
  ITEM_MASK:              "item-mask",
  ITEM_EYE_PROTECTION:    "item-eye-protection",
  ITEM_FACE_SHIELD:       "item-face-shield",
  ITEM_HARD_HAT:          "item-hard-hat",
  ITEM_SAFETY_VEST:       "item-safety-vest",

  // Category briefings
  CATEGORY_STANDARD:      "category-standard",
  CATEGORY_DROPLET:       "category-droplet",
  CATEGORY_CONTACT:       "category-contact",
  CATEGORY_AIRBORNE:      "category-airborne",
  CATEGORY_HIGH_RISK:     "category-high-risk",

  // Scenario briefings (read aloud on Start PPE Challenge)
  SCENARIO_SELECTED:           "scenario-selected",
  SCENARIO_HURRICANE:          "scenario-hurricane",
  SCENARIO_BRIEFING_HURRICANE: "scenario-briefing-hurricane",
  SCENARIO_BRIEFING_1:         "scenario-briefing-1",
  SCENARIO_BRIEFING_2:         "scenario-briefing-2",
  SCENARIO_BRIEFING_3:         "scenario-briefing-3",
  SCENARIO_BRIEFING_4:         "scenario-briefing-4",
  SCENARIO_BRIEFING_5:         "scenario-briefing-5",
} as const;

export type AudioKey = typeof AUDIO[keyof typeof AUDIO];