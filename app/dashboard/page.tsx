"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import ThemeToggle from "../components/ThemeToggle";

type Status = "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
type Lead = {
  id: string;
  nome: string;
  whatsapp: string;
  email: string;
  origem: string;
  status: Status;
  criadoEm: string;
};

const statusList: Status[] = ["Novo", "Em contato", "Interessado", "Sem retorno", "Convertido"];

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";
const LEGACY_STORAGE_KEY = "leads-comercial";

type DbLead = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  source: string;
  status: Status;
  created_at: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsApp(value: string) {
  let digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}

function leadKey(lead: Pick<Lead, "whatsapp" | "email">) {
  return (normalizeWhatsApp(lead.whatsapp) || lead.email.toLowerCase().trim()).trim();
}

function dbToLead(row: DbLead): Lead {
  return {
    id: row.id,
    nome: row.name || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    origem: row.source || "Importação",
    status: row.status,
    criadoEm: row.created_at
  };
}

function toDbLead(lead: Lead) {
  return {
    name: lead.nome.trim(),
    whatsapp: lead.whatsapp.trim() || null,
    email: lead.email.trim() || null,
    source: lead.origem || "Importação",
    status: lead.status
  };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const access = sessionStorage.getItem(COMMERCIAL_ACCESS_KEY);

  if (!access) {
    throw new Error("Sua sessão de dados expirou. Entre novamente.");
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("x-client-info", access);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(SUPABASE_URL + path, {
    ...init,
    headers
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Leads Comercial] Supabase:", response.status, detail);
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Acesso ao banco recusado. Entre novamente no painel."
        : "Não foi possível salvar os leads no banco agora."
    );
  }

  return response;
}

function firstValue(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([k]) => k.toLowerCase().trim().includes(key));
    if (found && found[1] != null) return String(found[1]).trim();
  }
  return "";
}

function rowsToLeads(rows: Record<string, unknown>[], origem: string): Lead[] {
  return rows.map((row) => ({
    id: crypto.randomUUID(),
    nome: firstValue(row, ["nome", "name", "cliente", "lead", "contato"]),
    whatsapp: firstValue(row, ["whatsapp", "telefone", "celular", "phone", "fone"]),
    email: firstValue(row, ["email", "e-mail", "mail"]),
    origem,
    status: "Novo",
    criadoEm: new Date().toISOString()
  })).filter((lead) => lead.nome || lead.whatsapp || lead.email);
}

