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
  const [visibleFields,setVisibleFields]=useState({temporary:false,password:false,confirmation:false});
  const toggleField=(field:keyof typeof visibleFields)=>setVisibleFields(current=>({...current,[field]:!current[field]}));
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
          <label htmlFor="temporary-password">Senha provisória</label>
          <div className="activation-password-field">
            <input id="temporary-password" type={visibleFields.temporary?"text":"password"}
              autoComplete="current-password" value={temporaryPassword}
              onChange={e=>setTemporaryPassword(e.target.value)} required />
            <button type="button" className="activation-eye-button"
              aria-label={visibleFields.temporary?"Ocultar senha provisória":"Mostrar senha provisória"}
              aria-pressed={visibleFields.temporary} onClick={()=>toggleField("temporary")}>
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/>
                <circle cx="12" cy="12" r="3"/>
                {visibleFields.temporary && <path d="M3 3l18 18"/>}
              </svg>
            </button>
          </div>
          <label htmlFor="new-password">Nova senha</label>
          <div className="activation-password-field">
            <input id="new-password" type={visibleFields.password?"text":"password"}
              minLength={8} maxLength={8} autoComplete="new-password" value={password}
              onChange={e=>setPassword(e.target.value)} required />
            <button type="button" className="activation-eye-button"
              aria-label={visibleFields.password?"Ocultar nova senha":"Mostrar nova senha"}
              aria-pressed={visibleFields.password} onClick={()=>toggleField("password")}>
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/>
                <circle cx="12" cy="12" r="3"/>
                {visibleFields.password && <path d="M3 3l18 18"/>}
              </svg>
            </button>
          </div>
          <label htmlFor="confirm-password">Confirmar nova senha</label>
          <div className="activation-password-field">
            <input id="confirm-password" type={visibleFields.confirmation?"text":"password"}
              minLength={8} maxLength={8} autoComplete="new-password" value={confirmation}
              onChange={e=>setConfirmation(e.target.value)} required />
            <button type="button" className="activation-eye-button"
              aria-label={visibleFields.confirmation?"Ocultar confirmação":"Mostrar confirmação"}
              aria-pressed={visibleFields.confirmation} onClick={()=>toggleField("confirmation")}>
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/>
                <circle cx="12" cy="12" r="3"/>
                {visibleFields.confirmation && <path d="M3 3l18 18"/>}
              </svg>
            </button>
          </div>
          <p className="muted">A senha pessoal deve ter 8 caracteres, incluindo letras maiúsculas, minúsculas e números.</p>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="primary-btn" disabled={busy}>{busy?"Validando...":"Cadastrar minha senha"}</button>
        </form>
      </section>
    </main>
  );
}
