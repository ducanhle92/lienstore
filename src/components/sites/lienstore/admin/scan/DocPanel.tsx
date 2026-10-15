"use client";

/** Scan documents (phiếu nhập / kiểm kê / soạn hàng) — filled in by GĐ2–GĐ4. */
export type DocKind = "receive" | "count" | "pick";
export const DOC_LABEL: Record<DocKind, string> = { receive: "Nhập hàng", count: "Kiểm kho", pick: "Xuất hàng" };

export function DraftList(props: { kind: DocKind; warehouse: string | null; onOpen: (id: number) => void }) {
  void props;
  return <p className="text-[14px] text-lien-muted">Chức năng {DOC_LABEL[props.kind]} đang được hoàn thiện.</p>;
}

export function DocPanel(props: { kind: DocKind; docId: number; onClose: () => void; registerScanHandler: (h: null) => void; online: boolean }) {
  void props;
  return null;
}
