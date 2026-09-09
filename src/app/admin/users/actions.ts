"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { adminCreateUser, adminUpdateUser, countActiveAdmins, deleteCustomer, getCustomerById } from "@/lib/db";
import { isUserRole, sanitizePermissions, type UserRole } from "@/lib/permissions";

const LIST = "/admin/users/";

async function guard() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (!s.permissions.includes("users")) redirect("/admin/?denied=users");
  return s;
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

function readRole(fd: FormData): UserRole {
  const r = fd.get("role");
  return isUserRole(r) ? r : "customer";
}

function validate(email: string, username: string, password: string | null, role: UserRole): string | null {
  if (username && !/^[A-Za-z0-9._-]{3,32}$/.test(username)) return "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới (3–32 ký tự).";
  if (!email && !username) return role === "customer" ? "Khách hàng cần có email." : "Nhập tên đăng nhập (ID) hoặc email.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email không hợp lệ.";
  if (password !== null && password.length > 0 && password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  return null;
}

export async function createUserAction(formData: FormData): Promise<void> {
  await guard();
  const email = text(formData, "email").toLowerCase();
  const username = text(formData, "username");
  const password = text(formData, "password");
  const role = readRole(formData);
  const err = validate(email, username, password, role) ?? (password.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : null);
  if (err) back(LIST, "error", err);
  try {
    const u = await adminCreateUser({
      email,
      username,
      password,
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      phone: text(formData, "phone"),
      address: text(formData, "address"),
      role,
      permissions: sanitizePermissions(formData.getAll("permissions")),
      active: formData.get("active") !== "off",
    });
    revalidatePath("/admin", "layout");
    redirect(`${LIST}${u.id}/?saved=${encodeURIComponent("Đã tạo tài khoản " + (u.username || u.email))}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    back(LIST, "error", e instanceof Error ? e.message : "Không tạo được tài khoản.");
  }
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const me = await guard();
  const id = text(formData, "id");
  const url = `${LIST}${id}/`;
  const current = await getCustomerById(id);
  if (!current) back(LIST, "error", "Không tìm thấy tài khoản.");
  const email = text(formData, "email").toLowerCase();
  const username = text(formData, "username");
  const password = text(formData, "password");
  let role = readRole(formData);
  let active = formData.get("active") === "on";
  const err = validate(email, username, password || null, role);
  if (err) back(url, "error", err);
  // A signed-in admin cannot lock themselves out.
  if (me.id === id && (role !== "admin" || !active)) {
    role = "admin";
    active = true;
  }
  // Keep at least one active admin account in the database (the env account is a fallback, but be safe).
  if (current!.role === "admin" && current!.active && (role !== "admin" || !active) && (await countActiveAdmins()) <= 1) {
    back(url, "error", "Đây là quản trị viên hoạt động cuối cùng trong hệ thống; hãy tạo admin khác trước khi hạ quyền.");
  }
  try {
    await adminUpdateUser(id, {
      email,
      username,
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      phone: text(formData, "phone"),
      address: text(formData, "address"),
      role,
      permissions: sanitizePermissions(formData.getAll("permissions")),
      active,
      ...(password ? { password } : {}),
    });
  } catch (e) {
    back(url, "error", e instanceof Error ? e.message : "Không lưu được.");
  }
  revalidatePath("/admin", "layout");
  back(url, "saved", password ? "Đã lưu và đặt lại mật khẩu." : "Đã lưu thay đổi.");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const me = await guard();
  const id = text(formData, "id");
  if (id === me.id) back(`${LIST}${id}/`, "error", "Không thể xoá tài khoản đang đăng nhập.");
  const target = await getCustomerById(id);
  if (target?.role === "admin" && target.active && (await countActiveAdmins()) <= 1) {
    back(`${LIST}${id}/`, "error", "Không thể xoá quản trị viên hoạt động cuối cùng.");
  }
  await deleteCustomer(id);
  revalidatePath("/admin", "layout");
  back(LIST, "saved", `Đã xoá tài khoản ${target?.email ?? id}. Đơn hàng cũ của khách vẫn được giữ.`);
}
