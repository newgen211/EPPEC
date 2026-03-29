import type {
  BackendScenario,
  DetectAndGradeResponse,
  DetectUploadResponse,
} from "../types/api";

const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

async function sendAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as T & { error?: string };

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function sendFormAPI<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  return sendAPI<T>(path, {
    method: "POST",
    body: formData,
  });
}

export async function fetchScenarios(): Promise<BackendScenario[]> {
  return sendAPI<BackendScenario[]>("/scenarios");
}

export async function fetchGeneratedScenario(): Promise<BackendScenario> {
  return sendAPI<BackendScenario>("/scenarios/generate");
}

export async function detectUpload(
  file: File,
  modelType: "construction" | "medical",
): Promise<DetectUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_type", modelType);

  return sendFormAPI<DetectUploadResponse>("/test-detect", formData);
}

export async function detectAndGrade(
  file: File,
  modelType: "construction" | "medical",
  scenarioText?: string,
): Promise<DetectAndGradeResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_type", modelType);

  if (scenarioText) {
    formData.append("scenario_text", scenarioText);
  }

  return sendFormAPI<DetectAndGradeResponse>("/detect-and-grade", formData);
}

export { API_BASE, sendAPI };