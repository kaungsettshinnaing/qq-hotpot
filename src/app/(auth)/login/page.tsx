"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

const initialState: { error: string | null } = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
      <div className="mb-6 text-center">
        <div className="text-3xl">🍲</div>
        <h1 className="mt-1 text-xl font-bold text-gray-900">QQ Hotpot BBQ</h1>
        <p className="text-sm text-gray-500">Restaurant Management — Sign in</p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
          <input
            name="username"
            autoComplete="username"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="e.g. cashier"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <details className="mt-5 text-xs text-gray-500">
        <summary className="cursor-pointer select-none">Demo accounts</summary>
        <ul className="mt-2 space-y-0.5">
          <li>admin / admin123 — Admin + Manager</li>
          <li>owner / owner123 — all operational roles</li>
          <li>waiter / waiter123 — Waiter</li>
          <li>kitchen / kitchen123 — Kitchen</li>
          <li>cashier / cashier123 — Cashier</li>
        </ul>
      </details>
    </div>
  );
}
