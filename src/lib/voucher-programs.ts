/**
 * Voucher programs ("chương trình"): the owner groups codes into named campaigns; each program is its own banner
 * strip on the home page, titled after the program and painted in the colour picked for it.
 */
export const VOUCHER_COLORS = ["red", "blue", "green", "orange", "purple", "pink", "teal", "gold"] as const;
export type VoucherColor = (typeof VOUCHER_COLORS)[number];

export interface VoucherPalette {
  label: string;
  /** Header band (gradient) + text colour. */
  band: string;
  /** Ticket stub and copy button background. */
  solid: string;
  solidHover: string;
  /** Strip frame / ticket border / dashed divider. */
  border: string;
  soft: string;
  /** Code text colour. */
  text: string;
  /** Swatch preview in the admin. */
  swatch: string;
}

/** Literal class names (Tailwind must see them in source). */
export const VOUCHER_PALETTE: Record<VoucherColor, VoucherPalette> = {
  red: { label: "Đỏ thương hiệu", band: "bg-gradient-to-r from-lien-blue to-lien-blue-hover text-white", solid: "bg-lien-blue", solidHover: "hover:bg-lien-blue-hover", border: "border-lien-blue/30", soft: "bg-lien-blue-soft/50", text: "text-lien-blue", swatch: "bg-lien-blue" },
  blue: { label: "Xanh nước biển", band: "bg-gradient-to-r from-[#1878b9] to-[#125d91] text-white", solid: "bg-[#1878b9]", solidHover: "hover:bg-[#125d91]", border: "border-[#1878b9]/30", soft: "bg-[#eaf3fb]", text: "text-[#1878b9]", swatch: "bg-[#1878b9]" },
  green: { label: "Xanh lá", band: "bg-gradient-to-r from-[#2e9e5b] to-[#227a45] text-white", solid: "bg-[#2e9e5b]", solidHover: "hover:bg-[#227a45]", border: "border-[#2e9e5b]/30", soft: "bg-[#ecf7f0]", text: "text-[#227a45]", swatch: "bg-[#2e9e5b]" },
  orange: { label: "Cam", band: "bg-gradient-to-r from-[#f0812c] to-[#d7661a] text-white", solid: "bg-[#f0812c]", solidHover: "hover:bg-[#d7661a]", border: "border-[#f0812c]/30", soft: "bg-[#fff3ea]", text: "text-[#d7661a]", swatch: "bg-[#f0812c]" },
  purple: { label: "Tím", band: "bg-gradient-to-r from-[#7b4fd6] to-[#5e37b0] text-white", solid: "bg-[#7b4fd6]", solidHover: "hover:bg-[#5e37b0]", border: "border-[#7b4fd6]/30", soft: "bg-[#f3eefc]", text: "text-[#5e37b0]", swatch: "bg-[#7b4fd6]" },
  pink: { label: "Hồng sakura", band: "bg-gradient-to-r from-[#f06292] to-[#d8467a] text-white", solid: "bg-[#f06292]", solidHover: "hover:bg-[#d8467a]", border: "border-[#f06292]/30", soft: "bg-[#fdeff4]", text: "text-[#d8467a]", swatch: "bg-[#f06292]" },
  teal: { label: "Xanh ngọc", band: "bg-gradient-to-r from-[#159a9c] to-[#0f7a7c] text-white", solid: "bg-[#159a9c]", solidHover: "hover:bg-[#0f7a7c]", border: "border-[#159a9c]/30", soft: "bg-[#e9f6f6]", text: "text-[#0f7a7c]", swatch: "bg-[#159a9c]" },
  gold: { label: "Vàng đồng", band: "bg-gradient-to-r from-[#c9962b] to-[#a67a1c] text-white", solid: "bg-[#c9962b]", solidHover: "hover:bg-[#a67a1c]", border: "border-[#c9962b]/30", soft: "bg-[#fbf5e6]", text: "text-[#a67a1c]", swatch: "bg-[#c9962b]" },
};

export const isVoucherColor = (v: unknown): v is VoucherColor => typeof v === "string" && (VOUCHER_COLORS as readonly string[]).includes(v);
export const voucherPalette = (c: string | null | undefined): VoucherPalette => VOUCHER_PALETTE[isVoucherColor(c) ? c : "red"];

export interface ProgramLike {
  id: number;
  position: number;
  active: boolean;
}

/**
 * Home page: one strip per active program, in position order, holding the vouchers assigned to it. Vouchers without a
 * program (or whose program is inactive / deleted) join the first strip so a code is never hidden by accident.
 */
export function groupVouchersByProgram<P extends ProgramLike, V extends { programId: number | null }>(programs: P[], vouchers: V[]): Array<{ program: P; vouchers: V[] }> {
  const active = [...programs].filter((p) => p.active).sort((a, b) => a.position - b.position || a.id - b.id);
  if (!active.length || !vouchers.length) return [];
  const byId = new Map(active.map((p) => [p.id, [] as V[]]));
  for (const v of vouchers) (byId.get(v.programId ?? -1) ?? byId.get(active[0].id)!).push(v);
  return active.map((program) => ({ program, vouchers: byId.get(program.id)! })).filter((g) => g.vouchers.length > 0);
}
