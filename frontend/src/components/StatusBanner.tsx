interface StatusBannerProps {
  message: string;
  tone?: "error" | "warning" | "info" | "success";
  className?: string;
}

const toneClasses: Record<NonNullable<StatusBannerProps["tone"]>, string> = {
  error: "border-red-400 bg-red-100 text-red-800",
  warning: "border-yellow-400 bg-yellow-100 text-yellow-800",
  info: "border-blue-400 bg-blue-100 text-blue-800",
  success: "border-green-400 bg-green-100 text-green-800",
};

export default function StatusBanner({
  message,
  tone = "info",
  className = "",
}: StatusBannerProps) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 ${toneClasses[tone]} ${className}`}>
      {message}
    </div>
  );
}