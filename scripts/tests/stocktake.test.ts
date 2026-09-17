/** Stocktake CSV round-trip — pure unit tests:  npm run test:stocktake */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStocktakeCsv } from "../../src/lib/stocktake-csv";

const header = '"ID","SKU","Tên sản phẩm","Số lượng tồn","Kiểm đếm thực tế","Ghi chú"';

describe("parseStocktakeCsv", () => {
  it("reads only the rows that were counted, by ID", () => {
    const csv = [header, '"1","A","Sp một","3","5",""', '"2","B","Sp hai","0","",""', '"3","C","Sp ba","","0","hết"'].join("\r\n");
    assert.deepEqual(parseStocktakeCsv(`﻿${csv}`), { rows: [{ id: 1, count: 5, warehouse: null }, { id: 3, count: 0, warehouse: null }], skipped: 1, errors: [] });
  });
  it("accepts Excel-formatted numbers and reports bad rows without dropping the good ones", () => {
    const csv = [header, '"1","","","","1.200",""', '"x","","","","4",""', '"2","","","","-1",""'].join("\n");
    const r = parseStocktakeCsv(csv);
    assert.deepEqual(r.rows, [{ id: 1, count: 1200, warehouse: null }]);
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0], /Dòng 3/);
    assert.match(r.errors[1], /Dòng 4 \(#2\)/);
  });
  it("rejects a file without the ID / count columns", () => {
    assert.match(parseStocktakeCsv('"Tên","Số"\n"a","1"').errors[0], /Thiếu cột/);
    assert.match(parseStocktakeCsv("").errors[0], /File trống/);
  });
});
