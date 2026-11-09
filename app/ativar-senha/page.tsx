"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/ThemeToggle";

type ActivationResponse = {ok?:boolean;error?:string;accessToken?:string;role?:string};

export default function ActivatePasswordPage() {
  const router=useRouter();
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function activate(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response=await fetch("/api/activate-password",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({temporaryPassword,password,confirmation})
      });
      const result=await response.json() as ActivationResponse;
      if(!response.ok || !result.ok || !result.accessToken)
        throw new Error(result.error || "Não foi possível ativar sua senha.");
      sessionStorage.setItem("commercial-supabase-access",result.accessToken);
      router.replace(result.role==="coordinator"?"/dashboard/coordenacao":"/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error?e.message:"Falha ao cadastrar senha.");
    } finally {setBusy(false);}
  }
  return (
    <main className="login-shell">
      <div className="login-theme"><ThemeToggle compact /></div>
      <section className="login-card">
        <div className="brand-mark">LC</div>
        <p className="eyebrow">PRIMEIRO ACESSO</p>
        <h1>Crie sua senha</h1>
        <p className="muted">Sua senha provisória é válida somente para ativar a conta. Escolha uma senha pessoal para os próximos acessos.</p>
        <form className="login-form" onSubmit={activate}>
          <label>Senha provisória
            <input type={showPassword?"text":"password"} autoComplete="current-password"
              value={temporaryPassword} onChange={e=>setTemporaryPassword(e.target.value)} required />
          </label>
          <label>Nova senha
            <input type={showPassword?"text":"password"} minLength={12} maxLength={128}
              autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
          </label>
          <label>Confirmar nova senha
            <input type={showPassword?"text":"password"} minLength={12} maxLength={128}
              autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/>
          </label>
          <label className="activation-show-password">
            <input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/>
            Mostrar senhas
          </label>
          <p className="muted">Use pelo menos 12 caracteres, incluindo maiúsculas, minúsculas e números.</p>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="primary-btn" disabled={busy}>{busy?"Validando...":"Cadastrar minha senha"}</button>
        </form>
      </section>
    </main>
  );
}
