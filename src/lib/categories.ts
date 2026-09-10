/**
 * Category tree helpers (pure — usable in server and client components).
 * Categories are a flat list with an optional `parentSlug`; the tree is derived here.
 */

export interface CategoryLike {
  slug: string;
  name: string;
  count: number;
  image: string | null;
  parentSlug: string | null;
  description?: string;
}

export interface CategoryNode<T extends CategoryLike = CategoryLike> {
  category: T;
  children: CategoryNode<T>[];
  /** Products in this category plus all descendants. */
  total: number;
  depth: number;
  /** Image: own image, else the first child's. */
  image: string | null;
}

/** Build the tree (top-level nodes first). Orphans whose parent is missing become top-level. */
export function buildCategoryTree<T extends CategoryLike>(categories: T[]): CategoryNode<T>[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const childrenOf = new Map<string | null, T[]>();
  for (const c of categories) {
    const parent = c.parentSlug && bySlug.has(c.parentSlug) && c.parentSlug !== c.slug ? c.parentSlug : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(c);
    childrenOf.set(parent, list);
  }
  const seen = new Set<string>();
  const build = (parent: string | null, depth: number): CategoryNode<T>[] =>
    (childrenOf.get(parent) ?? [])
      .filter((c) => !seen.has(c.slug) && seen.add(c.slug))
      .map((c) => {
        const children = build(c.slug, depth + 1);
        const total = c.count + children.reduce((s, n) => s + n.total, 0);
        return { category: c, children, total, depth, image: c.image ?? children.find((n) => n.image)?.image ?? null };
      })
      .sort((a, b) => b.total - a.total || a.category.name.localeCompare(b.category.name, "vi"));
  return build(null, 0);
}

/** Depth-first flattening (parents before children) — for admin lists and select boxes. */
export function flattenTree<T extends CategoryLike>(nodes: CategoryNode<T>[]): CategoryNode<T>[] {
  const out: CategoryNode<T>[] = [];
  const walk = (list: CategoryNode<T>[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** The slug and every descendant slug. */
export function descendantSlugs(categories: CategoryLike[], slug: string): string[] {
  const out = [slug];
  const stack = [slug];
  const seen = new Set(out);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of categories) {
      if (c.parentSlug === cur && !seen.has(c.slug)) {
        seen.add(c.slug);
        out.push(c.slug);
        stack.push(c.slug);
      }
    }
  }
  return out;
}

/** Breadcrumb chain from the top-level ancestor down to `slug`. */
export function ancestorChain<T extends CategoryLike>(categories: T[], slug: string): T[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const chain: T[] = [];
  let cur = bySlug.get(slug);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.slug)) {
    guard.add(cur.slug);
    chain.unshift(cur);
    cur = cur.parentSlug ? bySlug.get(cur.parentSlug) : undefined;
  }
  return chain;
}

/** Strip the "( ENGLISH )" suffix used in the original shop names. */
export function shortName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

/** Category name for running text: English part dropped, sentence case ("SỨC KHỎE ( HEALTH )" → "Sức khỏe"). */
export function displayName(name: string): string {
  const short = shortName(name);
  // names already written in sentence case (new catalogue) are kept as they are — only SHOUTING names are folded
  if (short !== short.toLocaleUpperCase("vi")) return short;
  const s = short.toLocaleLowerCase("vi");
  return s ? s.charAt(0).toLocaleUpperCase("vi") + s.slice(1) : s;
}
