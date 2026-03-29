import type { Detection } from "../types/api";
import type { DetectionConfidence, AppMode } from "../types/app";
import type { BackendScenario } from "../types/api";
import DetectionSidebar from "../components/DetectionSidebar";
import StatusBanner from "../components/StatusBanner";

interface CameraScreenProps {
  mode: AppMode;
  selectedScenario: BackendScenario;
  errorMessage: string | null;
  uploadedImage: File | null;
  previewUrl: string | null;
  isCameraOn: boolean;
  timerActive: boolean;
  timerSecondsLeft: number;
  visionOnline: boolean;
  visionBusy: boolean;
  liveConfidences: DetectionConfidence[];
  lastDetections: Detection[];
  videoRef: React.RefObject<HTMLVideoElement>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
  captureCanvasRef: React.RefObject<HTMLCanvasElement>;
  onBack: () => void;
  onImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCapturePhoto: () => void;
  onRunUploadDetection: () => void;
  onSubmitFinal: () => void;
  onStartMedicalTimer: () => void;
  onCancelMedicalTimer: () => void;
}

export default function CameraScreen({
  mode,
  selectedScenario,
  errorMessage,
  uploadedImage,
  previewUrl,
  isCameraOn,
  timerActive,
  timerSecondsLeft,
  visionOnline,
  visionBusy,
  liveConfidences,
  lastDetections,
  videoRef,
  overlayCanvasRef,
  captureCanvasRef,
  onBack,
  onImageChange,
  onStartCamera,
  onStopCamera,
  onCapturePhoto,
  onRunUploadDetection,
  onSubmitFinal,
  onStartMedicalTimer,
  onCancelMedicalTimer,
}: CameraScreenProps) {
  return (
    <div className="rounded-2xl border-2 border-[#2E1F27] bg-[#E2CFEA] p-6 shadow-sm">
      <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#4059AD]">
        {mode === "construction"
          ? "Construction PPE"
          : "Medical PPE"}
      </div>

      <h2 className="mb-3 text-2xl font-semibold">Live Camera Detection</h2>
      <p className="mb-6 text-[#2E1F27]/75">{selectedScenario.text}</p>

      {errorMessage && (
        <StatusBanner tone="warning" message={errorMessage} className="mb-4" />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <div>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium">Upload Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className="block w-full rounded-xl border-2 border-[#2E1F27] bg-white p-3 text-sm file:mr-4 file:rounded-lg file:border-2 file:border-[#2E1F27] file:bg-[#F5CB5C] file:px-4 file:py-2 file:text-sm file:font-medium"
            />
          </label>

          <div className="mb-4 flex flex-wrap gap-3">
            {!isCameraOn ? (
              <button
                onClick={onStartCamera}
                className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
              >
                Start Camera
              </button>
            ) : (
              <>
                <button
                  onClick={onStopCamera}
                  className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78]"
                >
                  Stop Camera
                </button>
                <button
                  onClick={onCapturePhoto}
                  className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
                >
                  Capture Frame
                </button>
              </>
            )}

            <button
              onClick={onRunUploadDetection}
              disabled={!uploadedImage}
              className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Analyze Selected Image
            </button>

            <button
              onClick={onSubmitFinal}
              disabled={!uploadedImage}
              className="rounded-xl border-2 border-[#2E1F27] bg-[#419D78] px-4 py-2 font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit Final
            </button>
          </div>

          {mode === "medical" && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#2E1F27] bg-white p-4">
              <div className="font-medium">Timer: {timerSecondsLeft}s</div>

              {!timerActive ? (
                <button
                  onClick={onStartMedicalTimer}
                  className="rounded-xl border-2 border-[#2E1F27] bg-[#F5CB5C] px-4 py-2 font-medium transition hover:brightness-95"
                >
                  Start PPE Timer
                </button>
              ) : (
                <button
                  onClick={onCancelMedicalTimer}
                  className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78]"
                >
                  Cancel Timer
                </button>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border-2 border-[#2E1F27] bg-black">
            {isCameraOn ? (
              <div className="relative aspect-[4/3] w-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <canvas ref={captureCanvasRef} className="hidden" />
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Uploaded preview"
                className="w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-white/80">
                Camera or uploaded preview will appear here
              </div>
            )}
          </div>
        </div>

        <DetectionSidebar
          liveConfidences={liveConfidences}
          lastDetections={lastDetections}
          visionOnline={visionOnline}
          visionBusy={visionBusy}
        />
      </div>

      <div className="mt-6">
        <button
          onClick={onBack}
          className="rounded-xl border-2 border-[#2E1F27] bg-white px-4 py-2 font-medium transition hover:border-[#419D78]"
        >
          Back
        </button>
      </div>
    </div>
  );
}