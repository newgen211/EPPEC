// File: frontend/src/components/PPEChecklist.tsx

type ChecklistItem = {
  label: string;
  status: "correct" | "missing" | "extra" | "neutral";
};

type Props = {
  required: string[];
  correct?: string[];
  missing?: string[];
  extra?: string[];
  /** When no grading result yet (live camera view), just show required items as neutral */
  liveMode?: boolean;
};

const STATUS_CONFIG = {
  correct: {
    icon: "✓",
    bg: "bg-[#419D78]/10",
    border: "border-[#419D78]",
    text: "text-[#419D78]",
    iconBg: "bg-[#419D78]",
    iconText: "text-white",
  },
  missing: {
    icon: "✗",
    bg: "bg-red-50",
    border: "border-red-400",
    text: "text-red-600",
    iconBg: "bg-red-400",
    iconText: "text-white",
  },
  extra: {
    icon: "+",
    bg: "bg-[#F5CB5C]/10",
    border: "border-[#F5CB5C]",
    text: "text-[#2E1F27]",
    iconBg: "bg-[#F5CB5C]",
    iconText: "text-[#2E1F27]",
  },
  neutral: {
    icon: "·",
    bg: "bg-[#E2CFEA]",
    border: "border-[#2E1F27]/20",
    text: "text-[#2E1F27]/70",
    iconBg: "bg-[#2E1F27]/20",
    iconText: "text-[#2E1F27]",
  },
} as const;

export default function PPEChecklist({
  required,
  correct = [],
  missing = [],
  extra = [],
  liveMode = false,
}: Props) {
  const correctSet = new Set(correct);
  const missingSet = new Set(missing);
  const extraSet = new Set(extra);

  const items: ChecklistItem[] = [
    ...required.map((label) => ({
      label,
      status: liveMode
        ? ("neutral" as const)
        : correctSet.has(label)
        ? ("correct" as const)
        : missingSet.has(label)
        ? ("missing" as const)
        : ("neutral" as const),
    })),
    ...extra.map((label) => ({
      label,
      status: "extra" as const,
    })),
  ];

  return (
    <div className="space-y-2">
      {items.map(({ label, status }) => {
        const cfg = STATUS_CONFIG[status];
        return (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${cfg.bg} ${cfg.border}`}
          >
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${cfg.iconBg} ${cfg.iconText}`}
            >
              {cfg.icon}
            </span>
            <span className={`text-sm font-medium ${cfg.text}`}>{label}</span>
            {!liveMode && status === "extra" && (
              <span className="ml-auto text-xs text-[#2E1F27]/50">
                not required
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}