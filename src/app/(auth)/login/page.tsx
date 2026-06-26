"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

const initialState: { error: string | null } = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
      {/* Logo */}
      <div className="mb-7 flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-gold bg-brand shadow-lg">
          <span className="text-2xl font-extrabold tracking-tighter text-gold">QQ</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">QQ Hotpot BBQ</h1>
          <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest">Restaurant Management</p>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Username</label>
          <input
            name="username"
            autoComplete="username"
            autoFocus
            className="input"
            placeholder="Enter your username"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Password</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <p className="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-brand w-full py-3 text-base"
        >
          {pending ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <details className="mt-5 text-xs text-gray-400">
        <summary className="cursor-pointer select-none hover:text-gray-600 transition-colors">
          Demo accounts
        </summary>
        <ul className="mt-2 space-y-1 rounded-xl bg-gray-50 p-3">
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
