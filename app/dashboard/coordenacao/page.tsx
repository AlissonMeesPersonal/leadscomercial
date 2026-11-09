"use client";

import { useCallback, useEffect, useState } from "react";
import ThemeToggle from "../../components/ThemeToggle";

type Totals = {
  attempts:number;unique:number;opportunities:number;newCount:number;inContact:number;
  interested:number;noReturn:number;converted:number;conversion:number;
  inactive:number;reactivated:number;delinquent:number;
};
type Staff = {
  id:string;name:string;attempts:number;unique:number;opportunities:number;
  newCount:number;inContact:number;interested:number;noReturn:number;
  converted:number;conversion:number;
};
type Report = {
  totals:Totals;users:Staff[];
  choices:{users:{id:string;name:string}[];units:{id:string;name:string}[]};
  explanation:string;
};
const n = (value:number) => value.toLocaleString("pt-BR");

export default function CoordinatorDashboard() {
  const [report,setReport] = useState<Report|null>(null);
  const [owner,setOwner] = useState("");
  const [unit,setUnit] = useState("");
  const [from,setFrom] = useState("");
  const [to,setTo] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (owner) params.set("owner",owner);
      if (unit) params.set("unit",unit);
      if (from) params.set("from",from);
      if (to) params.set("to",to);
      const response = await fetch("/api/coordinator/report?"+params.toString(),{cache:"no-store"});
      const data = await response.json() as Report & {error?:string};
      if (!response.ok) throw new Error(data.error || "Falha na consulta gerencial.");
      setReport(data);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar relatório."); }
    finally { setLoading(false); }
  }, [owner,unit,from,to]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function logout() {
    await fetch("/api/logout",{method:"POST"});
    sessionStorage.removeItem("commercial-supabase-access");
    location.href = "/login";
  }
  const t = report?.totals;
  return <main className="dashboard-shell coordinator-only">
    <header className="topbar">
      <div>
        <p className="eyebrow">GESTÃO DO COMERCIAL</p>
        <h1>Coordenação Comercial</h1>
        <p className="session-line">Visão de todas as unidades · indicadores somente leitura</p>
      </div>
      <div className="topbar-actions"><ThemeToggle /><a href="/dashboard" className="ghost-btn">Operação comercial</a><button type="button" className="ghost-btn" onClick={logout}>Sair</button></div>
    </header>
    <section className="file-manager-page coordinator-page">
      <div className="file-manager-title">
        <div><h2>Resultados e produtividade</h2>
          <p>Atendimentos iniciados no Scale e situação atual das carteiras.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={()=>{setLoading(true);void refresh();}}>Atualizar</button>
      </div>
      <div className="coordinator-filters">
        <label><span>Colaborador</span><select value={owner} onChange={e=>setOwner(e.target.value)}>
          <option value="">Todos os colaboradores</option>
          {(report?.choices.users||[]).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}
        </select></label>
        <label><span>Unidade</span><select value={unit} onChange={e=>setUnit(e.target.value)}>
          <option value="">Todas as unidades</option>
          {(report?.choices.units||[]).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}
        </select></label>
        <label><span>Inícios de</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label><span>Inícios até</span><input type="date" min={from||undefined} value={to} onChange={e=>setTo(e.target.value)}/></label>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {loading && <p className="session-line">Atualizando indicadores...</p>}
      {t && <div className="coordinator-summary">
        {([
          ["Inícios no Scale",n(t.attempts),"Tentativas registradas no período"],
          ["Contatos únicos",n(t.unique),"Pessoas distintas trabalhadas"],
          ["Oportunidades",n(t.opportunities),"Carteira atual"],
          ["Em contato",n(t.inContact),"Status atual"],
          ["Interessados",n(t.interested),"Status atual"],
          ["Convertidos",n(t.converted),"Status atual"],
          ["Taxa de conversão",t.conversion.toFixed(1)+"%","Convertidos ÷ carteira"],
          ["Sem retorno",n(t.noReturn),"Status atual"],
          ["Novos",n(t.newCount),"Status atual"],
          ["Inativos",n(t.inactive),"Carteira atual"],
          ["Reativados",n(t.reactivated),"Status atual"],
          ["Inadimplentes",n(t.delinquent),"Carteira atual"]
        ] as const).map(([label,value,sub])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}
      </div>}
      <section className="coordinator-staff">
        <h3>Desempenho por colaborador</h3>
        <div className="table-wrap">
          <table className="demand-table coordinator-table"><thead><tr>
            <th>Colaborador</th><th>Inícios</th><th>Contatos únicos</th><th>Oportunidades</th>
            <th>Novos</th><th>Em contato</th><th>Interessados</th><th>Sem retorno</th>
            <th>Convertidos</th><th>Conversão</th>
          </tr></thead><tbody>
            {(report?.users||[]).map(u=><tr key={u.id}>
              <td><strong>{u.name}</strong></td><td>{n(u.attempts)}</td><td>{n(u.unique)}</td>
              <td>{n(u.opportunities)}</td><td>{n(u.newCount)}</td><td>{n(u.inContact)}</td>
              <td>{n(u.interested)}</td><td>{n(u.noReturn)}</td><td>{n(u.converted)}</td>
              <td>{u.conversion.toFixed(1)}%</td>
            </tr>)}
            {report && !report.users.length && <tr><td colSpan={10}>Nenhum colaborador encontrado.</td></tr>}
          </tbody></table>
        </div>
      </section>
      <p className="coordinator-disclaimer">{report?.explanation || "Abertura no Scale não significa mensagem enviada."}</p>
    </section>
  </main>;
}
