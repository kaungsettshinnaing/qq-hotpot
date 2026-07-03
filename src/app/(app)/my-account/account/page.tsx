import { redirect } from "next/navigation";
import { requireSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setSetting, MASTER_PW_KEY } from "@/lib/settings";
import SubmitButton from "@/components/SubmitButton";
import { getT, getLang } from "@/lib/lang";
import { cookies } from "next/headers";

async function setLang(fd: FormData) {
  "use server";
  const next = fd.get("lang") as string;
  const c = await cookies();
  c.set("lang", next, { path: "/", maxAge: 31536000, sameSite: "lax" });
  redirect("/my-account/account");
}

async function changePassword(fd: FormData) {
  "use server";
  const session = await requireSession();
  const current = (fd.get("current") as string).trim();
  const next = (fd.get("next") as string).trim();
  const confirm = (fd.get("confirm") as string).trim();

  if (!current || !next || !confirm) redirect("/my-account/account?error=missing");
  if (next !== confirm) redirect("/my-account/account?error=mismatch");
  if (next.length < 6) redirect("/my-account/account?error=short");

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) redirect("/my-account/account?error=missing");
  if (!verifyPassword(current, user.passwordHash)) redirect("/my-account/account?error=wrong");

  await prisma.user.update({ where: { id: session.id }, data: { passwordHash: hashPassword(next) } });
  redirect("/my-account/account?success=1");
}

async function changeMasterPassword(fd: FormData) {
  "use server";
  const session = await requireSession();
  // Admin-only: the master password overrides every account, so only an admin
  // (confirming their own password) may rotate it.
  if (!session.roles.includes("ADMIN")) redirect("/my-account/account");
  const current = (fd.get("mCurrent") as string).trim();
  const next = (fd.get("mNext") as string).trim();
  const confirm = (fd.get("mConfirm") as string).trim();

  if (!current || !next || !confirm) redirect("/my-account/account?merror=missing");
  if (next !== confirm) redirect("/my-account/account?merror=mismatch");
  if (next.length < 6) redirect("/my-account/account?merror=short");

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) redirect("/my-account/account?merror=missing");
  if (!verifyPassword(current, user.passwordHash)) redirect("/my-account/account?merror=wrong");

  await setSetting(MASTER_PW_KEY, hashPassword(next));
  redirect("/my-account/account?msuccess=1");
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; merror?: string; msuccess?: string }>;
}) {
  const { error, success, merror, msuccess } = await searchParams;
  const session = await requireSession();
  const isAdmin = session.roles.includes("ADMIN");
  const t = await getT();
  const lang = await getLang();

  const ERROR_LABEL: Record<string, string> = {
    missing: t("error_all_fields_required"),
    mismatch: t("error_passwords_no_match"),
    short: t("error_password_too_short"),
    wrong: t("error_wrong_current_password"),
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">{t("heading_my_account")}</h1>

      <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{t("label_logged_in_as")}</div>
          <div className="font-semibold text-gray-800">{session.name}</div>
          <div className="text-sm text-gray-500">@{session.username}</div>
        </div>

        <hr />

        <h2 className="text-sm font-semibold text-gray-700">{t("heading_change_password")}</h2>

        {success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("success_password_updated")}</p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_LABEL[error] ?? t("error_something_went_wrong")}</p>
        )}

        <form action={changePassword} className="space-y-3 text-sm">
          <div>
            <label className="label">{t("label_current_password")}</label>
            <input name="current" type="password" required className="input" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">{t("label_new_password")}</label>
            <input name="next" type="password" required minLength={6} className="input" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">{t("label_confirm_new_password")}</label>
            <input name="confirm" type="password" required className="input" autoComplete="new-password" />
          </div>
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_update_password")}
          </SubmitButton>
        </form>
      </div>

      {isAdmin && (
        <div className="rounded-xl border-2 border-amber-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-amber-700">Master login password</h2>
            <p className="mt-1 text-xs text-gray-500">
              A single override password that signs into <strong>any active account</strong> alongside each
              user&apos;s own password. Every use is flagged to admins in the notification bell. Keep it secret
              and rotate it after sharing.
            </p>
          </div>

          {msuccess && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Master password updated.</p>
          )}
          {merror && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_LABEL[merror] ?? t("error_something_went_wrong")}</p>
          )}

          <form action={changeMasterPassword} className="space-y-3 text-sm">
            <div>
              <label className="label">Your current password</label>
              <input name="mCurrent" type="password" required className="input" autoComplete="current-password" />
            </div>
            <div>
              <label className="label">New master password</label>
              <input name="mNext" type="password" required minLength={6} className="input" autoComplete="new-password" />
            </div>
            <div>
              <label className="label">Confirm new master password</label>
              <input name="mConfirm" type="password" required className="input" autoComplete="new-password" />
            </div>
            <SubmitButton className="w-full rounded-lg bg-amber-600 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              Update master password
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("heading_language")}</h2>
        <div className="flex gap-2">
          <form action={setLang}>
            <input type="hidden" name="lang" value="en" />
            <button type="submit"
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${lang === "en" ? "bg-brand text-white border-brand" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              English
            </button>
          </form>
          <form action={setLang}>
            <input type="hidden" name="lang" value="my" />
            <button type="submit"
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${lang === "my" ? "bg-brand text-white border-brand" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              မြန်မာ
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
