<!-- AUTO-GENERATED from AGENTS.md — do not edit directly.
     Run `bash scripts/sync-agent-rules.sh` to regenerate. -->

---
description: Project conventions for AI Website Clone Template
alwaysApply: true
---
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Website Reverse-Engineer Template

## What This Is
A reusable template for reverse-engineering any website into a clean, modern Next.js codebase using AI coding agents. The Next.js + shadcn/ui + Tailwind v4 base is pre-scaffolded — just run `/clone-website <url1> [<url2> ...]`.

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict)
- **UI:** shadcn/ui (Radix primitives, Tailwind CSS v4, `cn()` utility)
- **Icons:** Lucide React (default — will be replaced/supplemented by extracted SVGs)
- **Styling:** Tailwind CSS v4 with oklch design tokens
- **Deployment:** Vercel

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Run lint + typecheck + build

## Code Style
- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utility classes, no inline styles
- 2-space indentation
- Responsive: mobile-first

## Design Principles
- **Pixel-perfect emulation** — match the target's spacing, colors, typography exactly
- **No personal aesthetic changes during emulation phase** — match 1:1 first, customize later
- **Real content** — use actual text and assets from the target site, not placeholders
- **Beauty-first** — every pixel matters

## Project Structure
```
src/
  app/              # Next.js routes
  components/       # React components
    ui/             # shadcn/ui primitives
    icons.tsx       # Extracted SVG icons as React components
  lib/
    utils.ts        # cn() utility (shadcn)
  types/            # TypeScript interfaces
  hooks/            # Custom React hooks
public/
  images/           # Downloaded images from target site
  videos/           # Downloaded videos from target site
  seo/              # Favicons, OG images, webmanifest
docs/
  research/         # Inspection output (design tokens, components, layout)
  design-references/ # Screenshots and visual references
scripts/            # Asset download scripts
```

## Managing lienstore data (agents: use the CLI, not the browser)
- Product / image admin work (search, price changes, create, bulk edits, uploads) goes through the CLI
  `npm run -s lienstore -- <command>` (= `node scripts/lienstore.mjs`) → Admin API v1 (`/api/admin/v1`). Guide:
  `docs/ADMIN_API.md`. Examples: `products list --search "Hada Labo"`, `products get 2710`,
  `products update 2710 --set price=185000`, `products create --file p.json`, `products bulk-update --file c.json --dry-run --out plan.json`,
  `media upload ./a.jpg`, `categories list`, `whoami`.
- Config comes from `.env.lienstore.local` (or `--profile prod` → `.env.lienstore.prod.local`); never print, pass on the
  command line, or commit the token. Check the `[lienstore] → <url> [ENV]` banner before writing; production writes:
  `--dry-run` first, then `--yes` only when the user asked for a production change.
- Do not open the web preview / puppeteer for data changes; if the API fails, report the JSON error (exit code ≠ 0)
  instead of falling back to the browser. The preview is only for checking the UI when asked.
- Never edit the SQLite file directly for catalogue changes — the API keeps validation, history, cache and audit.
- Stock work (look up a barcode, stock of a product, receive goods, stock counts, pick an order) also goes through the
  CLI (`codes resolve`, `stock`, `barcodes`, `receipts|counts|picks …`, see `docs/ADMIN_API.md` §9) — never change
  `products.stock` or `stock_units` directly. Phone scanning screen: `/admin/scan/` (`docs/SCANNING.md`).

## Variant groups (nhóm biến thể) — bắt buộc
- **Một hãng = một nhóm biến thể.** Không tách nhiều nhóm con theo từng dòng (Shoyo / Attonon / Netsusama…).
  Phân loại bằng cấp thuộc tính trong cùng một nhóm, mẫu: DHC, BCL AHA.
- Cấp điển hình: **Dòng** → **Loại** → **Quy cách** (size / số viên). Chi tiết: `docs/VARIANT_GROUPS.md`.
- **Cấp 1 = loại sản phẩm khách hiểu ngay** (Bột collagen, Kẹo cao su, Chocolate, Sữa bột…), **không** để mã dòng
  (Uru Up, Xylitol, Hohoemi…) đứng một mình ở cấp 1. Sai ví dụ đã gặp: nhóm Lotte hiện Uru Up / Xylitol / Premium Ghana
  khiến KH không biết đang chọn gì. Đúng: Bột collagen → Uru Up → 185g.
- Khi được yêu cầu “gom / sửa nhóm biến thể”: gộp hết SP cùng hãng vào một nhóm, điền đủ cấp theo quy tắc trên,
  xoá nhóm trống thừa.

## MOST IMPORTANT NOTES
- When launching Claude Code agent teams, ALWAYS have each teammate work in their own worktree branch and merge everyone's work at the end, resolving any merge conflicts smartly since you are basically serving the orchestrator role and have full context to our goals, work given, work achieved, and desired outcomes.
- After editing `AGENTS.md`, run `bash scripts/sync-agent-rules.sh` to regenerate platform-specific instruction files.
- After editing `.claude/skills/clone-website/SKILL.md`, run `node scripts/sync-skills.mjs` to regenerate the skill for all platforms.

