import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { landingFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireSession();
  const dest = landingFor(user.roles);
  if (dest && dest !== "/") redirect(dest);

  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-8 text-center shadow">
      <div className="text-4xl">👋</div>
      <h1 className="mt-2 text-lg font-semibold">Welcome, {user.name}</h1>
      <p className="mt-2 text-sm text-gray-600">
        No modules are assigned to your account yet. Please contact an
        administrator to get access.
      </p>
    </div>
  );
}
