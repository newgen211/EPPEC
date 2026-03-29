import type { DetectUploadResponse } from "../types/api";

export interface LiveFrameMessage {
  type: "frame";
  frame_id: number;
  model_type: "construction" | "medical";
  image: string; // base64 jpeg without data URL prefix
}

export interface LiveDetectionMessage extends DetectUploadResponse {
  type: "detection_result";
  frame_id: number;
}

export interface LiveErrorMessage {
  type: "error";
  frame_id?: number;
  error: string;
}

export type LiveSocketMessage = LiveDetectionMessage | LiveErrorMessage;

const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

export function getLiveDetectionWsUrl(): string {
  const envWs = import.meta.env.VITE_WS_BASE?.replace(/\/$/, "");
  if (envWs) return `${envWs}/ws/detect`;

  const apiUrl = new URL(API_BASE);
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${apiUrl.host}/ws/detect`;
}

export function createDetectionSocket(): WebSocket {
  return new WebSocket(getLiveDetectionWsUrl());
}