# Website Inspection Guide

## How to Reverse-Engineer Any Website

This guide outlines what to capture when inspecting a target website via Chrome MCP or browser DevTools.

## Phase 1: Visual Audit

### Screenshots to Capture
- [ ] Every distinct page — desktop, tablet, mobile
- [ ] Dark mode variants (if applicable)
- [ ] Light mode variants (if applicable)
- [ ] Key interaction states (hover, active, open menus, modals)
- [ ] Loading/skeleton states
- [ ] Empty states
- [ ] Error states

### Design Tokens to Extract
- [ ] **Colors** — background, text (primary/secondary/muted), accent, border, hover, error, success, warning
- [ ] **Typography** — font family, sizes (h1-h6, body, caption, label), weights, line heights, letter spacing
- [ ] **Spacing** — padding/margin patterns (look for a scale: 4px, 8px, 12px, 16px, 24px, 32px, etc.)
- [ ] **Border radius** — buttons, cards, avatars, inputs
- [ ] **Shadows/elevation** — card shadows, dropdown shadows, modal overlay
- [ ] **Breakpoints** — when does the layout shift? (inspect with DevTools responsive mode)
- [ ] **Icons** — which icon library? custom SVGs? sizes?
- [ ] **Avatars** — sizes, shapes, fallback behavior
- [ ] **Buttons** — all variants (primary, secondary, ghost, icon-only, danger)
- [ ] **Inputs** — text fields, textareas, selects, checkboxes, toggles

## Phase 2: Component Inventory

For each distinct UI component, document:
1. **Name** — what would you call this component?
2. **Structure** — what HTML elements / child components does it contain?
3. **Variants** — does it have different sizes, colors, or states?
4. **States** — default, hover, active, disabled, loading, error, empty
5. **Responsive behavior** — how does it change at different breakpoints?
6. **Interactions** — click, hover, focus, keyboard navigation
7. **Animations** — transitions, entrance/exit animations, micro-interactions

### Common Components to Look For
- Navigation (top bar, sidebar, bottom bar)
- Cards / list items
- Buttons and links
- Forms and inputs
- Modals and dialogs
- Dropdowns and menus
- Tabs and segmented controls
- Avatars and user badges
- Loading skeletons
- Toast notifications
- Tooltips and popovers

## Phase 3: Layout Architecture

- [ ] **Grid system** — CSS Grid? Flexbox? Fixed widths?
- [ ] **Column layout** — how many columns at each breakpoint?
- [ ] **Max-width** — main content area max-width
- [ ] **Sticky elements** — header, sidebar, floating buttons
- [ ] **Z-index layers** — navigation, modals, tooltips, overlays
- [ ] **Scroll behavior** — infinite scroll, pagination, virtual scrolling

## Phase 4: Technical Stack Analysis

- [ ] **Framework** — React? Vue? Angular? Check `__NEXT_DATA__`, `__NUXT__`, `ng-version`
- [ ] **CSS approach** — Tailwind (utility classes), CSS Modules, Styled Components, Emotion, vanilla CSS
- [ ] **State management** — Redux (check DevTools), React Query, Zustand, Pinia
- [ ] **API patterns** — REST, GraphQL (check network tab for `/graphql` requests)
- [ ] **Font loading** — Google Fonts, self-hosted, system fonts
- [ ] **Image strategy** — CDN, lazy loading, srcset, WebP/AVIF
- [ ] **Animation library** — Framer Motion, GSAP, CSS transitions only

## Phase 5: Documentation Output

After inspection, create these files in `docs/research/`:
1. `DESIGN_TOKENS.md` — All extracted colors, typography, spacing
2. `COMPONENT_INVENTORY.md` — Every component with structure notes
3. `LAYOUT_ARCHITECTURE.md` — Page layouts, grid system, responsive behavior
4. `INTERACTION_PATTERNS.md` — Animations, transitions, hover states
5. `TECH_STACK_ANALYSIS.md` — What the site uses and our chosen equivalents

# Nhóm biến thể (quy tắc bắt buộc)

Áp dụng khi agent / admin gộp sản phẩm thành **nhóm biến thể** (variant family). Tham chiếu UI: Admin › Sản phẩm › Nhóm biến thể; mẫu đúng: **DHC**, **BCL AHA Cleansing Research**.

> **RAG / agent memory:** mọi chat khi tạo hoặc sửa nhóm biến thể **phải** đọc file này. Cấp 1 bắt buộc là loại sản phẩm khách hiểu được — xem §2.

## Nguyên tắc

1. **Một hãng / một dòng thương hiệu = một nhóm biến thể**  
   Không tạo nhiều nhóm riêng lẻ cho từng dòng con (sai: `Kobayashi Shoyo`, `Kobayashi Attonon`, `Kobayashi Netsusama`… tách 4 nhóm).  
   Đúng: một nhóm **`Kobayashi`**, bên trong phân cấp bằng thuộc tính.

