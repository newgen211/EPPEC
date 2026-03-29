// File: frontend/src/audio/useAiScenarioAudio.ts
//
// Calls ElevenLabs exactly once when the AI scenario text is available,
// caches the result as a blob URL for the session.
// Returns the blob URL (or null while loading) and a loading flag.

import { useEffect, useRef, useState } from "react";

const VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const API_KEY  = import.meta.env.VITE_ELEVENLABS_API_KEY  ?? "";

export function useAiScenarioAudio(scenarioText: string | null) {
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const fetchedTextRef          = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch if we have text, an API key, and haven't already fetched this text
    if (!scenarioText || !API_KEY || fetchedTextRef.current === scenarioText) return;

    fetchedTextRef.current = scenarioText;

    const controller = new AbortController();

    const fetchAudio = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "xi-api-key": API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: `Scenario selected. ${scenarioText} Put on your PPE and open the camera when ready.`,
              model_id: "eleven_turbo_v2",
              voice_settings: { stability: 0.4, similarity_boost: 0.8 },
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`ElevenLabs ${response.status}`);
        }

        const blob = await response.blob();
        const url  = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("[useAiScenarioAudio] fetch failed:", err);
          setError((err as Error).message);
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchAudio();

    return () => {
      controller.abort();
    };
  }, [scenarioText]);

  // Revoke blob URL on unmount to avoid memory leak
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return { blobUrl, loading, error };
}