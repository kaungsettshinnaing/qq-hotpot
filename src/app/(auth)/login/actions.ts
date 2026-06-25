"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { landingFor, type Role } from "@/lib/rbac";

interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password." };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid username or password." };
  }

  const roles = user.roles as Role[];
  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    name: user.name,
    roles,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(landingFor(roles) ?? "/");
}
