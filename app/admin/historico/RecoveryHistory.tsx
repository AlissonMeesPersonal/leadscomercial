"use client";

import { useEffect, useMemo, useState } from "react";

type ArchiveRow = {
  id: string; kind: "folder" | "user"; title: string;
  owner_user_id: string; owner_username: string;
  actor_user_id: string; actor_username: string;
  deleted_at: string; restored_at: string | null;
  status: "prepared" | "deleted" | "failed" | "restored";
  record_count: number;
};
type Tab = "folder" | "user";

export default function RecoveryHistory() {
  const [tab, setTab] = useState<Tab>("folder");
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [actor, setActor] = useState("");
  const [owner, setOwner] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch("/api/recovery", { cache: "no-store" });
      const json = await response.json() as ArchiveRow[] | { error?: string };
      if (!response.ok || !Array.isArray(json)) throw new Error(
        !Array.isArray(json) ? json.error || "Histórico indisponível." : "Histórico indisponível."
      );
      setRows(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  const actors = useMemo(() => [...new Set(rows.map(row => row.actor_username))].sort(), [rows]);
  const owners = useMemo(() => [...new Set(rows.map(row => row.owner_username))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    if (row.kind !== tab || (actor && row.actor_username !== actor) ||
        (owner && row.owner_username !== owner) || (status && row.status !== status)) return false;
    const day = row.deleted_at.slice(0, 10);
    if ((from && day < from) || (to && day > to)) return false;
    return !query || [row.title, row.actor_username, row.owner_username]
      .join(" ").toLowerCase().includes(query.toLowerCase());
  }), [rows, tab, actor, owner, status, from, to, query]);

  async function restore(record: ArchiveRow) {
    if (!window.confirm(
      `Restaurar "${record.title}"?\\n\\nO sistema tentará recuperar ${record.record_count} registro(s) do backup. Registros já existentes não serão substituídos.`
    )) return;
    setBusy(record.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/recovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: record.id })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Falha ao restaurar.");
      setMessage(`"${record.title}" restaurado com sucesso. Os dados já estão disponíveis no sistema.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao restaurar."); }
    finally { setBusy(null); }
  }
  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ACESSO EXCLUSIVO DO GESTOR ALISSON</p>
          <h1>Histórico e restauração</h1>
          <p className="session-line">Consulte quem excluiu, quando excluiu e recupere arquivos ou usuários arquivados.</p>
        </div>
        <div className="topbar-actions">
          <a className="ghost-btn" href="/admin">Administração</a>
          <a className="ghost-btn" href="/dashboard">Dashboard</a>
        </div>
      </header>

      <section className="demand-tabs recovery-tabs" aria-label="Tipo de exclusão">
        <button type="button" onClick={() => setTab("folder")}
          className={tab === "folder" ? "demand-tab files active" : "demand-tab files"}>
          <span>Pastas excluídas</span>
          <strong>{rows.filter(r => r.kind === "folder").length}</strong>
        </button>
        <button type="button" onClick={() => setTab("user")}
          className={tab === "user" ? "demand-tab files active" : "demand-tab files"}>
          <span>Usuários excluídos</span>
          <strong>{rows.filter(r => r.kind === "user").length}</strong>
        </button>
      </section>

      <section className="file-manager-page">
        <div className="file-manager-title">
          <div>
            <h2>{tab === "folder" ? "Histórico de pastas" : "Histórico de usuários"}</h2>
            <p>O histórico mostra exclusões registradas após a ativação da recuperação. Exclusões anteriores exigem backup do banco.</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => void reload()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="recovery-filters">
          <label>Quem excluiu
            <select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">Todos</option>{actors.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Usuário proprietário
            <select value={owner} onChange={e => setOwner(e.target.value)}>
              <option value="">Todos</option>{owners.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Data inicial
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label>Data final
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label>Situação
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todas</option>
              <option value="deleted">Excluído</option>
              <option value="restored">Restaurado</option>
              <option value="failed">Exclusão incompleta</option>
              <option value="prepared">Preparado</option>
            </select>
          </label>
          <label>Buscar
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome de pasta ou usuário" />
          </label>
        </div>

        {error && <p className="notice" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}
        <div className="file-manager-list">
          {filtered.map(record => (
            <article className="file-manager-item" key={record.id}>
              <div className="file-manager-info">
                <strong>{record.title}</strong>
                <span>{record.kind === "folder" ? `${record.record_count} registros` : "Conta de usuário"} · {record.status === "restored" ? "Restaurado" : record.status === "deleted" ? "Excluído" : record.status === "failed" ? "Exclusão incompleta" : "Backup preparado"}</span>
                <small>Proprietário: {record.owner_username} · Excluído por: {record.actor_username}</small>
                <small>Exclusão: {new Date(record.deleted_at).toLocaleString("pt-BR")}{record.restored_at ? ` · Recuperação: ${new Date(record.restored_at).toLocaleString("pt-BR")}` : ""}</small>
              </div>
              {(record.status === "deleted" || record.status === "failed") && (
                <button type="button" className="secondary-btn"
                  disabled={busy !== null} onClick={() => void restore(record)}>
                  {busy === record.id ? "Restaurando..." : "Restaurar"}
                </button>
              )}
            </article>
          ))}
          {!loading && !filtered.length && !error && (
            <p className="file-manager-empty">Nenhuma exclusão encontrada para estes filtros.</p>
          )}
        </div>
      </section>
    </main>
  );
}
