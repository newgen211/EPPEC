import { useState, useRef } from "react";
import styles from "./TestPage.module.css";

interface Detection {
  class: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface TestResult {
  model_type: string;
  detections: Detection[];
  num_detections: number;
  elapsed_time: number;
  image_size: [number, number];
}

export default function TestPage() {
  const [modelType, setModelType] = useState<"construction" | "medical">(
    "construction",
  );
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError("");
      setResult(null);
    }
  };

  const handleRunDetection = async () => {
    if (!image) {
      setError("Please select an image first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", image);
      formData.append("model_type", modelType);

      const response = await fetch("http://localhost:8000/test-detect", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleModelSwitch = (type: "construction" | "medical") => {
    setModelType(type);
    setResult(null);
  };

  return (
    <div className={styles.container}>
      <h1>PPE Model Tester</h1>

      {/* Model Selection */}
      <div className={styles.modelSelector}>
        <button
          className={`${styles.modelBtn} ${modelType === "construction" ? styles.active : ""}`}
          onClick={() => handleModelSwitch("construction")}
        >
          🏗️ Construction
        </button>
        <button
          className={`${styles.modelBtn} ${modelType === "medical" ? styles.active : ""}`}
          onClick={() => handleModelSwitch("medical")}
        >
          🏥 Medical
        </button>
      </div>

      {/* Image Upload */}
      <div className={styles.uploadSection}>
        <button
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
        >
          📷 Select Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: "none" }}
        />
        {image && <p>Selected: {image.name}</p>}
      </div>

      {/* Preview */}
      {preview && (
        <div className={styles.preview}>
          <img src={preview} alt="Preview" />
        </div>
      )}

      {/* Run Detection Button */}
      {preview && (
        <button
          className={styles.detectBtn}
          onClick={handleRunDetection}
          disabled={loading}
        >
          {loading ? "Running Detection..." : "▶️ Run Detection"}
        </button>
      )}

      {/* Error Message */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Results */}
      {result && (
        <div className={styles.results}>
          <h2>Results</h2>
          <div className={styles.stats}>
            <div>
              <strong>Model:</strong> {result.model_type}
            </div>
            <div>
              <strong>Detections:</strong> {result.num_detections}
            </div>
            <div>
              <strong>Time:</strong> {result.elapsed_time}s
            </div>
            <div>
              <strong>Image Size:</strong> {result.image_size[0]}x
              {result.image_size[1]}
            </div>
          </div>

          {result.detections.length > 0 ? (
            <div className={styles.detectionsList}>
              <h3>Detections:</h3>
              {result.detections.map((detection, idx) => (
                <div key={idx} className={styles.detectionItem}>
                  <span className={styles.class}>{detection.class}</span>
                  <span className={styles.confidence}>
                    {(detection.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>No detections found</p>
          )}
        </div>
      )}
    </div>
  );
}
