import { redirect } from "next/navigation";
import { requireSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import LangToggle from "@/components/LangToggle";
import { getT, getLang } from "@/lib/lang";

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

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const session = await requireSession();
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

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("heading_language")}</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{lang === "en" ? "English" : "မြန်မာ"}</span>
          <LangToggle lang={lang} />
        </div>
      </div>
    </div>
  );
}
