// File: frontend/src/components/ConfidenceBar.tsx

type Props = {
  item: string;
  confidence: number; // 0–100
};

function getBarColor(confidence: number): string {
  if (confidence >= 70) return "#419D78";  // green
  if (confidence >= 35) return "#F5CB5C";  // yellow
  if (confidence > 0)   return "#4059AD";  // blue – detected but weak
  return "#2E1F27";                         // nothing detected
}

function getBarLabel(confidence: number): string {
  if (confidence === 0) return "Not detected";
  return `${confidence}%`;
}

export default function ConfidenceBar({ item, confidence }: Props) {
  const color = getBarColor(confidence);
  const label = getBarLabel(confidence);

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[#2E1F27]">{item}</span>
        <span
          className="text-xs font-semibold"
          style={{ color: confidence > 0 ? color : "#2E1F27" + "99" }}
        >
          {label}
        </span>
      </div>

      {/* Track */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#2E1F27]/10">
        {/* Fill — CSS transition animates width changes on each re-render */}
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${confidence}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}