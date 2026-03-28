// File: frontend/src/App.jsx
// Screen router — manages state machine: Scenario → Timer → Result

import { useState } from "react"
import ScenarioScreen from "./screens/ScenarioScreen"
import TimerScreen from "./screens/TimerScreen"
import ResultScreen from "./screens/ResultScreen"

export default function App() {
  const [screen, setScreen] = useState("scenario")
  const [result, setResult] = useState(null)

  return (
    <>
      {screen === "scenario" && <ScenarioScreen onStart={() => setScreen("timer")} />}
      {screen === "timer"    && <TimerScreen onComplete={(r) => { setResult(r); setScreen("result") }} />}
      {screen === "result"   && <ResultScreen {...result} onReset={() => setScreen("scenario")} />}
    </>
  )
}
