"use server";

import { redirect } from "next/navigation";
import { endSession, startSession, verifyCredentials } from "@/lib/auth";

export type LoginState = { error: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = String(formData.get("user") ?? "");
  const password = String(formData.get("password") ?? "");
  const subject = await verifyCredentials(user, password);
  if (!subject) {
    return { error: "Sai tên đăng nhập / email hoặc mật khẩu, hoặc tài khoản không có quyền quản trị." };
  }
  await startSession(subject);
  redirect("/admin/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login/");
}
