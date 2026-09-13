import Image from "next/image";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import type { CatalogProduct } from "@/types/shop";

interface Props {
  labels: string[];
  members: CatalogProduct[];
}

interface Node {
  label: string;
  value: string;
  children: Node[];
  leaves: CatalogProduct[];
}

const MISSING = "(chưa điền)";

function build(labels: string[], members: CatalogProduct[], depth = 0): Node[] {
  if (depth >= labels.length) return [];
  const label = labels[depth];
  const byValue = new Map<string, CatalogProduct[]>();
  for (const p of members) {
    const v = p.variantAttrs[label] || MISSING;
    byValue.set(v, [...(byValue.get(v) ?? []), p]);
  }
  return [...byValue.entries()].map(([value, list]) => ({
    label,
    value,
    children: depth + 1 < labels.length ? build(labels, list, depth + 1) : [],
    leaves: depth + 1 < labels.length ? [] : list,
  }));
}

function Leaf({ p }: { p: CatalogProduct }) {
  return (
    <li className="flex items-center gap-2 py-0.5 text-[13px]">
      {p.thumb ? <Image src={p.thumb} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
      <Link href={`/admin/products/${p.id}/`} className="min-w-0 truncate text-lien-heading hover:text-lien-blue">
        {p.name}
      </Link>
      <span className="whitespace-nowrap text-[12px] text-lien-muted">
        {formatAmount(p.price)}đ · #{p.variantPosition}
        {p.status === "draft" ? " · nháp" : ""}
      </span>
    </li>
  );
}

function Branch({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="m-0 list-none border-l border-dashed border-[#d1d5db] pl-4">
      {nodes.map((n) => (
        <li key={`${n.label}:${n.value}`} className="relative py-1 before:absolute before:top-[15px] before:-left-4 before:h-px before:w-3 before:border-t before:border-dashed before:border-[#d1d5db]">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[12px] font-semibold ${n.value === MISSING ? "bg-amber-50 text-amber-800" : "bg-lien-blue-soft text-lien-blue"}`}>
            {n.label}: {n.value}
          </span>
          {n.children.length ? <Branch nodes={n.children} /> : null}
          {n.leaves.length ? <ul className="m-0 list-none border-l border-dashed border-[#d1d5db] pl-4">{n.leaves.map((p) => <Leaf key={p.id} p={p} />)}</ul> : null}
        </li>
      ))}
    </ul>
  );
}

/** The family drawn as a tree: level 1 value → level 2 value → … → products. Missing values are flagged. */
export function VariantTree({ labels, members }: Props) {
  if (!members.length) return <p className="m-0 text-[13px] text-lien-muted">Chưa có sản phẩm trong nhóm.</p>;
  if (!labels.length)
    return (
      <ul className="m-0 list-none p-0">
        {members.map((p) => (
          <Leaf key={p.id} p={p} />
        ))}
      </ul>
    );
  return (
    <div data-testid="variant-tree">
      <Branch nodes={build(labels, members)} />
    </div>
  );
}
