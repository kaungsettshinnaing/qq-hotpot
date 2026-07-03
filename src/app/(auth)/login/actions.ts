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
import { getMasterPasswordHash } from "@/lib/settings";
import { notifyAdmins } from "@/lib/notifications";
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
  // Deactivated accounts are never reachable — not even via the master password.
  if (!user || !user.isActive) {
    return { error: "Invalid username or password." };
  }

  let viaMaster = false;
  if (!verifyPassword(password, user.passwordHash)) {
    // Fall back to the master (override) password.
    const masterHash = await getMasterPasswordHash();
    if (!verifyPassword(password, masterHash)) {
      return { error: "Invalid username or password." };
    }
    viaMaster = true;
  }

  // The master password bypasses per-user identity, so every use is flagged to
  // admins — the audit trail otherwise attributes actions to the target account.
  if (viaMaster) {
    const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Yangon" });
    await notifyAdmins(
      "MASTER_LOGIN",
      `⚠️ Master password used to sign in as @${user.username} (${user.name}) at ${when}`,
    );
  }

  const roles = user.roles as Role[];
  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    name: user.name,
    roles,
  });

  const jar = await cookies();
  // Explicitly clear any existing session before setting the new one.
  // Without this, on some mobile browsers the old cookie can linger
  // and cause the previous user's server action to run on the shared device.
  jar.delete(SESSION_COOKIE);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(landingFor(roles) ?? "/");
}
