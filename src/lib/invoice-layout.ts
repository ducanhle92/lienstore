/**
 * Paper invoice (A5) pagination — pure, so it is unit-tested. Every page repeats the shop header; page 1 has the
 * customer block; item rows flow over as many pages as needed (the table head repeats); the totals and then the
 * payment block (QR + bank) go where they still fit, else onto the next page — the payment block always sits at the
 * bottom of the last page. Heights are millimetres measured on the printed sheet (Roboto 10 pt).
 */
export const A5 = { height: 210, padTop: 9, padBottom: 8 };
export const BLOCK = {
  header: 30,
  continuation: 7,
  customer: 28,
  addressLine: 4.5,
  tableHead: 11,
  rowPad: 3.8,
  rowLine: 4.85,
  totalsBase: 20,
  totalsLine: 5,
  payment: 36,
  /** "còn tiếp trang sau" under the rows + "Trang 1/n" at the bottom of a page that continues. */
  pageFoot: 10,
};
/** Characters of a product name per line in the name column (~60 mm at 10 pt). */
export const NAME_CHARS_PER_LINE = 33;
/** Characters of the address per line in the customer block. */
export const ADDRESS_CHARS_PER_LINE = 52;

export interface InvoicePage {
  /** Indexes into the order's items shown on this page (empty on a totals / payment-only page). */
  rows: number[];
  totals: boolean;
  payment: boolean;
}

export const rowHeight = (name: string) => BLOCK.rowPad + Math.max(1, Math.ceil(name.trim().length / NAME_CHARS_PER_LINE)) * BLOCK.rowLine;

export function paginateInvoice(items: Array<{ name: string }>, opts: { address?: string; totalsLines?: number } = {}): InvoicePage[] {
  const usable = A5.height - A5.padTop - A5.padBottom;
  const addressLines = Math.max(1, Math.ceil((opts.address ?? "").length / ADDRESS_CHARS_PER_LINE));
  const customer = BLOCK.customer + (addressLines - 1) * BLOCK.addressLine;
  const totals = BLOCK.totalsBase + (opts.totalsLines ?? 2) * BLOCK.totalsLine;
  const pages: InvoicePage[] = [];
  let page: InvoicePage = { rows: [], totals: false, payment: false };
  let left = usable - BLOCK.header - customer - BLOCK.tableHead;
  const next = (withTableHead: boolean) => {
    pages.push(page);
    page = { rows: [], totals: false, payment: false };
    left = usable - BLOCK.header - BLOCK.continuation - (withTableHead ? BLOCK.tableHead : 0);
  };
  items.forEach((it, i) => {
    const h = rowHeight(it.name);
    // a row taller than a whole page still goes on its own page (never loops)
    if (h > left - BLOCK.pageFoot && page.rows.length) next(true);
    page.rows.push(i);
    left -= h;
  });
  if (totals > left) next(false);
  page.totals = true;
  left -= totals;
  if (BLOCK.payment > left) next(false);
  page.payment = true;
  pages.push(page);
  return pages;
}
