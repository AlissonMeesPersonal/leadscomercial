"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

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

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsApp(value: string) {
  let digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
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
    const saved = localStorage.getItem("leads-comercial");
    if (saved) {
      try { setLeads(JSON.parse(saved)); } catch {}
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("leads-comercial", JSON.stringify(leads));
  }, [leads, loaded]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((lead) => {
      const matches = [lead.nome, lead.whatsapp, lead.email, lead.origem].join(" ").toLowerCase().includes(q);
      const statusOk = statusFilter === "Todos" || lead.status === statusFilter;
      return matches && statusOk;
    });
  }, [leads, query, statusFilter]);

  function addImported(items: Lead[]) {
    let added = 0;
    setLeads((current) => {
      const seen = new Set(current.map((l) => (normalizeWhatsApp(l.whatsapp) || l.email.toLowerCase()).trim()).filter(Boolean));
      const fresh = items.filter((l) => {
        const key = (normalizeWhatsApp(l.whatsapp) || l.email.toLowerCase()).trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        added++;
        return true;
      });
      return [...fresh, ...current];
    });
    setNotice(added ? `${added} lead(s) importado(s) com sucesso.` : "Nenhum lead novo foi encontrado.");
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

      addImported(imported);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível importar o arquivo.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateStatus(id: string, status: Status) {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, status } : lead));
  }

  function removeLead(id: string) {
    setLeads((current) => current.filter((lead) => lead.id !== id));
  }

  async function logout() {
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
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pdf,.docx,.txt,.json" onChange={handleFile} hidden />
          <button className="primary-btn small" onClick={() => inputRef.current?.click()} disabled={processing}>
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
                      <select className="status-select" value={lead.status} onChange={(e) => updateStatus(lead.id, e.target.value as Status)}>
                        {statusList.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        {wa && <a className="wa-btn" href={`https://wa.me/${wa}?text=${text}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                        {lead.email && <a className="mail-btn" href={`mailto:${lead.email}`}>E-mail</a>}
                        <button className="delete-btn" onClick={() => removeLead(lead.id)}>Excluir</button>
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

      <p className="footer-note">Os dados desta primeira versão ficam salvos neste navegador. Para vários usuários/equipe em tempo real, conectaremos o painel ao Supabase.</p>
    </main>
  );
}
