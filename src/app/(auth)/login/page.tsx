import { getT } from "@/lib/lang";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const t = await getT();

  return (
    <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
      <div className="mb-7 flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-gold bg-brand shadow-lg">
          <span className="text-2xl font-extrabold tracking-tighter text-gold">QQ</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">QQ Hotpot BBQ</h1>
          <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest">
            {t("app_subtitle")}
          </p>
        </div>
      </div>

      <LoginForm
        labels={{
          username:            t("label_username"),
          usernamePlaceholder: t("placeholder_username"),
          password:            t("label_password"),
          signIn:              t("btn_sign_in"),
          signingIn:           t("btn_signing_in"),
        }}
      />
    </div>
  );
}
