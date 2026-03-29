const API_BASE_URL = "http://localhost:8000";

export type BackendScenario = {
  id: number;
  text: string;
  category: string;
  required?: string[];
  explanation?: string;
  generated?: boolean;
};

export type Detection = {
  label: string;
  raw_class?: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
};

export type DetectUploadResponse = {
  model_type: string;
  detections: Detection[];
  low_confidence: string[];
  num_detections: number;
  elapsed_time: number;
  image_size: [number, number];
};

export type DetectAndGradeResponse = {
  scenario: string;
  category: string;
  required: string[];
  explanation: string;
  detections: Detection[];
  low_confidence: string[];
  num_detections: number;
  elapsed_time: number;
  outcome: string;
  correct: string[];
  missing: string[];
  extra: string[];
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchScenarios(): Promise<BackendScenario[]> {
  const response = await fetch(`${API_BASE_URL}/scenarios`);
  return parseJson<BackendScenario[]>(response);
}

export async function fetchGeneratedScenario(): Promise<BackendScenario> {
  const response = await fetch(`${API_BASE_URL}/scenarios/generate`);
  return parseJson<BackendScenario>(response);
}

export async function detectUpload(
  file: File,
  modelType: "medical" | "construction" = "medical"
): Promise<DetectUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/detect/upload?model_type=${encodeURIComponent(modelType)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  return parseJson<DetectUploadResponse>(response);
}

export async function detectAndGrade(
  scenarioText: string,
  file: File,
  modelType: "medical" | "construction" = "medical"
): Promise<DetectAndGradeResponse> {
  const formData = new FormData();
  formData.append("scenario_text", scenarioText);
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/detect-and-grade?model_type=${encodeURIComponent(modelType)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  return parseJson<DetectAndGradeResponse>(response);
}