"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import ThemeToggle from "../components/ThemeToggle";

type Status = "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
type DemandType = "opportunity" | "delinquent";

type Lead = {
  id: string;
  nome: string;
  whatsapp: string;
  email: string;
  cidade: string;
  origem: string;
  status: Status;
  tipo: DemandType;
  ownerUserId: string | null;
  criadoEm: string;
};

type SessionInfo = {
  username: string;
  displayName: string;
  role: "admin" | "commercial" | "user";
  unitId: string | null;
  unitName: string | null;
};

type DbLead = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  source: string;
  status: Status;
  demand_type: DemandType;
  owner_user_id: string | null;
  created_at: string;
};

type OwnerUser = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "commercial" | "user";
};

const statusList: Status[] = ["Novo", "Em contato", "Interessado", "Sem retorno", "Convertido"];

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
const COMMERCIAL_ACCESS_KEY = "commercial-supabase-access";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsApp(value: string) {
  let digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}

function leadKey(
  lead: Pick<Lead, "whatsapp" | "email" | "nome" | "cidade">
) {
  const phone = normalizeWhatsApp(lead.whatsapp);
  if (phone) return `phone:${phone}`;

  const email = lead.email.toLowerCase().trim();
  if (email) return `email:${email}`;

  // Inadimplentes muitas vezes não possuem telefone/e-mail.
  // Nesse caso usamos nome + cidade para identificar o registro
  // dentro da carteira e do tipo de demanda.
  const name = normalizeHeader(lead.nome).replace(/\s+/g, " ");
  const city = normalizeHeader(lead.cidade).replace(/\s+/g, " ");

  if (name) return `name:${name}|city:${city || "sem-cidade"}`;

  return "";
}

function dbToLead(row: DbLead): Lead {
  return {
    id: row.id,
    nome: row.name || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    cidade: row.city || "",
    origem: row.source || "Importação",
    status: row.status,
    tipo: row.demand_type || "opportunity",
    ownerUserId: row.owner_user_id || null,
    criadoEm: row.created_at
  };
}

function toDbLead(lead: Lead) {
  return {
    name: lead.nome.trim(),
    whatsapp: lead.whatsapp.trim() || null,
    email: lead.email.trim() || null,
    city: (lead.cidade || "").trim() || null,
    source: lead.origem || "Importação",
    status: lead.status,
    demand_type: lead.tipo || "opportunity"
  };
}

function demandLabel(type: DemandType) {
  return type === "delinquent" ? "Inadimplente" : "Oportunidade";
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
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Leads Comercial] Supabase:", response.status, detail);
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Acesso ao banco recusado. Entre novamente no painel."
        : "Não foi possível salvar os dados no banco agora."
    );
  }

  return response;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstValue(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  const normalizedKeys = keys.map(normalizeHeader);

  for (const key of normalizedKeys) {
    const found = entries.find(([k]) => normalizeHeader(k).includes(key));
    if (found && found[1] != null) return String(found[1]).trim();
  }

  return "";
}

