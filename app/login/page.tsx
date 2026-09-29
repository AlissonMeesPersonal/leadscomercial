"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/ThemeToggle";

const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";

type LoginResponse = {
  accessToken?: string;
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

      router.push("/dashboard");
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

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

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
