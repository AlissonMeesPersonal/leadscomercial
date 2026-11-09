"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/ThemeToggle";

const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";

type LoginResponse = {
  accessToken?: string;
  error?: string;
  role?: string;
  needsPasswordChange?: boolean;
};

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.accessToken) {
        throw new Error(data.error || "Falha no login.");
      }

      sessionStorage.setItem(
        COMMERCIAL_ACCESS_KEY,
        data.accessToken
      );

      router.push(data.needsPasswordChange ? "/ativar-senha" : data.role === "coordinator" ? "/dashboard/coordenacao" : "/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Falha no login."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-theme">
        <ThemeToggle compact />
      </div>

      <section className="login-card">
        <div className="brand-mark">LC</div>
        <p className="eyebrow">COMERCIAL</p>
        <h1>Leads Comercial</h1>
        <p className="muted">
          Acesse para importar, organizar e contatar futuros clientes.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Usuário
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label htmlFor="login-password">Senha</label>
          <div className="activation-password-field">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="activation-eye-button"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
            >
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M3 3l18 18" />}
              </svg>
            </button>
          </div>

          {errorMessage && (
            <div className="alert">{errorMessage}</div>
          )}

          <button className="primary-btn" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