function normalizePhoneHeader(value: string) {
  return normalizeHeader(value)
    .replace(/[º°]/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validPhoneDigits(value: unknown) {
  const digits = onlyDigits(String(value ?? "").trim());

  if (digits.length === 10 || digits.length === 11) return digits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }

  return "";
}

function phoneHeaderPriority(header: string) {
  const key = normalizePhoneHeader(header);

  if (!key) return 0;
  if (key.includes("whatsapp")) return 120;
  if (/^(numero|no|n) (de )?telefone$/.test(key)) return 115;
  if (key.includes("numero de telefone")) return 115;
  if (key === "telefone" || key === "telefone principal") return 100;
  if (key.includes("celular")) return 95;
  if (key === "phone" || key === "fone") return 90;
  if (key.includes("telefone")) return 80;

  return 0;
}

function extractPhoneFromRow(row: Record<string, unknown>) {
  const candidates = Object.entries(row)
    .map(([header, value]) => {
      const digits = validPhoneDigits(value);
      const headerPriority = phoneHeaderPriority(header);
      const localDigits = digits.startsWith("55") ? digits.slice(2) : digits;
      const mobileBonus =
        localDigits.length === 11 && localDigits.charAt(2) === "9" ? 10 : 0;

      return {
        digits,
        score: headerPriority + mobileBonus
      };
    })
    .filter((candidate) => candidate.digits && candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.digits || "";
}

function sourceIdentity(origem: string) {
  const file = origem.split("•")[0]?.trim() || origem;

  return normalizeHeader(file)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackLeadIdentity(lead: Lead) {
  const name = normalizeHeader(lead.nome).replace(/\s+/g, " ").trim();
  const city = normalizeHeader(lead.cidade).replace(/\s+/g, " ").trim();
  const source = sourceIdentity(lead.origem);

  if (!name || !source) return "";

  return `${name}|${city || "sem-cidade"}|${source}`;
}

function cityTitleCase(value: string) {
  const lowerWords = new Set(["da", "de", "do", "das", "dos", "e"]);

  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && lowerWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function inferCityFromSource(origem: string) {
  const rawFile = origem.split("•")[0]?.trim() || "";
  const withoutExtension = rawFile.replace(/\.[a-z0-9]+$/i, "");
  const normalized = normalizeHeader(withoutExtension)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const opportunity = normalized.match(/^oportunidades?\s+([^\s]+)/);
  if (opportunity?.[1]) return cityTitleCase(opportunity[1]);

  const delinquent = normalized.match(/^inadimplentes?\s+(?:de\s+)?(.+)$/);
  if (delinquent?.[1]) return cityTitleCase(delinquent[1]);

  const leads = normalized.match(/^leads?\s+(?:de\s+)?(.+)$/);
  if (leads?.[1]) return cityTitleCase(leads[1]);

  const generic = normalized.match(
    /^(?:contatos?|clientes?|base|lista|prospectos?|prospeccao)\s+(?:de\s+)?(.+)$/
  );
  if (generic?.[1]) return cityTitleCase(generic[1]);

  return "";
}

function inferDemandTypeFromSource(origem: string): DemandType {
  const normalized = normalizeHeader(origem);

  if (
    normalized.includes("inadimpl") ||
    normalized.includes("cobranca") ||
    normalized.includes("devedor")
  ) {
    return "delinquent";
  }

  return "opportunity";
}

function rowsToLeads(rows: Record<string, unknown>[], origem: string): Lead[] {
  return rows
    .map((row) => ({
      id: crypto.randomUUID(),
      nome: firstValue(row, ["nome", "name", "cliente", "lead", "contato"]),
      whatsapp: extractPhoneFromRow(row),
      email: firstValue(row, ["email", "e-mail", "mail"]),
      cidade:
        firstValue(row, ["cidade", "municipio", "município", "city", "localidade"]) ||
        inferCityFromSource(origem),
      origem,
      status: "Novo" as Status,
      tipo: inferDemandTypeFromSource(origem),
      ownerUserId: null,
      criadoEm: new Date().toISOString()
    }))
    .filter((lead) => lead.nome || lead.whatsapp || lead.email);
}

function textToLeads(text: string, origem: string): Lead[] {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRegex = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/g;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const leads: Lead[] = [];

  for (const line of lines) {
    const emails = line.match(emailRegex) || [];
    const phones = line.match(phoneRegex) || [];

    if (!emails.length && !phones.length) continue;

    let nome = line;
    [...emails, ...phones].forEach((part) => {
      nome = nome.replace(part, " ");
    });

    nome = nome.replace(/[|;,\t]+/g, " ").replace(/\s+/g, " ").trim();

    leads.push({
      id: crypto.randomUUID(),
      nome,
      whatsapp: phones[0] || "",
      email: emails[0] || "",
      cidade: inferCityFromSource(origem),
      origem,
      status: "Novo",
      tipo: inferDemandTypeFromSource(origem),
      ownerUserId: null,
      criadoEm: new Date().toISOString()
    });
  }

  return leads;
}

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [cityFilter, setCityFilter] = useState("Todas");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [activeTab, setActiveTab] = useState<DemandType>("opportunity");
  const importTypeRef = useRef<DemandType>("opportunity");
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!sessionStorage.getItem(COMMERCIAL_ACCESS_KEY)) {
        location.href = "/login";
        return;
      }

      try {
        const [sessionResponse, leadResponse, ownerResponse] = await Promise.all([
          fetch("/api/session", { cache: "no-store" }),
          supabaseRequest(
            "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,created_at&order=created_at.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_users?select=id,username,display_name,role&active=eq.true&order=display_name.asc"
          )
        ]);

        if (!sessionResponse.ok) {
          location.href = "/login";
          return;
        }

        const [session, leadRows, ownerRows] = await Promise.all([
          sessionResponse.json() as Promise<SessionInfo>,
          leadResponse.json() as Promise<DbLead[]>,
          ownerResponse.json() as Promise<OwnerUser[]>
        ]);

        if (!cancelled) {
          setSessionInfo(session);
          setLeads(leadRows.map(dbToLead));
          setOwners(ownerRows);
          setNotice("");
        }
      } catch (err) {
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const ownerById = useMemo(
    () => new Map(owners.map((owner) => [owner.id, owner] as const)),
    [owners]
  );

  const currentOwnerId = useMemo(() => {
    const username = sessionInfo?.username.toLowerCase();
    if (!username) return null;

    return (
      owners.find((owner) => owner.username.toLowerCase() === username)?.id || null
    );
  }, [owners, sessionInfo]);

  const tabLeads = useMemo(
    () => leads.filter((lead) => lead.tipo === activeTab),
    [leads, activeTab]
  );

  const cities = useMemo(
    () =>
      Array.from(
        new Set(tabLeads.map((lead) => lead.cidade.trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tabLeads]
  );

  const ownerOptions = useMemo(() => {
    const used = new Set(tabLeads.map((lead) => lead.ownerUserId).filter(Boolean));

    return owners.filter((owner) => used.has(owner.id));
  }, [tabLeads, owners]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();

    return tabLeads.filter((lead) => {
      const ownerName = lead.ownerUserId
        ? ownerById.get(lead.ownerUserId)?.display_name || ""
        : "";

      const matches = [
        lead.nome,
        lead.whatsapp,
        lead.email,
        lead.cidade,
        lead.origem,
        demandLabel(lead.tipo),
        ownerName
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

      const statusOk = statusFilter === "Todos" || lead.status === statusFilter;
      const cityOk = cityFilter === "Todas" || lead.cidade === cityFilter;
      const ownerOk = ownerFilter === "Todos" || lead.ownerUserId === ownerFilter;

      return matches && statusOk && cityOk && ownerOk;
    });
  }, [tabLeads, query, statusFilter, cityFilter, ownerFilter, ownerById]);

  async function addImported(items: Lead[]) {
    const currentScopeOwner = currentOwnerId;

    const scopedExisting = leads.filter(
      (lead) => lead.ownerUserId === currentScopeOwner
    );

    function createUniqueIndex(getKey: (lead: Lead) => string) {
      const index = new Map<string, Lead | null>();

      for (const lead of scopedExisting) {
        const key = getKey(lead);
        if (!key) continue;

        if (index.has(key)) {
          index.set(key, null);
        } else {
          index.set(key, lead);
        }
      }

      return index;
    }

    const phoneIndex = createUniqueIndex((lead) => {
      const phone = normalizeWhatsApp(lead.whatsapp);
      return phone ? `${lead.tipo}|${phone}` : "";
    });

    const emailIndex = createUniqueIndex((lead) => {
      const email = lead.email.toLowerCase().trim();
      return email ? `${lead.tipo}|${email}` : "";
    });

    const fallbackIndex = createUniqueIndex((lead) => {
      const fallback = fallbackLeadIdentity(lead);
      return fallback ? `${lead.tipo}|${fallback}` : "";
    });

    const fresh: Lead[] = [];
    const enrichById = new Map<
      string,
      { id: string; whatsapp?: string; city?: string }
    >();

    for (const imported of items) {
      const importedPhone = normalizeWhatsApp(imported.whatsapp);
      const importedEmail = imported.email.toLowerCase().trim();
      const fallback = fallbackLeadIdentity(imported);

      const phoneMatch = importedPhone
        ? phoneIndex.get(`${imported.tipo}|${importedPhone}`)
        : undefined;

      const emailMatch = importedEmail
        ? emailIndex.get(`${imported.tipo}|${importedEmail}`)
        : undefined;

      const fallbackMatch = fallback
        ? fallbackIndex.get(`${imported.tipo}|${fallback}`)
        : undefined;

      const existing =
        phoneMatch ||
        emailMatch ||
        fallbackMatch ||
        null;

      if (!existing) {
        fresh.push(imported);
        continue;
      }

      const update: { id: string; whatsapp?: string; city?: string } = {
        id: existing.id
      };

      const existingPhone = validPhoneDigits(existing.whatsapp);
      const newPhone = validPhoneDigits(imported.whatsapp);

      if (!existingPhone && newPhone) {
        update.whatsapp = newPhone;
      }

      if (!existing.cidade.trim() && imported.cidade.trim()) {
        update.city = imported.cidade.trim();
      }

      if (update.whatsapp || update.city) {
        enrichById.set(existing.id, {
          ...(enrichById.get(existing.id) || { id: existing.id }),
          ...update
        });
      }
    }

    let added = 0;
    let enriched = 0;
    let skipped = 0;

    if (fresh.length) {
      const response = await supabaseRequest(
        "/rest/v1/rpc/commercial_import_leads",
        {
          method: "POST",
          body: JSON.stringify({
            p_leads: fresh.map(toDbLead)
          })
        }
      );

      const savedRows = (await response.json()) as DbLead[];
      const saved = savedRows.map(dbToLead);

      added = saved.length;
      skipped += Math.max(0, fresh.length - saved.length);

      if (saved.length) {
        setLeads((current) => [...saved, ...current]);
      }
    }

    const enrichPayload = Array.from(enrichById.values());

    if (enrichPayload.length) {
      const response = await supabaseRequest(
        "/rest/v1/rpc/commercial_enrich_leads",
        {
          method: "POST",
          body: JSON.stringify({
            p_updates: enrichPayload
          })
        }
      );

      const updatedRows = (await response.json()) as DbLead[];
      enriched = updatedRows.length;

      if (updatedRows.length) {
        const updates = new Map(
          updatedRows.map((row) => [row.id, dbToLead(row)] as const)
        );

        setLeads((current) =>
          current.map((lead) => updates.get(lead.id) || lead)
        );
      }
    }

    skipped += Math.max(
      0,
      items.length - fresh.length - enrichPayload.length
    );

    if (!added && !enriched) {
      setNotice(
        skipped
          ? `${skipped} registro(s) já estavam completos nesta carteira.`
          : "Nenhum registro novo foi encontrado."
      );
      return;
    }

    const parts: string[] = [];

    if (added) parts.push(`${added} registro(s) importado(s)`);
    if (enriched) parts.push(`${enriched} atualizado(s) com telefone/cidade`);
    if (skipped) parts.push(`${skipped} já existente(s)`);

    setNotice(parts.join(" · ") + ".");
  }

  function openImporter(type: DemandType) {
    importTypeRef.current = type;
    inputRef.current?.click();
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
        const workbook = XLSX.read(data);

        for (const sheetName of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            workbook.Sheets[sheetName],
            { defval: "" }
          );

          imported.push(...rowsToLeads(rows, `${file.name} • ${sheetName}`));
        }
      } else if (ext === "json") {
        const parsed = JSON.parse(await file.text());
        const rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.leads)
            ? parsed.leads
            : [parsed];

        imported = rowsToLeads(rows, file.name);
      } else if (ext === "docx") {
        const result = await mammoth.extractRawText({
          arrayBuffer: await file.arrayBuffer()
        });
        imported = textToLeads(result.value, file.name);
      } else if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

        const pdf = await pdfjs.getDocument({
          data: await file.arrayBuffer()
        }).promise;

        let text = "";

        for (let page = 1; page <= pdf.numPages; page++) {
          const currentPage = await pdf.getPage(page);
          const pageContent = await currentPage.getTextContent();

          for (const item of pageContent.items as any[]) {
            text += (item.str || "") + (item.hasEOL ? "\n" : " ");
          }

          text += "\n";
        }

        imported = textToLeads(text, file.name);
      } else if (ext === "txt") {
        imported = textToLeads(await file.text(), file.name);
      } else {
        throw new Error(
          "Formato ainda não suportado. Use planilhas, CSV/TSV, PDF, DOCX, TXT ou JSON."
        );
      }

      imported = imported.map((lead) => ({
        ...lead,
        tipo: importTypeRef.current
      }));

      await addImported(imported);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível importar o arquivo."
      );
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function updateStatus(id: string, status: Status) {
    try {
      const response = await supabaseRequest(
        `/rest/v1/commercial_leads?id=eq.${encodeURIComponent(id)}&select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,created_at`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status })
        }
      );

      const rows = (await response.json()) as DbLead[];

      if (!rows.length) {
        throw new Error("Registro não encontrado no banco.");
      }

      const saved = dbToLead(rows[0]);

      setLeads((current) =>
        current.map((lead) => (lead.id === id ? saved : lead))
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível atualizar o status."
      );
    }
  }

  async function removeLead(id: string) {
    try {
      await supabaseRequest(
        `/rest/v1/commercial_leads?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );

      setLeads((current) => current.filter((lead) => lead.id !== id));
      setNotice("Registro excluído do Supabase.");
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível excluir o registro."
      );
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
          "O conector não conseguiu acessar o Scale. Abra o Scale e tente novamente."
        );
        return;
      }

      if (event.data?.mode === "existing") {
        setNotice(
          event.data?.modalOpen
            ? `Scale encontrado. Preenchendo o modal Nova Conversa de ${lead.nome}…`
            : "Scale encontrado. Se o modal Nova Conversa estiver aberto, ele será preenchido automaticamente."
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

  const opportunityCount = leads.filter((lead) => lead.tipo === "opportunity").length;
  const delinquentCount = leads.filter((lead) => lead.tipo === "delinquent").length;
  const activeConverted = tabLeads.filter((lead) => lead.status === "Convertido").length;

  function changeTab(tab: DemandType) {
    setActiveTab(tab);
    setCityFilter("Todas");
    setOwnerFilter("Todos");
    setStatusFilter("Todos");
    setNotice("");
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PAINEL COMERCIAL</p>
          <h1>Leads Comercial</h1>
          {sessionInfo && (
            <p className="session-line">
              {sessionInfo.role === "admin"
                ? `Administrador · ${sessionInfo.displayName}`
                : sessionInfo.role === "commercial"
                  ? `Setor Comercial · todas as unidades · ${sessionInfo.displayName}`
                  : `Unidade ${sessionInfo.unitName || "—"} · carteira de ${sessionInfo.displayName}`}
            </p>
          )}
        </div>

        <div className="topbar-actions">
          <ThemeToggle />

          {sessionInfo?.role === "admin" && (
            <a className="ghost-btn admin-link" href="/admin">
              Usuários e unidades
            </a>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pdf,.docx,.txt,.json"
            onChange={handleFile}
            hidden
          />

          <button
            className={activeTab === "delinquent" ? "delinquent-import-btn" : "primary-btn small"}
            onClick={() => openImporter(activeTab)}
            disabled={processing || !loaded}
          >
            {processing
              ? "Importando..."
              : activeTab === "delinquent"
                ? "+ Importar inadimplentes"
                : "+ Importar oportunidades"}
          </button>

          <button className="ghost-btn" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <section className="demand-tabs" aria-label="Tipo de demanda">
        <button
          type="button"
          className={activeTab === "opportunity" ? "demand-tab active opportunity" : "demand-tab opportunity"}
          onClick={() => changeTab("opportunity")}
        >
          <span>Oportunidades</span>
          <strong>{opportunityCount}</strong>
        </button>

        <button
          type="button"
          className={activeTab === "delinquent" ? "demand-tab active delinquent" : "demand-tab delinquent"}
          onClick={() => changeTab("delinquent")}
        >
          <span>Inadimplentes</span>
          <strong>{delinquentCount}</strong>
        </button>
      </section>

      <section className="metrics">
        <article>
          <span>Total em {activeTab === "delinquent" ? "inadimplentes" : "oportunidades"}</span>
          <strong>{tabLeads.length}</strong>
        </article>
        <article>
          <span>Novos</span>
          <strong>{tabLeads.filter((lead) => lead.status === "Novo").length}</strong>
        </article>
        <article>
          <span>Em contato</span>
          <strong>{tabLeads.filter((lead) => lead.status === "Em contato").length}</strong>
        </article>
        <article>
          <span>Convertidos</span>
          <strong>{activeConverted}</strong>
        </article>
      </section>

      <section className={activeTab === "delinquent" ? "import-box delinquent-box" : "import-box"}>
        <div>
          <strong>
            {activeTab === "delinquent"
              ? "Importar inadimplentes"
              : "Importar oportunidades"}
          </strong>
          <p>
            {activeTab === "delinquent"
              ? "O arquivo enviado nesta aba entra somente em Inadimplentes e permanece vinculado ao usuário responsável."
              : "O arquivo enviado nesta aba entra somente em Oportunidades e permanece vinculado ao usuário responsável."}
          </p>
        </div>

        <div className="import-actions">
          <button
            className={activeTab === "delinquent" ? "delinquent-import-btn" : "primary-btn"}
            onClick={() => openImporter(activeTab)}
            disabled={processing || !loaded}
          >
            {activeTab === "delinquent"
              ? "Selecionar inadimplentes"
              : "Selecionar oportunidades"}
          </button>
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="leads-card">
        <div className="filters filters-demand">
          <input
            placeholder="Buscar por nome, telefone, cidade, responsável..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
          >
            <option value="Todas">Todas as cidades</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          >
            <option value="Todos">Todos os responsáveis</option>
            {ownerOptions.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.display_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>Todos</option>
            {statusList.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table className="demand-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>WhatsApp</th>
                <th>Cidade</th>
                <th>Responsável</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((lead) => {
                const wa = normalizeWhatsApp(lead.whatsapp);
                const owner = lead.ownerUserId
                  ? ownerById.get(lead.ownerUserId)
                  : null;

                const text = encodeURIComponent(
                  `Olá, ${lead.nome || "tudo bem"}! Sou do setor comercial e estou entrando em contato para te passar mais informações.`
                );

                return (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.nome || "Sem nome"}</strong>
                      <small>
                        {lead.email || "Sem e-mail"} ·{" "}
                        {new Date(lead.criadoEm).toLocaleDateString("pt-BR")}
                      </small>
                    </td>
                    <td>
                      {lead.whatsapp || (
                        <span className="no-phone">Sem telefone</span>
                      )}
                    </td>
                    <td>{lead.cidade || "—"}</td>
                    <td>
                      <strong>{owner?.display_name || "—"}</strong>
                      {owner?.username && <small>@{owner.username}</small>}
                    </td>
                    <td className="origin">{lead.origem}</td>
                    <td>
                      <select
                        className="status-select"
                        value={lead.status}
                        onChange={(event) =>
                          void updateStatus(
                            lead.id,
                            event.target.value as Status
                          )
                        }
                      >
                        {statusList.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        {wa && (
                          <button
                            className="scale-btn"
                            onClick={() => startScale(lead)}
                          >
                            Iniciar no Scale
                          </button>
                        )}

                        {wa && (
                          <a
                            className="wa-btn"
                            href={`https://wa.me/${wa}?text=${text}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        )}

                        {lead.email && (
                          <a className="mail-btn" href={`mailto:${lead.email}`}>
                            E-mail
                          </a>
                        )}

                        <button
                          className="delete-btn"
                          onClick={() => void removeLead(lead.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum {activeTab === "delinquent" ? "inadimplente" : "registro de oportunidade"} encontrado nesta carteira.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        Cada usuário trabalha sua própria carteira. Setor Comercial e ADM mantêm a visão consolidada sem perda de dados.
      </p>
    </main>
  );
}