2. **Cấp 1 = loại sản phẩm khách hiểu ngay** (bắt buộc)  
   Khách chọn cấp 1 trước trên trang SP. Giá trị cấp 1 phải trả lời câu *“đây là cái gì?”* bằng tiếng Việt thường dùng — **không** dùng mã dòng / tên thương hiệu phụ mà KH chưa biết.

   | Sai (KH không hiểu) | Đúng |
   | --- | --- |
   | Uru Up | Bột collagen |
   | Xylitol | Kẹo cao su |
   | Premium Ghana | Chocolate |
   | Hohoemi / Step | Sữa bột Hohoemi / Sữa bột Step |
   | Attonon EX | Kem trị sẹo Attonon |
   | Savas Whey Protein 100 | *(ổn — đã có “Whey Protein”)* |

   Nhãn cấp điển hình vẫn là **Dòng → Loại → Quy cách**, nhưng **nội dung** cấp 1 phải là loại SP (+ tên dòng nếu cần để phân biệt), cấp 2 mới là biến thể trong loại (vị / dạng / dòng con), cấp 3 là size / số viên.

   Ví dụ Lotte:

   | Cấp 1 (Dòng) | Cấp 2 (Loại) | Cấp 3 (Quy cách) |
   | --- | --- | --- |
   | Bột collagen | Uru Up | 185g |
   | Kẹo cao su | Xylitol 7 vị trái cây | Hũ 133g |
   | Chocolate | Ghana Matcha Uji | 45g |
   | Chocolate | Premium Ghana Whip Vanilla | 56g |

3. **Phân loại bằng cấp thuộc tính (cha → con), không bằng nhiều nhóm**  
   Tối đa vài cấp (thường 2–3):
   - **Cấp 1 – Dòng**: *loại sản phẩm* KH hiểu (Bột collagen, Kẹo cao su, Kem đánh răng Shoyo…)
   - **Cấp 2 – Loại**: biến thể trong loại (vị, Gel/Cream, Người lớn/Trẻ em…)
   - **Cấp 3 – Quy cách**: size / số viên / dung tích (95g / 100g; 420 / 840 viên)

4. **Cây phân nhánh trên trang nhóm phải đọc được**  
   Khách chọn cấp 1 trước, rồi cấp 2 (chỉ các mức thuộc nhánh đã chọn), rồi cấp 3 nếu có — giống BCL AHA.

5. **Không nhét hãng khác nhau vào một nhóm**  
   Chỉ gộp sản phẩm cùng thương hiệu (hoặc cùng dòng chính thức của hãng). Anessa ≠ Kobayashi.

6. **Sản phẩm đơn lẻ thật sự** (không có anh/chị em cùng hãng trên catalogue) mới để độc lập — còn lại đưa vào nhóm hãng.

## Kiểm tra nhanh trước khi lưu

- [ ] Đọc to cấp 1: người lạ có biết đây là *cái gì* không? (không phải chỉ biết tên dòng nội địa Nhật)
- [ ] Cùng một loại SP (vd Chocolate) dùng cùng một giá trị cấp 1; phân biệt bằng cấp 2
- [ ] Thanh/Lon/Tuổi… không đặt ở cấp 1 nếu làm lệch sang nhóm SP khác (vd sữa bột mẹ-và-bé vs protein)
- [ ] Cây phân nhánh admin không còn nhánh “(chưa điền)” thừa

## Việc cần làm khi “rà nhóm / gom biến thể”

1. Tìm mọi SP cùng hãng (tên / SKU / tag).
2. Nếu đã có nhiều nhóm nhỏ cùng hãng → **gộp vào một nhóm**, đặt tên chung = tên hãng (vd `Kobayashi`), mã nhóm vd `KOBAYASHI`.
3. Đặt thuộc tính cấp 1–3 theo §2–3; điền giá trị từng SP; kiểm tra “Cây phân nhánh”.
4. Xoá các nhóm cũ đã trống sau khi chuyển hết thành viên.

## Ví dụ cấu trúc (Kobayashi)

| Cấp 1 (Dòng) | Cấp 2 (Loại) | Cấp 3 (Quy cách) |
| --- | --- | --- |
| Kem đánh răng Shoyo | Không hạt mài (xanh) | 95g |
| Kem đánh răng Shoyo | Chăm sóc ê buốt (hồng) | 100g |
| Kem trị sẹo Attonon | Gel EX | 15g |
| Kem trị sẹo Attonon | Kem (Cream) EX | 15g |
| Miếng hạ sốt Netsusama | Người lớn | 16 miếng |
| Miếng hạ sốt Netsusama | Trẻ em | 16 miếng |
| Viên Inochi no Haha A | Tiền mãn kinh | 420 viên / 840 viên |

## Liên quan

- Admin UI: `/admin/products/groups/`
- CLI: nhóm biến thể chưa ghi qua Admin API v1 (`groupId` chỉ đọc) — thao tác gộp/sửa cấp vẫn qua admin web cho đến khi API hỗ trợ ghi.
- Audit script: `node tools/audit-variant-groups.mjs` → `/tmp/variant-groups-audit.json`
