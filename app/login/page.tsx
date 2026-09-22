"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/ThemeToggle";

const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";
const COMMERCIAL_ACCESS_SALT = "lc-supa-2026-7f4d2a9bc18e6d53";
const COMMERCIAL_ACCESS_ITERATIONS = 310000;

async function deriveCommercialAccess(username: string, password: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${username}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(COMMERCIAL_ACCESS_SALT),
      iterations: COMMERCIAL_ACCESS_ITERATIONS
    },
    material,
    256
  );

  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no login.");

      const storageAccess = await deriveCommercialAccess(username.trim(), password);
      sessionStorage.setItem(COMMERCIAL_ACCESS_KEY, storageAccess);

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setLoading(false);
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
        <p className="muted">Acesse para importar, organizar e contatar futuros clientes.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Usuário
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="alert">{error}</div>}
          <button className="primary-btn" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
