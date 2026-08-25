"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action}>
      <label htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="manager@mariposa.kz"
          required
          disabled={pending}
        />
      </label>
      <label htmlFor="password">
        Пароль
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          disabled={pending}
        />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="primary login-button" type="submit" disabled={pending}>
        {pending ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