function textToLeads(text: string, origem: string): Lead[] {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRegex = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/g;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const leads: Lead[] = [];

  for (const line of lines) {
    const emails = line.match(emailRegex) || [];
    const phones = line.match(phoneRegex) || [];
    if (!emails.length && !phones.length) continue;

    let nome = line;
    [...emails, ...phones].forEach((part) => { nome = nome.replace(part, " "); });
    nome = nome.replace(/[|;,\t]+/g, " ").replace(/\s+/g, " ").trim();

    leads.push({
      id: crypto.randomUUID(),
      nome,
      whatsapp: phones[0] || "",
      email: emails[0] || "",
      origem,
      status: "Novo",
      criadoEm: new Date().toISOString()
    });
  }
  return leads;
}

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLeads() {
      if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
        location.href = "/login";
        return;
      }

      try {
        const response = await supabaseRequest(
          "/rest/v1/commercial_leads?select=id,name,whatsapp,email,source,status,created_at&order=created_at.desc"
        );
        const rows = (await response.json()) as DbLead[];
        let remote = rows.map(dbToLead);

        // Migra uma única vez os leads que ainda estavam salvos neste navegador.
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);

        if (legacy) {
          try {
            const parsed = JSON.parse(legacy) as Lead[];
            const localLeads = Array.isArray(parsed) ? parsed : [];
            const seen = new Set(remote.map(leadKey).filter(Boolean));

            const missing = localLeads.filter((lead) => {
              const key = leadKey(lead);
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            if (missing.length) {
              const migrated = await supabaseRequest(
                "/rest/v1/commercial_leads?select=id,name,whatsapp,email,source,status,created_at",
                {
                  method: "POST",
                  headers: { Prefer: "return=representation" },
                  body: JSON.stringify(missing.map(toDbLead))
                }
              );
              const savedRows = (await migrated.json()) as DbLead[];
              remote = [...savedRows.map(dbToLead), ...remote];
            }

            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch (migrationError) {
            console.error("[Leads Comercial] Migração local:", migrationError);
          }
        }

        if (!cancelled) {
          setLeads(remote);
          setNotice("");
        }
      } catch (err) {
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : "Não foi possível carregar os leads.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    loadLeads();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((lead) => {
      const matches = [lead.nome, lead.whatsapp, lead.email, lead.origem].join(" ").toLowerCase().includes(q);
      const statusOk = statusFilter === "Todos" || lead.status === statusFilter;
      return matches && statusOk;
    });
  }, [leads, query, statusFilter]);

  async function addImported(items: Lead[]) {
    const seen = new Set(leads.map(leadKey).filter(Boolean));
    const fresh = items.filter((lead) => {
      const key = leadKey(lead);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!fresh.length) {
      setNotice("Nenhum lead novo foi encontrado.");
      return;
    }

    const response = await supabaseRequest(
      "/rest/v1/commercial_leads?select=id,name,whatsapp,email,source,status,created_at",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(fresh.map(toDbLead))
      }
    );

    const savedRows = (await response.json()) as DbLead[];
    const saved = savedRows.map(dbToLead);

    setLeads((current) => [...saved, ...current]);
    setNotice(`${saved.length} lead(s) importado(s) e salvos no Supabase.`);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setNotice("");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let imported: Lead[] = [];

      if (["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext || "")) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
          imported.push(...rowsToLeads(rows, `${file.name} • ${sheetName}`));
        }
      } else if (ext === "json") {
        const parsed = JSON.parse(await file.text());
        const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.leads) ? parsed.leads : [parsed];
        imported = rowsToLeads(rows, file.name);
      } else if (ext === "docx") {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        imported = textToLeads(result.value, file.name);
      } else if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        let text = "";
        for (let page = 1; page <= pdf.numPages; page++) {
          const p = await pdf.getPage(page);
          const content = await p.getTextContent();
          for (const item of content.items as any[]) {
            text += (item.str || "") + (item.hasEOL ? "\n" : " ");
          }
          text += "\n";
        }
        imported = textToLeads(text, file.name);
      } else if (ext === "txt") {
        imported = textToLeads(await file.text(), file.name);
      } else {
        throw new Error("Formato ainda não suportado. Use planilhas, CSV/TSV, PDF, DOCX, TXT ou JSON.");
      }

      await addImported(imported);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível importar o arquivo.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function updateStatus(id: string, status: Status) {
    try {
      const response = await supabaseRequest(
        `/rest/v1/commercial_leads?id=eq.${encodeURIComponent(id)}&select=id,name,whatsapp,email,source,status,created_at`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status })
        }
      );

      const rows = (await response.json()) as DbLead[];
      if (!rows.length) throw new Error("Lead não encontrado no banco.");

      const saved = dbToLead(rows[0]);
      setLeads((current) =>
        current.map((lead) => (lead.id === id ? saved : lead))
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível atualizar o status.");
    }
  }

  async function removeLead(id: string) {
    try {
      await supabaseRequest(
        `/rest/v1/commercial_leads?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      setLeads((current) => current.filter((lead) => lead.id !== id));
      setNotice("Lead excluído do Supabase.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível excluir o lead.");
    }
  }

  async function startScale(lead: Lead) {
    const full = normalizeWhatsApp(lead.whatsapp);
    const phone = full.startsWith("55") ? full.slice(2) : full;
    const payload = { nome: lead.nome, ddi: "55", phone };

    try {
      await navigator.clipboard.writeText(
        `Nome: ${lead.nome}\nDDI: +55\nTelefone: ${phone}`
      );
    } catch {}

    void updateStatus(lead.id, "Em contato");
    setNotice(`Procurando uma aba do Scale para ${lead.nome}…`);

    let answered = false;

    const handleConnectorResponse = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.source !== "leads-scale-connector" ||
        event.data?.type !== "SCALE_DISPATCHED"
      ) {
        return;
      }

      answered = true;
      window.removeEventListener("message", handleConnectorResponse);

      if (event.data?.ok === false) {
        setNotice(
          `O conector não conseguiu acessar o Scale. Abra o Scale e tente novamente.`
        );
        return;
      }

      if (event.data?.mode === "existing") {
        setNotice(
          event.data?.modalOpen
            ? `Scale encontrado. Preenchendo o modal Nova Conversa de ${lead.nome}…`
            : `Scale encontrado. Se o modal Nova Conversa estiver aberto, ele será preenchido automaticamente.`
        );
        return;
      }

      setNotice(
        `Nenhuma aba do Scale estava aberta. O Scale foi aberto para ${lead.nome}.`
      );
    };

    window.addEventListener("message", handleConnectorResponse);

    window.postMessage(
      {
        source: "leads-comercial",
        type: "START_SCALE_LEAD",
        payload
      },
      window.location.origin
    );

    // Fallback para quando a extensão não estiver instalada/ativa.
    setTimeout(() => {
      if (answered) return;

      window.removeEventListener("message", handleConnectorResponse);
      window.open(
        "https://scale.26fit.com.br/d/at-unidades",
        "_blank",
        "noopener,noreferrer"
      );
      setNotice(
        `O conector não respondeu. Abri o Scale e deixei os dados de ${lead.nome} copiados para você.`
      );
    }, 1800);
  }

  async function logout() {
    sessionStorage.removeItem(COMMERCIAL_ACCESS_KEY);
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  const converted = leads.filter((l) => l.status === "Convertido").length;

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PAINEL COMERCIAL</p>
          <h1>Leads Comercial</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pdf,.docx,.txt,.json" onChange={handleFile} hidden />
          <button className="primary-btn small" onClick={() => inputRef.current?.click()} disabled={processing || !loaded}>
            {processing ? "Importando..." : "+ Importar leads"}
          </button>
          <button className="ghost-btn" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="metrics">
        <article><span>Total de leads</span><strong>{leads.length}</strong></article>
        <article><span>Novos</span><strong>{leads.filter((l) => l.status === "Novo").length}</strong></article>
        <article><span>Em contato</span><strong>{leads.filter((l) => l.status === "Em contato").length}</strong></article>
        <article><span>Convertidos</span><strong>{converted}</strong></article>
      </section>

      <section className="import-box">
        <div>
          <strong>Importe sua base de contatos</strong>
          <p>Planilhas, CSV/TSV, PDF, DOCX, TXT e JSON. O sistema identifica nome, WhatsApp e e-mail quando presentes.</p>
        </div>
        <button className="secondary-btn" onClick={() => inputRef.current?.click()} disabled={processing}>Selecionar arquivo</button>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="leads-card">
        <div className="filters">
          <input placeholder="Buscar por nome, telefone, e-mail ou origem..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Todos</option>
            {statusList.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Lead</th><th>WhatsApp</th><th>E-mail</th><th>Origem</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const wa = normalizeWhatsApp(lead.whatsapp);
                const text = encodeURIComponent(`Olá, ${lead.nome || "tudo bem"}! Sou do setor comercial e estou entrando em contato para te passar mais informações.`);
                return (
                  <tr key={lead.id}>
                    <td><strong>{lead.nome || "Sem nome"}</strong><small>{new Date(lead.criadoEm).toLocaleDateString("pt-BR")}</small></td>
                    <td>{lead.whatsapp || "—"}</td>
                    <td>{lead.email || "—"}</td>
                    <td className="origin">{lead.origem}</td>
                    <td>
                      <select className="status-select" value={lead.status} onChange={(e) => void updateStatus(lead.id, e.target.value as Status)}>
                        {statusList.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        {wa && <button className="scale-btn" onClick={() => startScale(lead)}>Iniciar no Scale</button>}
                        {wa && <a className="wa-btn" href={`https://wa.me/${wa}?text=${text}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                        {lead.email && <a className="mail-btn" href={`mailto:${lead.email}`}>E-mail</a>}
                        <button className="delete-btn" onClick={() => void removeLead(lead.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={6} className="empty">Nenhum lead encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">Os leads estão salvos no Supabase e permanecem disponíveis mesmo ao trocar de navegador ou computador.</p>
    </main>
  );
}
