"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/actions";

const initialState: LoginState = { error: null };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label htmlFor="password" className="text-sm font-semibold">
        Clave de administración
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="w-full rounded-full border border-border-soft bg-black/30 px-6 py-4 text-base text-white outline-none backdrop-blur-md focus-visible:border-theme-red"
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full border border-theme-red bg-theme-red/20 px-6 py-4 text-base font-semibold transition hover:bg-theme-red/40 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
