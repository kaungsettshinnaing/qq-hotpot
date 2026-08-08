import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { landingFor } from "@/lib/rbac";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireSession();
  const dest = landingFor(user.roles);
  if (dest && dest !== "/") redirect(dest);
  const t = await getT();

  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-8 text-center shadow">
      <div className="text-4xl">👋</div>
      <h1 className="mt-2 text-lg font-semibold">{t("heading_welcome", { name: user.name })}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {t("empty_no_modules_assigned")}
      </p>
    </div>
  );
}
