/**
 * Admin permission model (lib/permissions.ts):  npm run test:permissions
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PERMISSIONS, assignableRoles, effectivePermissions, INVENTORY_SCREENS, PERMISSION_PRESETS, PERMISSION_TABS, sanitizePermissions } from "../../src/lib/permissions";

describe("effectivePermissions", () => {
  it("owner and admin get everything, money included", () => {
    for (const r of ["owner", "admin"] as const) {
      const p = effectivePermissions(r, []);
      assert.ok(p.includes("see_prices") && p.includes("see_cost") && p.includes("kho_vn") && p.includes("users"));
    }
  });
  it("a pre-2.25 staff account keeps what it had: inventory → every warehouse screen, orders → ⑦, money visible", () => {
    const p = effectivePermissions("staff", ["orders", "inventory"]);
    for (const k of [...INVENTORY_SCREENS, "delivery", "see_prices", "see_cost", "inventory", "orders"]) assert.ok(p.includes(k), k);
  });
  it("a new staff account gets exactly its ticks; any warehouse screen brings the shared inventory module", () => {
    const p = effectivePermissions("staff", ["orders", "kho_vn", "delivery"]);
    assert.deepEqual([...p].sort(), ["delivery", "inventory", "kho_vn", "orders"]);
    assert.ok(!p.includes("see_prices") && !p.includes("see_cost") && !p.includes("purchases"));
  });
  it("staff never gets the users screen; customers get nothing", () => {
    assert.ok(!effectivePermissions("staff", ["users", "orders"]).includes("users"));
    assert.deepEqual(effectivePermissions("customer", ["orders"]), []);
  });
});

describe("picker and roles", () => {
  it("every key in the tabs and presets is a real permission", () => {
    for (const t of PERMISSION_TABS) for (const k of t.keys) assert.ok(ALL_PERMISSIONS.includes(k), k);
    for (const p of PERMISSION_PRESETS) for (const k of p.keys) assert.ok(ALL_PERMISSIONS.includes(k), k);
  });
  it("the VN warehouse preset hides money", () => {
    const vn = PERMISSION_PRESETS.find((p) => p.key === "kho_vn")!;
    assert.deepEqual(vn.keys, ["orders", "kho_vn", "delivery"]);
  });
  it("the users screen creates only staff / admins", () => {
    assert.deepEqual(assignableRoles("owner"), ["staff", "admin"]);
    assert.deepEqual(assignableRoles("admin"), ["staff"]);
  });
  it("sanitizePermissions drops unknown keys", () => {
    assert.deepEqual(sanitizePermissions(["kho_vn", "nope", "see_cost"]), ["kho_vn", "see_cost"]);
  });
});
