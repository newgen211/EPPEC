// File: frontend/src/audio/useSound.ts

import { useCallback, useRef } from "react";
import type { AudioKey } from "./keys";

// Keeps one Audio instance per key so rapid calls don't stack
const _cache: Map<string, HTMLAudioElement> = new Map();

function getAudio(src: string): HTMLAudioElement {
  if (!_cache.has(src)) {
    _cache.set(src, new Audio(src));
  }
  return _cache.get(src)!;
}

export function useSound() {
  const currentRef = useRef<HTMLAudioElement | null>(null);

  // Stop whatever is currently playing
  const stop = useCallback(() => {
    if (currentRef.current) {
      currentRef.current.pause();
      currentRef.current.currentTime = 0;
      currentRef.current = null;
    }
  }, []);

  // Play a static pre-generated clip by key
  const play = useCallback((key: AudioKey) => {
    stop();
    const audio = getAudio(`/audio/${key}.mp3`);
    audio.currentTime = 0;
    currentRef.current = audio;
    audio.play().catch(() => {
      // Browser may block autoplay before first user gesture — silent fail
    });
  }, [stop]);

  // Play a dynamic blob URL (AI scenario audio from ElevenLabs at runtime)
  const playBlob = useCallback((blobUrl: string) => {
    stop();
    const audio = new Audio(blobUrl);
    currentRef.current = audio;
    audio.play().catch(() => {});
  }, [stop]);

  return { play, playBlob, stop };
}