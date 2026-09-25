"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import ThemeToggle from "../components/ThemeToggle";

type Status = "Novo" | "Em contato" | "Interessado" | "Sem retorno" | "Convertido";
type DemandType = "opportunity" | "delinquent" | "inactive";

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
  unitId: string | null;
  criadoEm: string;
  debtBalance?: number;
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
  unit_id: string | null;
  created_at: string;
};

type UnitInfo = {
  id: string;
  name: string;
  city: string;
};

type DelinquentBatch = {
  id: string;
  batch_date: string;
  owner_user_id: string;
  unit_id: string | null;
  source: string;
  created_at: string;
};

type DelinquentItem = {
  id: string;
  batch_id: string;
  lead_id: string;
  initial_balance: number;
  recovered_amount: number;
  payment_status: "pending" | "partial" | "paid";
  created_at: string;
};

type DelinquentPaymentResult = {
  ok: boolean;
  itemId: string;
  leadId: string;
  recoveredAmount: number;
  initialBalance: number;
  openBalance: number;
  paymentStatus: "partial" | "paid";
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
    unitId: row.unit_id || null,
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
  if (type === "delinquent") return "Inadimplente";
  if (type === "inactive") return "Inativo";
  return "Oportunidade";
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

function parseCurrencyValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
  }

  let raw = String(value ?? "").trim();
  if (!raw) return 0;

  raw = raw.replace(/[^0-9,.-]/g, "");

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = raw.split(".");
    if (parts.length > 2) {
      const decimal = parts.pop();
      raw = parts.join("") + "." + decimal;
    }
  }

  const number = Number(raw);
  return Number.isFinite(number)
    ? Math.max(0, Math.round(number * 100) / 100)
    : 0;
}

function debtHeaderPriority(header: string) {
  const key = normalizeHeader(header)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (key.includes("saldo devedor")) return 140;
  if (key.includes("saldo em aberto")) return 135;
  if (key.includes("valor em aberto")) return 130;
  if (key.includes("valor devido")) return 125;
  if (key.includes("total devido")) return 120;
  if (key.includes("debito") || key.includes("divida")) return 115;
  if (key.includes("inadimpl") || key.includes("pendencia")) return 100;
  if (key === "saldo" || key === "valor") return 60;

  return 0;
}

