import { CONFIDENCE_LABEL, SAFETY_FACTOR, type DimsConfidence } from "@/lib/shipping";
import { cn } from "@/lib/utils";

const CLS: Record<DimsConfidence, string> = { high: "bg-green-100 text-green-800", medium: "bg-blue-100 text-blue-800", low: "bg-violet-100 text-violet-800" };

/** Small pill for the weight/dimension confidence (admin lists and forms). */
export function ConfidenceBadge({ value, className }: { value: DimsConfidence | null; className?: string }) {
  if (!value) return <span className={cn("inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600", className)}>Chưa đánh giá ×2</span>;
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", CLS[value], className)} title={`Hệ số an toàn ×${SAFETY_FACTOR[value]}`}>
      {CONFIDENCE_LABEL[value]} ×{SAFETY_FACTOR[value]}
    </span>
  );
}
