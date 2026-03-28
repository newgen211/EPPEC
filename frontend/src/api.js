// File: frontend/src/api.js
// All fetch() calls to the backend in one place

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const classifyScenario = (text) =>
  fetch(`${BASE_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then((r) => r.json())

export const detectPPE = (frameBase64) =>
  fetch(`${BASE_URL}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame: frameBase64 }),
  }).then((r) => r.json())

export const getScenarios = () =>
  fetch(`${BASE_URL}/scenarios`).then((r) => r.json())