function extractDebtBalanceFromRow(row: Record<string, unknown>) {
  const candidate = Object.entries(row)
    .map(([header, value]) => ({
      score: debtHeaderPriority(header),
      value
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  return candidate ? parseCurrencyValue(candidate.value) : 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function todayLocalDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function paymentStatusLabel(status: DelinquentItem["payment_status"]) {
  if (status === "paid") return "Quitado";
  if (status === "partial") return "Pagamento parcial";
  return "Pendente";
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

  const inactive = normalized.match(/^inativos?\s+(?:de\s+)?(.+)$/);
  if (inactive?.[1]) return cityTitleCase(inactive[1]);

  const leads = normalized.match(/^leads?\s+(?:de\s+)?(.+)$/);
  if (leads?.[1]) return cityTitleCase(leads[1]);

  const generic = normalized.match(
    /^(?:contatos?|clientes?|base|lista|prospectos?|prospeccao)\s+(?:de\s+)?(.+)$/
  );
  if (generic?.[1]) return cityTitleCase(generic[1]);

  return "";
}

function localDateKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

  if (
    normalized.includes("inativo") ||
    normalized.includes("ex aluno") ||
    normalized.includes("ex-aluno") ||
    normalized.includes("reativ")
  ) {
    return "inactive";
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
      unitId: null,
      criadoEm: new Date().toISOString(),
      debtBalance: extractDebtBalanceFromRow(row)
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
      unitId: null,
      criadoEm: new Date().toISOString(),
      debtBalance: 0
    });
  }

  return leads;
}

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [delinquentBatches, setDelinquentBatches] = useState<DelinquentBatch[]>([]);
  const [delinquentItems, setDelinquentItems] = useState<DelinquentItem[]>([]);
  const [delinquentImportDate, setDelinquentImportDate] = useState(todayLocalDateKey());
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("Todas");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [sortOrder, setSortOrder] = useState<"recent" | "az" | "za">("recent");
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
        const [
          sessionResponse,
          leadResponse,
          ownerResponse,
          unitResponse,
          batchResponse,
          delinquentItemResponse
        ] = await Promise.all([
          fetch("/api/session", { cache: "no-store" }),
          supabaseRequest(
            "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_users?select=id,username,display_name,role&active=eq.true&order=display_name.asc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_units?select=id,name,city&active=eq.true&order=name.asc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,created_at&order=created_at.desc"
          )
        ]);

        if (!sessionResponse.ok) {
          location.href = "/login";
          return;
        }

        const [
          session,
          leadRows,
          ownerRows,
          unitRows,
          batchRows,
          delinquentItemRows
        ] = await Promise.all([
          sessionResponse.json() as Promise<SessionInfo>,
          leadResponse.json() as Promise<DbLead[]>,
          ownerResponse.json() as Promise<OwnerUser[]>,
          unitResponse.json() as Promise<UnitInfo[]>,
          batchResponse.json() as Promise<DelinquentBatch[]>,
          delinquentItemResponse.json() as Promise<DelinquentItem[]>
        ]);

        if (!cancelled) {
          setSessionInfo(session);
          setLeads(leadRows.map(dbToLead));
          setOwners(ownerRows);
          setUnits(unitRows);
          setDelinquentBatches(batchRows);
          setDelinquentItems(
            delinquentItemRows.map((item) => ({
              ...item,
              initial_balance: Number(item.initial_balance || 0),
              recovered_amount: Number(item.recovered_amount || 0)
            }))
          );
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

  useEffect(() => {
    if (!loaded || !sessionInfo) return;

    let cancelled = false;
    let refreshing = false;

    async function refreshLeads() {
      if (refreshing) return;
      refreshing = true;

      try {
        const [leadResponse, batchResponse, delinquentItemResponse] = await Promise.all([
          supabaseRequest(
            "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,created_at&order=created_at.desc"
          )
        ]);

        const [rows, batchRows, delinquentItemRows] = await Promise.all([
          leadResponse.json() as Promise<DbLead[]>,
          batchResponse.json() as Promise<DelinquentBatch[]>,
          delinquentItemResponse.json() as Promise<DelinquentItem[]>
        ]);

        if (!cancelled) {
          setLeads(rows.map(dbToLead));
          setDelinquentBatches(batchRows);
          setDelinquentItems(
            delinquentItemRows.map((item) => ({
              ...item,
              initial_balance: Number(item.initial_balance || 0),
              recovered_amount: Number(item.recovered_amount || 0)
            }))
          );
        }
      } catch {
        // A atualização automática é silenciosa; erros continuam visíveis
        // nas ações manuais do usuário.
      } finally {
        refreshing = false;
      }
    }

    const timer = window.setInterval(() => {
      void refreshLeads();
    }, 4000);

    const handleFocus = () => {
      void refreshLeads();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loaded, sessionInfo]);

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

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  const unitScopedLeads = useMemo(() => {
    if (unitFilter === "Todas") return tabLeads;

    const selectedUnit = unitById.get(unitFilter);

    return tabLeads.filter((lead) => {
      if (lead.unitId) return lead.unitId === unitFilter;

      return Boolean(
        selectedUnit &&
          lead.cidade &&
          normalizeHeader(lead.cidade) === normalizeHeader(selectedUnit.city)
      );
    });
  }, [tabLeads, unitFilter, unitById]);

  const batchById = useMemo(
    () => new Map(delinquentBatches.map((batch) => [batch.id, batch] as const)),
    [delinquentBatches]
  );

  const dateScopedLeads = useMemo(() => {
    if (!dateFilter) return unitScopedLeads;

    if (activeTab === "delinquent") {
      const leadIds = new Set(
        delinquentItems
          .filter((item) => batchById.get(item.batch_id)?.batch_date === dateFilter)
          .map((item) => item.lead_id)
      );

      return unitScopedLeads.filter((lead) => leadIds.has(lead.id));
    }

    return unitScopedLeads.filter(
      (lead) => localDateKey(lead.criadoEm) === dateFilter
    );
  }, [unitScopedLeads, dateFilter, activeTab, delinquentItems, batchById]);

  const ownerOptions = useMemo(() => {
    const used = new Set(
      dateScopedLeads.map((lead) => lead.ownerUserId).filter(Boolean)
    );

    return owners.filter((owner) => used.has(owner.id));
  }, [dateScopedLeads, owners]);

  const delinquentItemByLead = useMemo(() => {
    const map = new Map<string, DelinquentItem>();
    const allowedLeadIds = new Set(unitScopedLeads.map((lead) => lead.id));

    for (const item of delinquentItems) {
      if (!allowedLeadIds.has(item.lead_id)) continue;

      const batch = batchById.get(item.batch_id);
      if (!batch) continue;
      if (dateFilter && batch.batch_date !== dateFilter) continue;

      const current = map.get(item.lead_id);

      if (!current) {
        map.set(item.lead_id, item);
        continue;
      }

      const currentBatchDate = batchById.get(current.batch_id)?.batch_date || "";
      if (batch.batch_date > currentBatchDate) {
        map.set(item.lead_id, item);
      }
    }

    return map;
  }, [delinquentItems, unitScopedLeads, batchById, dateFilter]);

  const delinquentStats = useMemo(() => {
    if (activeTab !== "delinquent") {
      return {
        total: 0,
        initialBalance: 0,
        paidContacts: 0,
        recoveredAmount: 0,
        openBalance: 0,
        conversionRate: 0,
        recoveryRate: 0,
        fullyPaid: 0
      };
    }

    const allowedLeadIds = new Set(
      unitScopedLeads
        .filter(
          (lead) => ownerFilter === "Todos" || lead.ownerUserId === ownerFilter
        )
        .map((lead) => lead.id)
    );

    const items = delinquentItems.filter((item) => {
      if (!allowedLeadIds.has(item.lead_id)) return false;
      const batchDate = batchById.get(item.batch_id)?.batch_date;
      return !dateFilter || batchDate === dateFilter;
    });

    const initialBalance = items.reduce(
      (sum, item) => sum + Number(item.initial_balance || 0),
      0
    );
    const recoveredAmount = items.reduce(
      (sum, item) => sum + Number(item.recovered_amount || 0),
      0
    );
    const paidContacts = items.filter(
      (item) => Number(item.recovered_amount || 0) > 0
    ).length;
    const fullyPaid = items.filter((item) => item.payment_status === "paid").length;

    return {
      total: items.length,
      initialBalance,
      paidContacts,
      recoveredAmount,
      openBalance: Math.max(0, initialBalance - recoveredAmount),
      conversionRate: items.length ? (paidContacts / items.length) * 100 : 0,
      recoveryRate: initialBalance ? (recoveredAmount / initialBalance) * 100 : 0,
      fullyPaid
    };
  }, [
    activeTab,
    unitScopedLeads,
    ownerFilter,
    delinquentItems,
    batchById,
    dateFilter
  ]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();

    const result = dateScopedLeads.filter((lead) => {
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
      const ownerOk = ownerFilter === "Todos" || lead.ownerUserId === ownerFilter;

      return matches && statusOk && ownerOk;
    });

    return result.sort((a, b) => {
      if (sortOrder === "az") {
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
          sensitivity: "base"
        });
      }

      if (sortOrder === "za") {
        return (b.nome || "").localeCompare(a.nome || "", "pt-BR", {
          sensitivity: "base"
        });
      }

      return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
    });
  }, [dateScopedLeads, query, statusFilter, ownerFilter, ownerById, sortOrder]);

  async function reloadDelinquentTracking() {
    const [leadResponse, batchResponse, delinquentItemResponse] = await Promise.all([
      supabaseRequest(
        "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc"
      ),
      supabaseRequest(
        "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc"
      ),
      supabaseRequest(
        "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,created_at&order=created_at.desc"
      )
    ]);

    const [leadRows, batchRows, delinquentItemRows] = await Promise.all([
      leadResponse.json() as Promise<DbLead[]>,
      batchResponse.json() as Promise<DelinquentBatch[]>,
      delinquentItemResponse.json() as Promise<DelinquentItem[]>
    ]);

    setLeads(leadRows.map(dbToLead));
    setDelinquentBatches(batchRows);
    setDelinquentItems(
      delinquentItemRows.map((item) => ({
        ...item,
        initial_balance: Number(item.initial_balance || 0),
        recovered_amount: Number(item.recovered_amount || 0)
      }))
    );
  }

  async function importDelinquentBatch(items: Lead[]) {
    if (!delinquentImportDate) {
      throw new Error("Selecione a data da carteira de inadimplentes.");
    }

    const source = items[0]?.origem?.split("•")[0]?.trim() || "Importação diária";

    const response = await supabaseRequest(
      "/rest/v1/rpc/commercial_import_delinquent_batch",
      {
        method: "POST",
        body: JSON.stringify({
          p_batch_date: delinquentImportDate,
          p_source: source,
          p_items: items.map((lead) => ({
            name: lead.nome.trim(),
            whatsapp: lead.whatsapp.trim() || null,
            email: lead.email.trim() || null,
            city: lead.cidade.trim() || null,
            source: lead.origem || source,
            initial_balance: Number(lead.debtBalance || 0).toFixed(2)
          }))
        })
      }
    );

    const result = (await response.json()) as {
      ok: boolean;
      batchId: string;
      batchDate: string;
      processed: number;
      total: number;
      initialBalance: number | string;
    };

    await reloadDelinquentTracking();
    setDateFilter(delinquentImportDate);

    setNotice(
      `Carteira de ${new Date(`${delinquentImportDate}T12:00:00`).toLocaleDateString("pt-BR")} registrada: ${result.total} inadimplente(s) · saldo inicial ${formatCurrency(Number(result.initialBalance || 0))}.`
    );
  }

  async function registerDelinquentPayment(lead: Lead, item: DelinquentItem) {
    const openBalance = Math.max(
      0,
      Number(item.initial_balance || 0) - Number(item.recovered_amount || 0)
    );

    if (item.payment_status === "paid") {
      setNotice(`${lead.nome || "Este contato"} já está quitado nesta carteira.`);
      return;
    }

    const raw = window.prompt(
      item.initial_balance > 0
        ? `Valor recebido de ${lead.nome || "cliente"} (saldo aberto: ${formatCurrency(openBalance)}):`
        : `Valor recebido de ${lead.nome || "cliente"}:`
    );

    if (raw == null) return;

    const amount = parseCurrencyValue(raw);

    if (!amount) {
      setNotice("Informe um valor de pagamento válido.");
      return;
    }

    try {
      const response = await supabaseRequest(
        "/rest/v1/rpc/commercial_register_delinquent_payment",
        {
          method: "POST",
          body: JSON.stringify({
            p_item_id: item.id,
            p_amount: amount,
            p_paid_at: null,
            p_note: null
          })
        }
      );

      const result = (await response.json()) as DelinquentPaymentResult;

      setDelinquentItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                recovered_amount: Number(result.recoveredAmount || 0),
                payment_status: result.paymentStatus
              }
            : row
        )
      );

      setNotice(
        `Pagamento de ${formatCurrency(amount)} registrado para ${lead.nome || "cliente"}. Recuperado nesta carteira: ${formatCurrency(Number(result.recoveredAmount || 0))}.`
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível registrar o pagamento."
      );
    }
  }

  async function addImported(items: Lead[]) {
    if (items.length && items.every((item) => item.tipo === "delinquent")) {
      await importDelinquentBatch(items);
      return;
    }

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
        `/rest/v1/commercial_leads?id=eq.${encodeURIComponent(id)}&select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at`,
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
    const payload = {
      nome: lead.nome,
      ddi: "55",
      phone,
      unidade:
        (lead.unitId ? unitById.get(lead.unitId)?.name : null) ||
        lead.cidade ||
        sessionInfo?.unitName ||
        ""
    };

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

  const allUnitScopedLeads = useMemo(() => {
    return unitFilter === "Todas"
      ? leads
      : leads.filter((lead) => {
          const selectedUnit = unitById.get(unitFilter);

          if (lead.unitId) return lead.unitId === unitFilter;

          return Boolean(
            selectedUnit &&
              lead.cidade &&
              normalizeHeader(lead.cidade) === normalizeHeader(selectedUnit.city)
          );
        });
  }, [leads, unitFilter, unitById]);

  const opportunityCount = allUnitScopedLeads.filter(
    (lead) =>
      lead.tipo === "opportunity" &&
      (!dateFilter || localDateKey(lead.criadoEm) === dateFilter)
  ).length;

  const inactiveCount = allUnitScopedLeads.filter(
    (lead) =>
      lead.tipo === "inactive" &&
      (!dateFilter || localDateKey(lead.criadoEm) === dateFilter)
  ).length;

  const delinquentCount = dateFilter
    ? delinquentStats.total
    : allUnitScopedLeads.filter((lead) => lead.tipo === "delinquent").length;
  const activeConverted = dateScopedLeads.filter(
    (lead) => lead.status === "Convertido"
  ).length;

  function changeTab(tab: DemandType) {
    setActiveTab(tab);
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
                  ? `Setor Comercial · carteira própria · ${
                      unitFilter === "Todas"
                        ? "todas as unidades"
                        : unitById.get(unitFilter)?.name || "unidade selecionada"
                    } · ${sessionInfo.displayName}`
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
            className={
              activeTab === "delinquent"
                ? "delinquent-import-btn"
                : activeTab === "inactive"
                  ? "inactive-import-btn"
                  : "primary-btn small"
            }
            onClick={() => openImporter(activeTab)}
            disabled={processing || !loaded}
          >
            {processing
              ? "Importando..."
              : activeTab === "delinquent"
                ? "+ Importar inadimplentes"
                : activeTab === "inactive"
                  ? "+ Importar inativos"
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

        <button
          type="button"
          className={activeTab === "inactive" ? "demand-tab active inactive" : "demand-tab inactive"}
          onClick={() => changeTab("inactive")}
        >
          <span>Inativos</span>
          <strong>{inactiveCount}</strong>
        </button>
      </section>

      {activeTab === "delinquent" ? (
        <section className="metrics metrics-six delinquent-recovery-metrics">
          <article>
            <span>Carteira {dateFilter ? "do dia" : "acumulada"}</span>
            <strong>{delinquentStats.total}</strong>
            <small>registros de inadimplência</small>
          </article>
          <article>
            <span>Saldo inicial</span>
            <strong>{formatCurrency(delinquentStats.initialBalance)}</strong>
            <small>valor importado nas carteiras</small>
          </article>
          <article>
            <span>Pagaram</span>
            <strong>{delinquentStats.paidContacts}</strong>
            <small>{delinquentStats.fullyPaid} quitado(s)</small>
          </article>
          <article>
            <span>Valor recuperado</span>
            <strong>{formatCurrency(delinquentStats.recoveredAmount)}</strong>
            <small>{delinquentStats.recoveryRate.toFixed(1)}% do saldo</small>
          </article>
          <article>
            <span>Conversão</span>
            <strong>{delinquentStats.conversionRate.toFixed(1)}%</strong>
            <small>contatos com pagamento</small>
          </article>
          <article>
            <span>Saldo aberto</span>
            <strong>{formatCurrency(delinquentStats.openBalance)}</strong>
            <small>restante da carteira</small>
          </article>
        </section>
      ) : (
        <section className="metrics">
          <article>
            <span>
              Total em {activeTab === "inactive" ? "inativos" : "oportunidades"}
            </span>
            <strong>{dateScopedLeads.length}</strong>
          </article>
          <article>
            <span>Novos</span>
            <strong>{dateScopedLeads.filter((lead) => lead.status === "Novo").length}</strong>
          </article>
          <article>
            <span>Em contato</span>
            <strong>{dateScopedLeads.filter((lead) => lead.status === "Em contato").length}</strong>
          </article>
          <article>
            <span>{activeTab === "inactive" ? "Reativados" : "Convertidos"}</span>
            <strong>{activeConverted}</strong>
          </article>
        </section>
      )}

      <section
        className={
          activeTab === "delinquent"
            ? "import-box delinquent-box"
            : activeTab === "inactive"
              ? "import-box inactive-box"
              : "import-box"
        }
      >
        <div className="import-box-content">
          <div className="import-heading">
            <div className="live-status">
              <span className="live-dot" aria-hidden="true" />
              Atualização automática ativa
            </div>
            <strong>
              {activeTab === "delinquent"
                ? "Importar inadimplentes"
                : activeTab === "inactive"
                  ? "Importar alunos inativos"
                  : "Importar oportunidades"}
            </strong>
          </div>
          <p>
            {activeTab === "delinquent"
              ? "Cada importação cria ou atualiza a carteira diária de inadimplentes, preservando saldo inicial, pagamentos e recuperação daquela data."
              : activeTab === "inactive"
                ? "Importe alunos inativos para trabalhar a reativação sem misturar essa carteira com oportunidades ou inadimplentes."
                : "O arquivo enviado nesta aba entra somente em Oportunidades e permanece vinculado ao usuário responsável."}
          </p>
        </div>

        <div className="import-actions">
          {activeTab === "delinquent" && (
            <label className="batch-date-field">
              Data da carteira
              <input
                type="date"
                value={delinquentImportDate}
                onChange={(event) => setDelinquentImportDate(event.target.value)}
              />
            </label>
          )}

          <button
            className={
              activeTab === "delinquent"
                ? "delinquent-import-btn"
                : activeTab === "inactive"
                  ? "inactive-import-btn"
                  : "primary-btn"
            }
            onClick={() => openImporter(activeTab)}
            disabled={processing || !loaded}
          >
            {activeTab === "delinquent"
              ? "Selecionar inadimplentes"
              : activeTab === "inactive"
                ? "Selecionar inativos"
                : "Selecionar oportunidades"}
          </button>
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}

      {dateFilter && (
        <div className="date-filter-notice">
          <span>
            Exibindo somente {activeTab === "delinquent" ? "a carteira de" : activeTab === "inactive" ? "inativos de" : "leads de"}{" "}
            <strong>
              {new Date(`${dateFilter}T12:00:00`).toLocaleDateString("pt-BR")}
            </strong>
          </span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setDateFilter("")}
          >
            Limpar data
          </button>
        </div>
      )}

      <section className="leads-card">
        <div className="filters filters-demand">
          <input
            placeholder="Buscar por nome, telefone, unidade, responsável..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            value={unitFilter}
            onChange={(event) => {
              setUnitFilter(event.target.value);
              setOwnerFilter("Todos");
            }}
            aria-label="Selecionar unidade"
          >
            <option value="Todas">Todas as unidades</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value);
              setOwnerFilter("Todos");
            }}
            aria-label="Filtrar leads por data"
            title="Filtrar leads por data"
          />

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
              <option key={status} value={status}>
                {activeTab === "inactive" && status === "Convertido"
                  ? "Reativado"
                  : status}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(event) =>
              setSortOrder(event.target.value as "recent" | "az" | "za")
            }
            aria-label="Ordenar clientes"
          >
            <option value="recent">Mais recentes</option>
            <option value="az">Nome A–Z</option>
            <option value="za">Nome Z–A</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className={activeTab === "delinquent" ? "demand-table delinquent-finance-table" : "demand-table"}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>WhatsApp</th>
                <th>Unidade</th>
                <th>Responsável</th>
                <th>Origem</th>
                {activeTab === "delinquent" && (
                  <>
                    <th>Saldo devedor</th>
                    <th>Recuperado</th>
                    <th>Pagamento</th>
                  </>
                )}
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
                const delinquentItem =
                  activeTab === "delinquent"
                    ? delinquentItemByLead.get(lead.id) || null
                    : null;

                const text = encodeURIComponent(
                  activeTab === "inactive"
                    ? `Olá, ${lead.nome || "tudo bem"}! Tudo bem? Sou da 26Fit e estou entrando em contato porque vimos que você está há um tempo sem treinar com a gente. Posso te contar as opções para voltar?`
                    : `Olá, ${lead.nome || "tudo bem"}! Sou do setor comercial e estou entrando em contato para te passar mais informações.`
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
                    <td>
                      <strong>
                        {lead.unitId
                          ? unitById.get(lead.unitId)?.name || lead.cidade || "—"
                          : lead.cidade || "—"}
                      </strong>
                      {lead.unitId && unitById.get(lead.unitId)?.city && (
                        <small>{unitById.get(lead.unitId)?.city}</small>
                      )}
                    </td>
                    <td>
                      <strong>{owner?.display_name || "—"}</strong>
                      {owner?.username && <small>@{owner.username}</small>}
                    </td>
                    <td className="origin">{lead.origem}</td>
                    {activeTab === "delinquent" && (
                      <>
                        <td className="money-cell">
                          {delinquentItem
                            ? formatCurrency(Number(delinquentItem.initial_balance || 0))
                            : "—"}
                        </td>
                        <td className="money-cell recovered">
                          {delinquentItem
                            ? formatCurrency(Number(delinquentItem.recovered_amount || 0))
                            : "—"}
                        </td>
                        <td>
                          {delinquentItem ? (
                            <span
                              className={`payment-pill ${delinquentItem.payment_status}`}
                            >
                              {paymentStatusLabel(delinquentItem.payment_status)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </>
                    )}
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
                          <option key={status} value={status}>
                            {activeTab === "inactive" && status === "Convertido"
                              ? "Reativado"
                              : status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        {activeTab === "delinquent" && delinquentItem && (
                          <button
                            className="payment-btn"
                            type="button"
                            onClick={() =>
                              void registerDelinquentPayment(lead, delinquentItem)
                            }
                          >
                            Registrar pagamento
                          </button>
                        )}

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
                  <td colSpan={activeTab === "delinquent" ? 10 : 7} className="empty">
                    Nenhum {activeTab === "delinquent" ? "inadimplente" : activeTab === "inactive" ? "aluno inativo" : "registro de oportunidade"} encontrado nesta carteira.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        Oportunidades, inadimplentes e inativos permanecem em carteiras separadas. Inadimplentes mantêm o histórico financeiro diário e Inativos ficam focados em reativação.
      </p>
    </main>
  );
}
