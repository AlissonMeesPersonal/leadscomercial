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
  delinquentDueDate?: string;
  evoCustomerId?: string;
  surname?: string;
  lastContractDescription?: string;
  lastContractStart?: string;
  lastContractValue?: number;
};

type SavedImportAudit = {
  id: string;
  owner_user_id: string;
  unit_id: string | null;
  demand_type: "opportunity" | "inactive";
  filename: string;
  imported_at: string;
  source_rows: number;
  valid_rows: number;
  inserted_rows: number;
  updated_rows: number;
  not_inserted_rows: number;
};

type ContactEvent = {
  id: string;
  lead_id: string | null;
  actor_user_id: string;
  lead_owner_user_id: string | null;
  unit_id: string | null;
  demand_type: DemandType;
  event_type: "scale_started";
  occurred_at: string;
};

type ImportAudit = {
  filename: string;
  read: number;
  valid: number;
  saved: number;
  updated: number;
  alreadyExistingOrRejected: number;
  databaseCount: number | null;
  warning: string | null;
};

type SessionInfo = {
  username: string;
  userId: string;
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
  due_date: string | null;
  payment_link: string | null;
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
const delinquentStatusList = ["Novo", "Em contato", "Pagará", "Pago"] as const;
type DelinquentStage = typeof delinquentStatusList[number];

function statusClass(status: Status) {
  switch (status) {
    case "Em contato": return "contact";
    case "Interessado": return "interested";
    case "Convertido": return "converted";
    case "Sem retorno": return "no-return";
    default: return "new";
  }
}


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

function buildLeadKey(
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

function mapDbLead(row: DbLead): Lead {
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

function serializeLead(lead: Lead) {
  return {
    name: lead.nome.trim(),
    whatsapp: lead.whatsapp.trim() || null,
    email: lead.email.trim() || null,
    city: (lead.cidade || "").trim() || null,
    unit_id: lead.unitId || null,
    source: lead.origem || "Importação",
    status: lead.status,
    demand_type: lead.tipo || "opportunity"
  };
}

function getDemandLabel(type: DemandType) {
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

// Supabase/PostgREST can cap each response at 1,000 rows.
async function supabaseAllRows<T>(path: string): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += pageSize) {
    const response = await supabaseRequest(
      `${path}${separator}limit=${pageSize}&offset=${offset}`
    );
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstMatchingValue(row: Record<string, unknown>, keys: string[]) {
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

function firstRawValue(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  const normalizedKeys = keys.map(normalizeHeader);

  for (const key of normalizedKeys) {
    const found = entries.find(([header]) =>
      normalizeHeader(header).includes(key)
    );

    if (found && found[1] != null && String(found[1]).trim() !== "") {
      return found[1];
    }
  }

  return null;
}

function normalizeImportedDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const br = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  return "";
}

function extractDueDateFromRow(row: Record<string, unknown>) {
  return normalizeImportedDate(
    firstRawValue(row, [
      "fim do ultimo contrato",
      "fim ultimo contrato",
      "fim do contrato"
    ])
  );
}

function extractLastContractStartFromRow(row: Record<string, unknown>) {
  return normalizeImportedDate(
    firstRawValue(row, [
      "inicio do ultimo contrato",
      "inicio ultimo contrato",
      "inicio do contrato"
    ])
  );
}

function extractEvoCustomerIdFromRow(row: Record<string, unknown>) {
  return firstMatchingValue(row, [
    "id do cliente",
    "id cliente",
    "codigo do cliente",
    "código do cliente"
  ]);
}

function extractSurnameFromRow(row: Record<string, unknown>) {
  return firstMatchingValue(row, ["sobrenome", "last name", "lastname"]);
}

function extractLastContractDescriptionFromRow(row: Record<string, unknown>) {
  return firstMatchingValue(row, [
    "descricao do ultimo contrato",
    "descrição do último contrato",
    "ultimo contrato",
    "último contrato"
  ]);
}

function extractLastContractValueFromRow(row: Record<string, unknown>) {
  const raw = firstRawValue(row, [
    "valor do ultimo contrato",
    "valor último contrato",
    "valor contrato"
  ]);

  return parseCurrencyValue(raw);
}

function formatTemplateDate(value: string | null | undefined) {
  if (!value) return "";

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatTemplateAmount(value: number) {
  return Math.max(0, Number(value || 0)).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
    .replace(/[_]+/g, " ")
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
  if (generic?.[1]) {
    const value = generic[1]
      .replace(/\b\d{1,2}\s*[-/.]\s*\d{1,2}(?:\s*[-/.]\s*\d{2,4})?\b.*$/, "")
      .replace(/\b(?:manha|tarde|noite)\b.*$/, "")
      .trim();

    if (value) return cityTitleCase(value);
  }

  // Arquivos operacionais também podem vir apenas como:
  // "SALDANHA 28-09 MANHÃ.xlsx", "RIO GRANDE 28-09.xlsx", etc.
  const beforeDate = normalized
    .replace(/\b\d{1,2}\s*[-/.]\s*\d{1,2}(?:\s*[-/.]\s*\d{2,4})?\b.*$/, "")
    .replace(/\b(?:manha|tarde|noite)\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (beforeDate && !/^\d+$/.test(beforeDate)) {
    return cityTitleCase(beforeDate);
  }

  return "";
}

function unitSourceVariants(unit: UnitInfo) {
  const values = [unit.name, unit.city];
  const variants = new Set<string>();

  for (const value of values) {
    const normalized = normalizeHeader(value)
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) continue;

    variants.add(normalized);
    variants.add(normalized.replace(/\s+(?:rs|sc|pr)$/i, "").trim());
    variants.add(normalized.replace(/\s+do\s+sul$/i, "").trim());
  }

  return [...variants]
    .filter((value) => value.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function resolveImportCity(origem: string, units: UnitInfo[]) {
  const rawFile = origem.split("•")[0]?.trim() || "";
  const normalizedSource = normalizeHeader(rawFile)
    .replace(/[_-]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const matchedUnit = units
    .flatMap((unit) =>
      unitSourceVariants(unit).map((variant) => ({
        unit,
        variant
      }))
    )
    .sort((a, b) => b.variant.length - a.variant.length)
    .find(({ variant }) => normalizedSource.includes(variant));

  if (matchedUnit) {
    return matchedUnit.unit.city || matchedUnit.unit.name;
  }

  return inferCityFromSource(origem);
}

function resolveUnitForCity(city: string, units: UnitInfo[]) {
  const normalizedCity = normalizeHeader(city || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedCity) return null;

  return (
    units.find((unit) =>
      [unit.name, unit.city].some(
        (value) =>
          normalizeHeader(value || "").replace(/\s+/g, " ").trim() ===
          normalizedCity
      )
    ) || null
  );
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
      nome: firstMatchingValue(row, ["nome", "name", "cliente", "lead", "contato"]),
      whatsapp: extractPhoneFromRow(row),
      email: firstMatchingValue(row, ["email", "e-mail", "mail"]),
      cidade:
        firstMatchingValue(row, ["cidade", "municipio", "município", "city", "localidade"]) ||
        inferCityFromSource(origem),
      origem,
      status: "Novo" as Status,
      tipo: inferDemandTypeFromSource(origem),
      ownerUserId: null,
      unitId: null,
      criadoEm: new Date().toISOString(),
      debtBalance: extractDebtBalanceFromRow(row),
      delinquentDueDate: extractDueDateFromRow(row),
      evoCustomerId: extractEvoCustomerIdFromRow(row),
      surname: extractSurnameFromRow(row),
      lastContractDescription: extractLastContractDescriptionFromRow(row),
      lastContractStart: extractLastContractStartFromRow(row),
      lastContractValue: extractLastContractValueFromRow(row)
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
      debtBalance: 0,
      delinquentDueDate: "",
      evoCustomerId: "",
      surname: "",
      lastContractDescription: "",
      lastContractStart: "",
      lastContractValue: 0
    });
  }

  return leads;
}

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const deletingImportRef = useRef(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<OwnerUser[]>([]);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [delinquentBatches, setDelinquentBatches] = useState<DelinquentBatch[]>([]);
  const [delinquentItems, setDelinquentItems] = useState<DelinquentItem[]>([]);
  const [delinquentImportDate, setDelinquentImportDate] = useState(todayLocalDateKey());
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [promises, setPromises] = useState<Record<string, string>>({});
  const [promiseDrafts, setPromiseDrafts] = useState<Record<string, string>>({});
  const [promiseLoadError, setPromiseLoadError] = useState("");
  const [pendingPromiseId, setPendingPromiseId] = useState<string | null>(null);
  const [savingPromiseId, setSavingPromiseId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("Todas");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [sortOrder, setSortOrder] = useState<"recent" | "az" | "za">("recent");
  const [activeTab, setActiveTab] = useState<DemandType>("opportunity");
  const importTypeRef = useRef<DemandType>("opportunity");
  const [notice, setNotice] = useState("");
  const [importAudit, setImportAudit] = useState<ImportAudit | null>(null);
  const [savedImportAudits, setSavedImportAudits] = useState<SavedImportAudit[]>([]);
  const [showFilesTab, setShowFilesTab] = useState(false);
  const [showActivityTab, setShowActivityTab] = useState(false);
  const [showCoordinatorTab, setShowCoordinatorTab] = useState(false);
  const [coordinatorOwnerFilter, setCoordinatorOwnerFilter] = useState("Todos");
  const [coordinatorUnitFilter, setCoordinatorUnitFilter] = useState("Todas");
  const [coordinatorFrom, setCoordinatorFrom] = useState("");
  const [coordinatorTo, setCoordinatorTo] = useState("");
  const [contactEvents, setContactEvents] = useState<ContactEvent[]>([]);
  const [contactEventsError, setContactEventsError] = useState("");
  const [activityOwnerFilter, setActivityOwnerFilter] = useState("Todos");
  const [activityDemandFilter, setActivityDemandFilter] = useState("Todos");
  const [activityDateFilter, setActivityDateFilter] = useState("");
  const [fileSearch, setFileSearch] = useState("");
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
          supabaseAllRows<DbLead>(
            "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc,id.desc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_users?select=id,username,display_name,role&active=eq.true&order=display_name.asc"
          ),
          supabaseRequest(
            "/rest/v1/commercial_units?select=id,name,city&active=eq.true&order=name.asc"
          ),
          supabaseAllRows<DelinquentBatch>(
            "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc,id.desc"
          ),
          supabaseAllRows<DelinquentItem>(
            "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,due_date,payment_link,created_at&order=created_at.desc,id.desc"
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
          leadResponse,
          ownerResponse.json() as Promise<OwnerUser[]>,
          unitResponse.json() as Promise<UnitInfo[]>,
          batchResponse,
          delinquentItemResponse
        ]);

        if (!cancelled) {
          setSessionInfo(session);
          setLeads(leadRows.map(mapDbLead));
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
      if (refreshing || deletingImportRef.current) return;
      refreshing = true;

      try {
        const [leadResponse, batchResponse, delinquentItemResponse] = await Promise.all([
          supabaseAllRows<DbLead>(
            "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc,id.desc"
          ),
          supabaseAllRows<DelinquentBatch>(
            "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc,id.desc"
          ),
          supabaseAllRows<DelinquentItem>(
            "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,due_date,payment_link,created_at&order=created_at.desc,id.desc"
          )
        ]);

        const [rows, batchRows, delinquentItemRows] = await Promise.all([
          leadResponse,
          batchResponse,
          delinquentItemResponse
        ]);

        if (!cancelled && !deletingImportRef.current) {
          setLeads(rows.map(mapDbLead));
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
    }, 10000);

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

  useEffect(() => {
    if (!loaded || !sessionInfo) return;
    let canceled = false;
    async function loadAudits() {
      try {
        const response = await fetch("/api/import-audits", { cache: "no-store" });
        if (!response.ok) return; // Migração opcional ainda não aplicada.
        const audits = await response.json() as SavedImportAudit[];
        if (!canceled) setSavedImportAudits(audits);
      } catch {
        // Histórico indisponível: contagens atuais permanecem visíveis.
      }
    }
    void loadAudits();
    return () => { canceled = true; };
  }, [loaded, sessionInfo]);

  useEffect(() => {
    if ((!showActivityTab && !showCoordinatorTab) || !sessionInfo) return;
    let stopped = false;
    async function loadEvents() {
      try {
        const response = await fetch("/api/contact-events", { cache: "no-store" });
        if (!response.ok) {
          if (!stopped) setContactEventsError("O histórico precisa ser ativado no Supabase para exibir os atendimentos.");
          return;
        }
        const records = await response.json() as ContactEvent[];
        if (!stopped) {
          setContactEvents(records);
          setContactEventsError("");
        }
      } catch {
        if (!stopped) setContactEventsError("Não foi possível carregar os atendimentos.");
      }
    }
    void loadEvents();
    const refresh = window.setInterval(() => { void loadEvents(); }, 30000);
    return () => { stopped = true; window.clearInterval(refresh); };
  }, [showActivityTab, showCoordinatorTab, sessionInfo]);

  const ownerById = useMemo(
    () => new Map(owners.map((owner) => [owner.id, owner] as const)),
    [owners]
  );

  const currentOwnerId = useMemo(() => {
    if (!sessionInfo) return null;
    // A conta comercial compartilhada tem identificador de sessão próprio.
    // Contas individuais usam o ID autenticado do banco.
    if (sessionInfo.userId && sessionInfo.userId !== "setor-comercial") {
      return sessionInfo.userId;
    }
    return owners.find(
      (owner) => owner.username.toLowerCase() === sessionInfo.username.toLowerCase()
    )?.id || null;
  }, [owners, sessionInfo]);

  const tabLeads = useMemo(
    () => leads.filter((lead) => lead.tipo === activeTab),
    [leads, activeTab]
  );

  const importedFolders = useMemo(() => {
    if (!sessionInfo || (sessionInfo.role !== "admin" && !currentOwnerId)) return [];

    const folders = new Map<string, {
      key: string; filename: string; ownerId: string; unitId: string | null;
      demandType: "opportunity" | "inactive"; ids: string[]; importedAt: string | null;
    }>();

    for (const lead of leads) {
      if (lead.tipo !== "opportunity" && lead.tipo !== "inactive") continue;
      const filename = lead.origem.split(" • ")[0].trim();
      if (!/\.(xlsx?|xlsm|xlsb|ods|csv|tsv|txt|pdf|docx?|json)$/i.test(filename)) continue;
      if (sessionInfo.role !== "admin" && sessionInfo.unitId && lead.unitId !== sessionInfo.unitId) continue;
      if (sessionInfo.role !== "admin" && lead.ownerUserId !== currentOwnerId) continue;
      if (!lead.ownerUserId) continue;

      const key = JSON.stringify([lead.tipo, filename, lead.ownerUserId, lead.unitId]);
      const folder = folders.get(key) || {
        key, filename, ownerId: lead.ownerUserId, unitId: lead.unitId,
        demandType: lead.tipo, ids: [], importedAt: lead.criadoEm
      };
      folder.ids.push(lead.id);
      if (!folder.importedAt || new Date(lead.criadoEm).getTime() < new Date(folder.importedAt).getTime()) {
        folder.importedAt = lead.criadoEm;
      }
      folders.set(key, folder);
    }

    return [...folders.values()].sort((a, b) => a.filename.localeCompare(b.filename, "pt-BR"));
  }, [leads, sessionInfo, currentOwnerId]);

  const auditByFolder = useMemo(() => {
    const map = new Map<string, SavedImportAudit>();
    for (const audit of savedImportAudits) {
      const key = JSON.stringify([audit.demand_type, audit.filename, audit.owner_user_id]);
      const prior = map.get(key);
      if (!prior || new Date(audit.imported_at).getTime() > new Date(prior.imported_at).getTime()) {
        map.set(key, audit);
      }
    }
    return map;
  }, [savedImportAudits]);

  const visibleImportedFolders = useMemo(() => {
    const search = normalizeHeader(fileSearch);
    return importedFolders.filter((folder) => {
      if (!search) return true;
      return normalizeHeader([
        folder.filename,
        folder.demandType === "inactive" ? "inativos" : "oportunidades",
        owners.find((owner) => owner.id === folder.ownerId)?.display_name || "",
        units.find((unit) => unit.id === folder.unitId)?.name || ""
      ].join(" ")).includes(search);
    });
  }, [importedFolders, fileSearch, owners, units]);

  const visibleDelinquentImports = useMemo(() => {
    if (!sessionInfo) return [];
    const search = normalizeHeader(fileSearch);
    return delinquentBatches.filter((batch) => {
      if (sessionInfo.role !== "admin" && sessionInfo.unitId && batch.unit_id !== sessionInfo.unitId) return false;
      if (sessionInfo.role !== "admin" && batch.owner_user_id !== currentOwnerId) return false;
      return !search || normalizeHeader([
        batch.source, "inadimplentes", batch.batch_date,
        owners.find((owner) => owner.id === batch.owner_user_id)?.display_name || "",
        units.find((unit) => unit.id === batch.unit_id)?.name || ""
      ].join(" ")).includes(search);
    });
  }, [sessionInfo, delinquentBatches, currentOwnerId, fileSearch, owners, units]);

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units]
  );

  const importedCityOptions = useMemo(() => {
    const registeredCities = new Set(
      units.flatMap((unit) => [unit.name, unit.city])
        .map((value) => normalizeHeader(value || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    );

    const cities = new Map<string, string>();

    for (const lead of tabLeads) {
      if (!lead.cidade.trim()) continue;

      const normalized = normalizeHeader(lead.cidade)
        .replace(/\s+/g, " ")
        .trim();

      if (!normalized || registeredCities.has(normalized)) continue;
      if (!cities.has(normalized)) cities.set(normalized, lead.cidade.trim());
    }

    return [...cities.entries()]
      .map(([normalized, label]) => ({
        value: `city:${normalized}`,
        label
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [tabLeads, units]);

  const unitScopedLeads = useMemo(() => {
    if (unitFilter === "Todas") return tabLeads;

    if (unitFilter.startsWith("city:")) {
      const selectedCity = unitFilter.slice(5);

      return tabLeads.filter(
        (lead) =>
          lead.cidade &&
          normalizeHeader(lead.cidade).replace(/\s+/g, " ").trim() ===
            selectedCity
      );
    }

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

  useEffect(() => {
    if (!loaded || !sessionInfo || activeTab !== "delinquent") return;
    let canceled = false;
    async function loadPromises() {
      try {
        const response = await fetch("/api/delinquent-promise", { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) setPromiseLoadError("As datas não estão disponíveis. Verifique a configuração no Supabase.");
          return;
        }
        const rows = await response.json() as {id:string;promised_payment_date:string|null}[];
        if (!canceled) {
          setPromises(Object.fromEntries(rows.filter(row => row.promised_payment_date).map(row => [row.id, row.promised_payment_date as string])));
          setPromiseLoadError("");
        }
      } catch {
        if (!canceled) setPromiseLoadError("Não foi possível carregar as datas de pagamento.");
      }
    }
    void loadPromises();
    return () => { canceled = true; };
  }, [loaded, sessionInfo, activeTab, delinquentItems]);

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

  function delinquentStage(lead: Lead): DelinquentStage {
    const item = delinquentItemByLead.get(lead.id);
    if (item?.payment_status === "paid") return "Pago";
    if (item && (promises[item.id] || pendingPromiseId === item.id)) return "Pagará";
    return lead.status === "Novo" ? "Novo" : "Em contato";
  }

  function visualStatus(lead: Lead) {
    if (lead.tipo !== "delinquent") return statusClass(lead.status);
    const stage = delinquentStage(lead);
    return stage === "Pagará" ? "promise" : stage === "Pago" ? "converted"
      : stage === "Em contato" ? "contact" : "new";
  }

  async function changeDelinquentStage(lead: Lead, item: DelinquentItem | null, stage: DelinquentStage) {
    if (stage === "Pago") {
      if (!item) return setNotice("Não existe uma cobrança vinculada para registrar o pagamento.");
      if (item.payment_status !== "paid") await registerDelinquentPayment(lead, item);
      return;
    }
    if (stage === "Pagará") {
      if (!item) return setNotice("Não existe uma cobrança vinculada para escolher a data.");
      setPendingPromiseId(item.id);
      setPromiseDrafts(current => ({ ...current, [item.id]: promises[item.id] || "" }));
      return;
    }
    setPendingPromiseId(null);
    if (item && promises[item.id] && !(await savePromiseDate(item.id, null))) return;
    await updateStatus(lead.id, stage);
  }

  async function savePromiseDate(itemId: string, date: string | null) {
    setSavingPromiseId(itemId);
    try {
      const response = await fetch("/api/delinquent-promise", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, date })
      });
      const data = await response.json() as { promised_payment_date?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao registrar data do pagamento.");
      if (data.promised_payment_date !== date) {
        throw new Error("O banco não confirmou a data escolhida. Tente novamente.");
      }
      setPromises(current => {
        const next = { ...current };
        if (data.promised_payment_date) next[itemId] = data.promised_payment_date;
        else delete next[itemId];
        return next;
      });
      setPromiseDrafts(current => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      setPendingPromiseId(null);
      setNotice(date ? `Data combinada para pagamento salva: ${date.split("-").reverse().join("/")}.` : "Promessa de pagamento removida.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar a data.");
      // Mantém o campo e a data escolhida para permitir nova tentativa.
      if (date) setPendingPromiseId(itemId);
      return false;
    } finally {
      setSavingPromiseId(null);
    }
  }

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
        getDemandLabel(lead.tipo),
        ownerName
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

      const statusOk = statusFilter === "Todos" || (activeTab === "delinquent" ? delinquentStage(lead) === statusFilter : lead.status === statusFilter);
      const ownerOk = ownerFilter === "Todos" || lead.ownerUserId === ownerFilter;

      return matches && statusOk && ownerOk;
    });

    // Prioriza demandas ainda não trabalhadas independentemente da ordenação
    // escolhida. "Novo" sempre fica no topo; as demais etapas seguem o fluxo comercial.
    const statusPriority: Record<Status, number> = {
      "Novo": 0,
      "Em contato": 1,
      "Interessado": 2,
      "Sem retorno": 3,
      "Convertido": 4
    };

    return result.sort((a, b) => {
      const delinquentPriority: Record<DelinquentStage, number> = { "Novo": 0, "Em contato": 1, "Pagará": 2, "Pago": 3 };
      const priorityDifference = activeTab === "delinquent"
        ? delinquentPriority[delinquentStage(a)] - delinquentPriority[delinquentStage(b)]
        : statusPriority[a.status] - statusPriority[b.status];
      if (priorityDifference !== 0) return priorityDifference;

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
  }, [dateScopedLeads, query, statusFilter, ownerFilter, ownerById, sortOrder, activeTab, promises, pendingPromiseId, delinquentItemByLead]);

  const filteredStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of filtered) {
      const stage = activeTab === "delinquent" ? delinquentStage(lead) : lead.status;
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [filtered, activeTab, delinquentItemByLead, promises, pendingPromiseId]);

  async function reloadDelinquentTracking() {
    const [leadResponse, batchResponse, delinquentItemResponse] = await Promise.all([
      supabaseAllRows<DbLead>(
        "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc,id.desc"
      ),
      supabaseAllRows<DelinquentBatch>(
        "/rest/v1/commercial_delinquent_batches?select=id,batch_date,owner_user_id,unit_id,source,created_at&order=batch_date.desc,id.desc"
      ),
      supabaseAllRows<DelinquentItem>(
        "/rest/v1/commercial_delinquent_items?select=id,batch_id,lead_id,initial_balance,recovered_amount,payment_status,due_date,payment_link,created_at&order=created_at.desc,id.desc"
      )
    ]);

    const [leadRows, batchRows, delinquentItemRows] = await Promise.all([
      leadResponse,
      batchResponse,
      delinquentItemResponse
    ]);

    setLeads(leadRows.map(mapDbLead));
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
            initial_balance: Number(lead.debtBalance || 0).toFixed(2),
            due_date: lead.delinquentDueDate || null,
            evo_customer_id: lead.evoCustomerId || null,
            surname: lead.surname || null,
            last_contract_description: lead.lastContractDescription || null,
            last_contract_start: lead.lastContractStart || null,
            last_contract_value:
              Number(lead.lastContractValue || 0) > 0
                ? Number(lead.lastContractValue || 0).toFixed(2)
                : null,
            payment_link: null
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
      contractEndCount: number;
      initialBalance: number | string;
    };

    await reloadDelinquentTracking();
    setDateFilter(delinquentImportDate);

    setNotice(
      `Carteira de ${new Date(`${delinquentImportDate}T12:00:00`).toLocaleDateString("pt-BR")} atualizada: ${result.total} inadimplente(s) · ${result.contractEndCount}/${result.total} com Fim do último contrato · saldo inicial ${formatCurrency(Number(result.initialBalance || 0))}.`
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

  async function addImported(items: Lead[], filename: string, sourceRows: number) {
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
      { id: string; whatsapp?: string; city?: string; unit_id?: string }
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

      const update: {
        id: string;
        whatsapp?: string;
        city?: string;
        unit_id?: string;
      } = {
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

      if (!existing.unitId && imported.unitId) {
        update.unit_id = imported.unitId;
      }

      if (update.whatsapp || update.city || update.unit_id) {
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
      // Processa lotes menores e contabiliza a quantidade realmente aceita pelo banco.
      // Assim não se confunde total da planilha com novos registros cadastrados.
      for (let offset = 0; offset < fresh.length; offset += 100) {
        const chunk = fresh.slice(offset, offset + 100);
        const response = await supabaseRequest(
          "/rest/v1/rpc/commercial_import_leads",
          {
            method: "POST",
            body: JSON.stringify({ p_leads: chunk.map(serializeLead) })
          }
        );
        const savedRows = (await response.json()) as DbLead[];
        const saved = savedRows.map(mapDbLead);
        added += saved.length;
        skipped += Math.max(0, chunk.length - saved.length);
        if (saved.length) {
          setLeads((current) => {
            const next = new Map(current.map((lead) => [lead.id, lead] as const));
            for (const lead of saved) next.set(lead.id, lead);
            return [...next.values()];
          });
        }
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
          updatedRows.map((row) => [row.id, mapDbLead(row)] as const)
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

    const totalRead = items.length;
    let databaseCount: number | null = null;
    try {
      const allSavedRows = await supabaseAllRows<Pick<DbLead, "id" | "source" | "demand_type" | "owner_user_id">>(
        "/rest/v1/commercial_leads?select=id,source,demand_type,owner_user_id&demand_type=eq." +
        encodeURIComponent(items[0]?.tipo || "opportunity") + "&order=id.asc"
      );
      databaseCount = allSavedRows.filter((row) =>
        row.source.split(" • ")[0].trim() === filename &&
        row.owner_user_id === currentScopeOwner
      ).length;
    } catch {
      // Uma consulta de auditoria não deve ocultar uma importação já concluída.
      databaseCount = null;
    }
    const importWarning = (added + enriched + skipped < totalRead)
      ? "A soma dos resultados não corresponde ao total lido. Confira o banco antes de reimportar."
      : null;

    setImportAudit({
      filename, read: sourceRows, valid: totalRead, saved: added, updated: enriched,
      alreadyExistingOrRejected: skipped, databaseCount, warning: importWarning
    });
    // Registra os números da operação para as futuras visitas ao Gerenciar arquivos.
    // Não transforma um histórico antigo desconhecido em valor zero.
    try {
      const response = await fetch("/api/import-audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename, demandType: items[0]?.tipo || "opportunity",
          unitId: sessionInfo?.unitId || null, sourceRows, validRows: totalRead,
          saved: added, updated: enriched, notInserted: skipped
        })
      });
      if (response.ok) {
        const audit = await response.json() as SavedImportAudit;
        setSavedImportAudits((previous) => [audit, ...previous]);
      } else {
        setNotice("A importação foi executada, mas o histórico permanente ainda precisa ser configurado no Supabase.");
      }
    } catch {
      setNotice("A importação foi executada, mas não foi possível registrar o histórico permanente.");
    }

    const parts = [
      `Arquivo processado: ${totalRead} oportunidade(s) lida(s)`,
      `${added} novo(s) registro(s) salvo(s)`
    ];

    if (enriched) parts.push(`${enriched} cadastro(s) existente(s) atualizado(s)`);
    if (skipped) parts.push(`${skipped} já existente(s) ou não inserido(s) pelo banco`);

    // A contagem de novos cadastros não representa o tamanho da planilha:
    // registros previamente existentes são preservados para evitar duplicação.
    setNotice(parts.join(" · ") + (
      skipped
        ? ". Registros já existentes não são duplicados. Confira o total geral da carteira antes de repetir a importação."
        : "."
    ));

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
    setImportAudit(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let imported: Lead[] = [];
      let totalSourceRows = 0;

      if (["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext || "")) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        for (const sheetName of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            workbook.Sheets[sheetName],
            { defval: "" }
          );

          totalSourceRows += rows.length;
          imported.push(...rowsToLeads(rows, `${file.name} • ${sheetName}`));
        }
      } else if (ext === "json") {
        const parsed = JSON.parse(await file.text());
        const rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.leads)
            ? parsed.leads
            : [parsed];

        totalSourceRows = rows.length;
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

      totalSourceRows ||= imported.length;
      imported = imported.map((lead) => {
        const resolvedCity =
          lead.cidade.trim() || resolveImportCity(lead.origem, units);
        const resolvedUnit = resolveUnitForCity(resolvedCity, units);

        return {
          ...lead,
          cidade: resolvedUnit?.city || resolvedCity,
          unitId: resolvedUnit?.id || lead.unitId || null,
          tipo: importTypeRef.current
        };
      });

      await addImported(imported, file.name, totalSourceRows);
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

      const saved = mapDbLead(rows[0]);

      setLeads((current) =>
        current.map((lead) => (lead.id === id ? saved : lead))
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Não foi possível atualizar o status."
      );
    }
  }

  async function deleteImportedFolder(folder: (typeof importedFolders)[number]) {
    if (processing || deletingImportRef.current || !sessionInfo) return;
    if (folder.demandType !== "opportunity" && folder.demandType !== "inactive") return;
    if (sessionInfo.role !== "admin" && folder.ownerId !== currentOwnerId) return;
    if (sessionInfo.role !== "admin" && sessionInfo.unitId && folder.unitId !== sessionInfo.unitId) return;

    const ok = window.confirm(
      `Excluir a pasta "${folder.filename}" e seus ${folder.ids.length} registro(s)?\n\nEsta ação não poderá ser desfeita. Outras pastas não serão excluídas.`
    );
    if (!ok) return;

    deletingImportRef.current = true;
    setProcessing(true);
    let completed = false;
    try {
      // Confirma o conjunto existente no servidor para não operar com uma lista antiga.
      const before = await supabaseAllRows<{
        id: string; source: string; demand_type: DemandType;
        owner_user_id: string | null; unit_id: string | null;
      }>(
        "/rest/v1/commercial_leads?select=id,source,demand_type,owner_user_id,unit_id&demand_type=eq." +
        encodeURIComponent(folder.demandType) +
        "&owner_user_id=eq." + encodeURIComponent(folder.ownerId) +
        "&unit_id=" + (folder.unitId ? "eq." + encodeURIComponent(folder.unitId) : "is.null") +
        "&order=id.asc"
      );
      const ids = before
        .filter((item) => item.source.split(" • ")[0].trim() === folder.filename)
        .map((item) => item.id);

      if (!ids.length) {
        throw new Error("Este arquivo não possui mais registros. Atualize a página para conferir.");
      }
      if (ids.length !== folder.ids.length) {
        throw new Error("A pasta foi modificada por outro usuário. Atualize a página antes de excluir.");
      }

      for (let index = 0; index < ids.length; index += 75) {
        const chunk = ids.slice(index, index + 75);
        const response = await supabaseRequest(
          `/rest/v1/commercial_leads?id=in.(${chunk.map(encodeURIComponent).join(",")})&demand_type=eq.${folder.demandType}&owner_user_id=eq.${encodeURIComponent(folder.ownerId)}&unit_id=${folder.unitId ? `eq.${encodeURIComponent(folder.unitId)}` : "is.null"}&select=id`,
          { method: "DELETE", headers: { Prefer: "return=representation" } }
        );
        const deleted = (await response.json()) as { id: string }[];
        if (deleted.length !== chunk.length) {
          throw new Error("O banco não permitiu excluir todos os registros desta pasta.");
        }
      }

      // Confere novamente no banco: só informa sucesso quando a pasta realmente sumiu.
      const remaining = await supabaseAllRows<{ id: string; source: string }>(
        "/rest/v1/commercial_leads?select=id,source&demand_type=eq." +
        encodeURIComponent(folder.demandType) +
        "&owner_user_id=eq." + encodeURIComponent(folder.ownerId) +
        "&unit_id=" + (folder.unitId ? "eq." + encodeURIComponent(folder.unitId) : "is.null") +
        "&order=id.asc"
      );
      if (remaining.some((item) => item.source.split(" • ")[0].trim() === folder.filename)) {
        throw new Error("Ainda existem registros desta pasta no banco. A exclusão não foi concluída.");
      }
      completed = true;
      setNotice(`Pasta "${folder.filename}" excluída com sucesso: ${ids.length} registro(s).`);
    } catch (err) {
      setNotice(
        (err instanceof Error ? err.message : "Não foi possível excluir a pasta.") +
        " A lista será atualizada com os dados reais do banco."
      );
    } finally {
      try {
        const rows = await supabaseAllRows<DbLead>(
          "/rest/v1/commercial_leads?select=id,name,whatsapp,email,city,source,status,demand_type,owner_user_id,unit_id,created_at&order=created_at.desc,id.desc"
        );
        setLeads(rows.map(mapDbLead));
        if (completed) {
          const stillHasCity = rows.some(
            (lead) => lead.demand_type === activeTab &&
              normalizeHeader(lead.city || "").replace(/\\s+/g, " ").trim() === unitFilter.slice(5)
          );
          if (unitFilter.startsWith("city:") && !stillHasCity) setUnitFilter("Todas");
        }
      } catch {
        setNotice("Não foi possível confirmar a lista atualizada. Recarregue a página para conferir os registros.");
      }
      deletingImportRef.current = false;
      setProcessing(false);
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
    const delinquentItem =
      lead.tipo === "delinquent"
        ? delinquentItemByLead.get(lead.id) || null
        : null;
    const openBalance = delinquentItem
      ? Math.max(
          0,
          Number(delinquentItem.initial_balance || 0) -
            Number(delinquentItem.recovered_amount || 0)
        )
      : 0;

    const payload = {
      nome: lead.nome,
      ddi: "55",
      phone,
      unidade:
        (lead.unitId ? unitById.get(lead.unitId)?.name : null) ||
        lead.cidade ||
        sessionInfo?.unitName ||
        "",
      cobranca:
        lead.tipo === "delinquent" && delinquentItem
          ? {
              template: "cobranca_mensalidade_atraso",
              variavel1: lead.nome.trim(),
              variavel2: formatTemplateDate(delinquentItem.due_date),
              variavel3: formatTemplateAmount(
                Number(delinquentItem.initial_balance || 0)
              ),
              variavel4: "Dentro do seu App da 26Fit!"
            }
          : null
    };

    try {
      await navigator.clipboard.writeText(
        [
          `Nome: ${lead.nome}`,
          "DDI: +55",
          `Telefone: ${phone}`,
          delinquentItem
            ? `Fim do último contrato: ${formatTemplateDate(delinquentItem.due_date) || "não informado"}`
            : null,
          delinquentItem
            ? `Débito: ${formatTemplateAmount(Number(delinquentItem.initial_balance || 0))}`
            : null,
          delinquentItem
            ? "Pagamento: Dentro do seu App da 26Fit!"
            : null
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch {}

    // Cada clique gera uma tentativa idempotente de registro no banco,
    // sem afirmar que houve envio de mensagem.
    const eventId = crypto.randomUUID();
    // O registro não deve atrasar a abertura do Scale. Em caso de erro,
    // o contato continua sendo aberto, mas não é contado como registrado.
    void (async () => {
      try {
        const logResponse = await fetch("/api/contact-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, eventId }),
          signal: AbortSignal.timeout(8000)
        });
        if (!logResponse.ok) {
          console.warn("[Leads Comercial] Atendimento aberto sem registro de auditoria.");
        }
      } catch {
        console.warn("[Leads Comercial] Auditoria de início de atendimento indisponível.");
      }
    })();

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
    if (unitFilter === "Todas") return leads;

    if (unitFilter.startsWith("city:")) {
      const selectedCity = unitFilter.slice(5);

      return leads.filter(
        (lead) =>
          lead.cidade &&
          normalizeHeader(lead.cidade).replace(/\s+/g, " ").trim() ===
            selectedCity
      );
    }

    return leads.filter((lead) => {
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

  const visibleContactEvents = useMemo(() => contactEvents.filter((event) =>
    (activityOwnerFilter === "Todos" || event.actor_user_id === activityOwnerFilter) &&
    (activityDemandFilter === "Todos" || event.demand_type === activityDemandFilter) &&
    (!activityDateFilter || new Date(event.occurred_at).toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"}) === activityDateFilter)
  ), [contactEvents, activityOwnerFilter, activityDemandFilter, activityDateFilter]);

  // Datas filtram os inícios de atendimento, não a data da conversão.
  // Status são a fotografia atual de cada carteira (sem histórico de mudança).
  const coordinatorData = useMemo(() => {
    const scopedLeads = leads.filter((lead) =>
      (coordinatorOwnerFilter === "Todos" || lead.ownerUserId === coordinatorOwnerFilter) &&
      (coordinatorUnitFilter === "Todas" || lead.unitId === coordinatorUnitFilter)
    );
    const scopedEvents = contactEvents.filter((event) => {
      if (coordinatorOwnerFilter !== "Todos" && event.actor_user_id !== coordinatorOwnerFilter) return false;
      if (coordinatorUnitFilter !== "Todas" && event.unit_id !== coordinatorUnitFilter) return false;
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date(event.occurred_at));
      return (!coordinatorFrom || date >= coordinatorFrom) && (!coordinatorTo || date <= coordinatorTo);
    });
    const opportunities = scopedLeads.filter((lead) => lead.tipo === "opportunity");
    const inactives = scopedLeads.filter((lead) => lead.tipo === "inactive");
    const delinquent = scopedLeads.filter((lead) => lead.tipo === "delinquent");
    const startedLeads = new Set(scopedEvents.map((event) => event.lead_id).filter(Boolean));
    const byUser = owners.filter((owner) => owner.role !== "admin").map((owner) => {
      const userLeads = scopedLeads.filter((lead) => lead.ownerUserId === owner.id);
      const userEvents = scopedEvents.filter((event) => event.actor_user_id === owner.id);
      const userOpportunity = userLeads.filter((lead) => lead.tipo === "opportunity");
      const converted = userOpportunity.filter((lead) => lead.status === "Convertido").length;
      return {
        id: owner.id, name: owner.display_name, username: owner.username,
        portfolio: userOpportunity.length,
        newCount: userOpportunity.filter((lead) => lead.status === "Novo").length,
        inContact: userOpportunity.filter((lead) => lead.status === "Em contato").length,
        interested: userOpportunity.filter((lead) => lead.status === "Interessado").length,
        noReturn: userOpportunity.filter((lead) => lead.status === "Sem retorno").length,
        converted,
        attempts: userEvents.length,
        unique: new Set(userEvents.map((event) => event.lead_id).filter(Boolean)).size,
        conversion: userOpportunity.length ? converted / userOpportunity.length * 100 : 0
      };
    }).filter((user) =>
      coordinatorOwnerFilter === "Todos" ? user.portfolio > 0 || user.attempts > 0
        : user.id === coordinatorOwnerFilter
    ).sort((a, b) => b.attempts - a.attempts || b.converted - a.converted);
    return {
      portfolio: opportunities.length,
      newCount: opportunities.filter((lead) => lead.status === "Novo").length,
      inContact: opportunities.filter((lead) => lead.status === "Em contato").length,
      interested: opportunities.filter((lead) => lead.status === "Interessado").length,
      noReturn: opportunities.filter((lead) => lead.status === "Sem retorno").length,
      converted: opportunities.filter((lead) => lead.status === "Convertido").length,
      reactivated: inactives.filter((lead) => lead.status === "Convertido").length,
      inactiveTotal: inactives.length,
      delinquentTotal: delinquent.length,
      attempts: scopedEvents.length,
      unique: startedLeads.size,
      conversion: opportunities.length ? opportunities.filter((lead) => lead.status === "Convertido").length / opportunities.length * 100 : 0,
      byUser
    };
  }, [leads, contactEvents, owners, coordinatorOwnerFilter, coordinatorUnitFilter, coordinatorFrom, coordinatorTo]);

  function changeTab(tab: DemandType) {
    setShowFilesTab(false);
    setShowActivityTab(false);
    setShowCoordinatorTab(false);
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

          {activeTab === "delinquent" && (
            <a
              className="ghost-btn delinquent-history-link"
              href="/dashboard/inadimplentes"
            >
              Histórico diário
            </a>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.pdf,.docx,.txt,.json"
            onChange={handleFile}
            hidden
          />

          {!showFilesTab && !showActivityTab && !showCoordinatorTab && <button
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
          </button>}

          <button className="ghost-btn" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <section className="demand-tabs" aria-label="Tipo de demanda">
        <button
          type="button"
          className={!showFilesTab && !showActivityTab && !showCoordinatorTab && activeTab === "opportunity" ? "demand-tab active opportunity" : "demand-tab opportunity"}
          onClick={() => changeTab("opportunity")}
        >
          <span>Oportunidades</span>
          <strong>{opportunityCount}</strong>
        </button>

        <button
          type="button"
          className={!showFilesTab && !showActivityTab && !showCoordinatorTab && activeTab === "delinquent" ? "demand-tab active delinquent" : "demand-tab delinquent"}
          onClick={() => changeTab("delinquent")}
        >
          <span>Inadimplentes</span>
          <strong>{delinquentCount}</strong>
        </button>

        <button
          type="button"
          className={!showFilesTab && !showActivityTab && !showCoordinatorTab && activeTab === "inactive" ? "demand-tab active inactive" : "demand-tab inactive"}
          onClick={() => changeTab("inactive")}
        >
          <span>Inativos</span>
          <strong>{inactiveCount}</strong>
        </button>
        {sessionInfo && (
          <button
            type="button"
            className={showFilesTab ? "demand-tab files active" : "demand-tab files"}
            onClick={() => { setShowFilesTab(true); setShowActivityTab(false); setShowCoordinatorTab(false); setNotice(""); }}
          >
            <span>Gerenciar arquivos</span>
            <strong>{importedFolders.length + visibleDelinquentImports.length}</strong>
          </button>
        )}
        <button
          type="button"
          className={showActivityTab ? "demand-tab files active" : "demand-tab files"}
          onClick={() => { setShowActivityTab(true); setShowFilesTab(false); setShowCoordinatorTab(false); setNotice(""); }}
        >
          <span>Atendimentos</span>
          <strong>↗</strong>
        </button>
        {sessionInfo?.role === "admin" && (
          <button
            type="button"
            className={showCoordinatorTab ? "demand-tab coordinator-tab active" : "demand-tab coordinator-tab"}
            onClick={() => { setShowCoordinatorTab(true); setShowFilesTab(false); setShowActivityTab(false); setNotice(""); }}
          >
            <span>Coordenação Comercial</span>
            <strong>◎</strong>
          </button>
        )}
      </section>

      {showCoordinatorTab && sessionInfo?.role === "admin" ? (
        <section className="file-manager-page coordinator-page" aria-label="Painel da coordenação comercial">
          <div className="file-manager-title">
            <div>
              <p className="eyebrow">GESTÃO DE RESULTADOS</p>
              <h2>Coordenação Comercial</h2>
              <p>Acompanhe a produtividade por colaborador e os status atuais das carteiras.</p>
            </div>
            <span className="file-manager-total">Visão gerencial</span>
          </div>
          <div className="coordinator-filters">
            <label><span>Colaborador</span>
              <select value={coordinatorOwnerFilter} onChange={(e) => setCoordinatorOwnerFilter(e.target.value)}>
                <option value="Todos">Todos os colaboradores</option>
                {owners.filter(owner => owner.role !== "admin").map(owner => (
                  <option key={owner.id} value={owner.id}>{owner.display_name}</option>
                ))}
              </select>
            </label>
            <label><span>Unidade</span>
              <select value={coordinatorUnitFilter} onChange={(e) => setCoordinatorUnitFilter(e.target.value)}>
                <option value="Todas">Todas as unidades</option>
                {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label><span>Inícios de</span><input type="date" value={coordinatorFrom} onChange={(e) => setCoordinatorFrom(e.target.value)} /></label>
            <label><span>Inícios até</span><input type="date" min={coordinatorFrom || undefined} value={coordinatorTo} onChange={(e) => setCoordinatorTo(e.target.value)} /></label>
          </div>
          {contactEventsError && <p className="notice" role="alert">{contactEventsError} Os indicadores de contatos iniciados podem estar incompletos.</p>}
          <div className="coordinator-summary">
            <article><span>Atendimentos iniciados no Scale</span><strong>{coordinatorData.attempts.toLocaleString("pt-BR")}</strong><small>Cliques registrados no período</small></article>
            <article><span>Contatos únicos trabalhados</span><strong>{coordinatorData.unique.toLocaleString("pt-BR")}</strong><small>Contatos distintos com início registrado</small></article>
            <article><span>Oportunidades na carteira</span><strong>{coordinatorData.portfolio.toLocaleString("pt-BR")}</strong><small>Saldo atual, independente das datas</small></article>
            <article><span>Convertidos</span><strong>{coordinatorData.converted.toLocaleString("pt-BR")}</strong><small>Status atual: Convertido</small></article>
            <article><span>Taxa de conversão da carteira</span><strong>{coordinatorData.conversion.toFixed(1)}%</strong><small>Convertidos ÷ oportunidades atuais</small></article>
            <article><span>Interessados</span><strong>{coordinatorData.interested.toLocaleString("pt-BR")}</strong><small>Status atual</small></article>
          </div>
          <div className="coordinator-status">
            <h3>Distribuição atual de oportunidades</h3>
            <div className="lead-status-overview-items">
              {([
                ["Novo", coordinatorData.newCount, "new"],
                ["Em contato", coordinatorData.inContact, "contact"],
                ["Interessado", coordinatorData.interested, "interested"],
                ["Sem retorno", coordinatorData.noReturn, "no-return"],
                ["Convertido", coordinatorData.converted, "converted"]
              ] as const).map(([label, count, cls]) => (
                <span key={label} className={`lead-status-count status-${cls}`}>
                  <span className="lead-status-dot" aria-hidden="true" />{label}
                  <strong>{count.toLocaleString("pt-BR")}</strong>
                </span>
              ))}
            </div>
            <p>Inativos: {coordinatorData.inactiveTotal.toLocaleString("pt-BR")} · Reativados: {coordinatorData.reactivated.toLocaleString("pt-BR")} · Inadimplentes: {coordinatorData.delinquentTotal.toLocaleString("pt-BR")}</p>
          </div>
          <div className="coordinator-staff">
            <h3>Desempenho por colaborador</h3>
            <div className="table-wrap">
              <table className="demand-table coordinator-table">
                <thead><tr>
                  <th>Colaborador</th><th>Inícios no Scale</th><th>Contatos únicos</th>
                  <th>Oportunidades</th><th>Novos</th><th>Em contato</th>
                  <th>Interessados</th><th>Sem retorno</th><th>Convertidos</th><th>Conversão</th>
                </tr></thead>
                <tbody>
                  {coordinatorData.byUser.map(user => (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong><small>@{user.username}</small></td>
                      <td>{user.attempts.toLocaleString("pt-BR")}</td>
                      <td>{user.unique.toLocaleString("pt-BR")}</td>
                      <td>{user.portfolio.toLocaleString("pt-BR")}</td>
                      <td>{user.newCount.toLocaleString("pt-BR")}</td>
                      <td>{user.inContact.toLocaleString("pt-BR")}</td>
                      <td>{user.interested.toLocaleString("pt-BR")}</td>
                      <td>{user.noReturn.toLocaleString("pt-BR")}</td>
                      <td>{user.converted.toLocaleString("pt-BR")}</td>
                      <td>{user.conversion.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {coordinatorData.byUser.length === 0 && (
                    <tr><td colSpan={10}>Nenhum colaborador com dados para os filtros selecionados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="coordinator-disclaimer">
            Os filtros de data se aplicam somente aos inícios no Scale. Os status e as conversões
            representam a situação atual dos contatos, não o número de conversões ocorridas no período.
            Iniciar no Scale não comprova que uma mensagem foi enviada.
          </p>
        </section>
      ) : showActivityTab ? (
        <section className="file-manager-page" aria-label="Histórico de atendimentos">
          <div className="file-manager-title">
            <div>
              <p className="eyebrow">PRODUTIVIDADE COMERCIAL</p>
              <h2>Atendimentos iniciados no Scale</h2>
              <p>Conta os cliques em Iniciar no Scale. Não representa mensagens efetivamente enviadas.</p>
            </div>
            <span className="file-manager-total">{visibleContactEvents.length.toLocaleString("pt-BR")} início(s)</span>
          </div>
          <div className="activity-filters">
            {sessionInfo?.role === "admin" && (
              <select value={activityOwnerFilter} onChange={(e) => setActivityOwnerFilter(e.target.value)} aria-label="Filtrar colaborador">
                <option value="Todos">Todos os colaboradores</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name}</option>)}
              </select>
            )}
            <select value={activityDemandFilter} onChange={(e) => setActivityDemandFilter(e.target.value)} aria-label="Filtrar carteira">
              <option value="Todos">Todas as carteiras</option>
              <option value="opportunity">Oportunidades</option>
              <option value="delinquent">Inadimplentes</option>
              <option value="inactive">Inativos</option>
            </select>
            <input type="date" aria-label="Filtrar data" value={activityDateFilter} onChange={(e) => setActivityDateFilter(e.target.value)} />
          </div>
          {contactEventsError && <p className="notice" role="alert">{contactEventsError}</p>}
          <div className="activity-stats">
            <article><small>Atendimentos iniciados</small><strong>{visibleContactEvents.length.toLocaleString("pt-BR")}</strong></article>
            <article><small>Oportunidades</small><strong>{visibleContactEvents.filter((event) => event.demand_type === "opportunity").length.toLocaleString("pt-BR")}</strong></article>
            <article><small>Inadimplentes</small><strong>{visibleContactEvents.filter((event) => event.demand_type === "delinquent").length.toLocaleString("pt-BR")}</strong></article>
            <article><small>Inativos</small><strong>{visibleContactEvents.filter((event) => event.demand_type === "inactive").length.toLocaleString("pt-BR")}</strong></article>
          </div>
          <div className="file-manager-list">
            {visibleContactEvents.map((event) => (
              <article className="file-manager-item" key={event.id}>
                <div className="file-manager-info">
                  <strong>{ownerById.get(event.actor_user_id)?.display_name || "Colaborador"}</strong>
                  <span>{event.demand_type === "opportunity" ? "Oportunidades" : event.demand_type === "inactive" ? "Inativos" : "Inadimplentes"} · Atendimento iniciado</span>
                  <small>{new Date(event.occurred_at).toLocaleString("pt-BR")} · {event.unit_id ? unitById.get(event.unit_id)?.name || "Unidade" : "Sem unidade"}</small>
                </div>
                <span className="file-manager-total">Iniciado</span>
              </article>
            ))}
            {!visibleContactEvents.length && !contactEventsError && <p className="file-manager-empty">Nenhum atendimento iniciado nos filtros selecionados.</p>}
          </div>
        </section>
      ) : showFilesTab ? (
        <section className="file-manager-page" aria-label="Gerenciamento de arquivos importados">
          <div className="file-manager-title">
            <div>
              <p className="eyebrow">ARQUIVOS IMPORTADOS</p>
              <h2>Gerenciar arquivos</h2>
              <p>{sessionInfo?.role === "admin" ? "Visualize as importações de todos os usuários e gerencie os arquivos." : "Visualize somente os arquivos importados pela sua conta."}</p>
            </div>
            <span className="file-manager-total">{importedFolders.length + visibleDelinquentImports.length} importações</span>
          </div>
          <label className="file-manager-search">
            <span>Buscar por arquivo, carteira, unidade ou responsável</span>
            <input
              type="search"
              value={fileSearch}
              onChange={(event) => setFileSearch(event.target.value)}
              placeholder="Buscar arquivos importados..."
            />
          </label>
          {notice && <div className="notice" role="status">{notice}</div>}
          <div className="file-manager-list">
            {visibleImportedFolders.map((folder) => (
              <article className="file-manager-item" key={folder.key}>
                <div className="file-manager-info">
                  <strong>{folder.filename}</strong>
                  <span>{folder.demandType === "inactive" ? "Inativos" : "Oportunidades"}</span>
                  {(() => {
                    const audit = auditByFolder.get(JSON.stringify([folder.demandType, folder.filename, folder.ownerId]));
                    return (
                      <div className="file-manager-stats">
                        <div><small>Data da importação{audit ? " (última)" : " (primeiro registro)"}</small><strong>{audit ? new Date(audit.imported_at).toLocaleString("pt-BR") : folder.importedAt ? new Date(folder.importedAt).toLocaleDateString("pt-BR") : "Não disponível"}</strong></div>
                        <div><small>Linhas do arquivo{audit ? " (última importação)" : ""}</small><strong>{audit ? audit.source_rows.toLocaleString("pt-BR") : "Sem histórico"}</strong></div>
                        <div><small>Novos cadastrados{audit ? " (última importação)" : ""}</small><strong>{audit ? audit.inserted_rows.toLocaleString("pt-BR") : "Sem histórico"}</strong></div>
                        <div><small>Não cadastrados{audit ? " (última importação)" : ""}</small><strong>{audit ? audit.not_inserted_rows.toLocaleString("pt-BR") : "Sem histórico"}</strong></div>
                        <div><small>Registros atualmente na pasta</small><strong>{folder.ids.length.toLocaleString("pt-BR")}</strong></div>
                        {audit && <div><small>Cadastros atualizados (última importação)</small><strong>{audit.updated_rows.toLocaleString("pt-BR")}</strong></div>}
                      </div>
                    );
                  })()}
                  <small>{ownerById.get(folder.ownerId)?.display_name || "Responsável"} · {folder.unitId ? unitById.get(folder.unitId)?.name || "Unidade" : "Sem unidade definida"}</small>
                </div>
                <button type="button" className="delete-btn" disabled={processing}
                  onClick={() => void deleteImportedFolder(folder)}>
                  Excluir pasta inteira
                </button>
              </article>
            ))}
            {visibleDelinquentImports.map((batch) => (
              <article className="file-manager-item" key={`delinquent-${batch.id}`}>
                <div className="file-manager-info">
                  <strong>{batch.source || "Importação de inadimplentes"}</strong>
                  <span>Inadimplentes · carteira {batch.batch_date.split("-").reverse().join("/")}</span>
                  <div className="file-manager-stats">
                    <div><small>Importado em</small><strong>{new Date(batch.created_at).toLocaleDateString("pt-BR")}</strong></div>
                    <div><small>Novos / não cadastrados</small><strong>Sem histórico</strong></div>
                  </div>
                  <small>{ownerById.get(batch.owner_user_id)?.display_name || "Responsável"} · {batch.unit_id ? unitById.get(batch.unit_id)?.name || "Unidade" : "Sem unidade definida"}</small>
                </div>
                <a className="ghost-btn" href="/dashboard/inadimplentes">Ver histórico</a>
              </article>
            ))}
            {!visibleImportedFolders.length && !visibleDelinquentImports.length && (
              <p className="file-manager-empty">Nenhum arquivo encontrado.</p>
            )}
          </div>
        </section>
      ) : (<>
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
            <>
              <a
                className="ghost-btn delinquent-history-link"
                href="/dashboard/inadimplentes"
              >
                Histórico diário
              </a>

              <label className="batch-date-field">
                Data da carteira
                <input
                  type="date"
                  value={delinquentImportDate}
                  onChange={(event) => setDelinquentImportDate(event.target.value)}
                />
              </label>
            </>
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

      {importAudit && (
        <section className="imported-folders" aria-live="polite" aria-label="Resultado da importação">
          <div className="imported-folders-heading">
            <strong>Conferência da importação: {importAudit.filename}</strong>
            <span>Contagens da planilha e da resposta do Supabase. Não significa que todos os registros sejam novos.</span>
          </div>
          <div className="import-audit-grid">
            <div><strong>{importAudit.read.toLocaleString("pt-BR")}</strong><small>Linhas na planilha</small></div>
            <div><strong>{importAudit.valid.toLocaleString("pt-BR")}</strong><small>Contatos válidos lidos</small></div>
            <div><strong>{importAudit.saved.toLocaleString("pt-BR")}</strong><small>Novos confirmados pela importação</small></div>
            <div><strong>{importAudit.updated.toLocaleString("pt-BR")}</strong><small>Cadastros atualizados</small></div>
            <div><strong>{importAudit.alreadyExistingOrRejected.toLocaleString("pt-BR")}</strong><small>Existentes ou não incluídos</small></div>
            <div><strong>{importAudit.databaseCount === null ? "—" : importAudit.databaseCount.toLocaleString("pt-BR")}</strong><small>Registros atuais deste arquivo no banco</small></div>
          </div>
          {importAudit.warning && <p role="alert">{importAudit.warning}</p>}
        </section>
      )}

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
            {importedCityOptions.length > 0 && (
              <optgroup label="Cidades importadas">
                {importedCityOptions.map((city) => (
                  <option key={city.value} value={city.value}>
                    {city.label}
                  </option>
                ))}
              </optgroup>
            )}
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
            {(activeTab === "delinquent" ? delinquentStatusList : statusList).map((status) => (
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
            <option value="recent">Novos primeiro · mais recentes</option>
            <option value="az">Nome A–Z</option>
            <option value="za">Nome Z–A</option>
          </select>
        </div>

        {activeTab === "delinquent" && promiseLoadError && <div className="notice" role="alert">{promiseLoadError}</div>}
        <div className="lead-status-overview" aria-label="Situação dos contatos exibidos">
          <span className="lead-status-overview-title">
            {filtered.length.toLocaleString("pt-BR")} contato(s) exibido(s) com os filtros atuais
          </span>
          <div className="lead-status-overview-items">
            {(activeTab === "delinquent" ? delinquentStatusList : statusList).map((status) => (
              <span
                key={status}
                className={`lead-status-count status-${status === "Pagará" ? "promise" : status === "Pago" ? "converted" : statusClass(status as Status)}`}
                title={`${filteredStatusCounts[status] ?? 0} contato(s) em ${status}`}
              >
                <span className="lead-status-dot" aria-hidden="true" />
                {activeTab === "inactive" && status === "Convertido" ? "Reativado" : status}
                <strong>{(filteredStatusCounts[status] ?? 0).toLocaleString("pt-BR")}</strong>
              </span>
            ))}
          </div>
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
                    <th>Fim do último contrato</th>
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
                  <tr key={lead.id} className={`lead-status-row status-${visualStatus(lead)}`}>
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
                        <td className="date-cell">
                          {delinquentItem?.due_date
                            ? formatTemplateDate(delinquentItem.due_date)
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
                      <div className="collection-status-cell">
                        <select
                          className={`status-select status-${visualStatus(lead)}`}
                          value={activeTab === "delinquent" ? delinquentStage(lead) : lead.status}
                          onChange={(event) => {
                            if (activeTab === "delinquent") void changeDelinquentStage(lead, delinquentItem, event.target.value as DelinquentStage);
                            else void updateStatus(lead.id, event.target.value as Status);
                          }}
                        >
                          {(activeTab === "delinquent" ? delinquentStatusList : statusList).map((status) => (
                            <option key={status} value={status}>
                              {activeTab === "inactive" && status === "Convertido" ? "Reativado" : status}
                            </option>
                          ))}
                        </select>
                        {activeTab === "delinquent" && delinquentItem &&
                          (delinquentStage(lead) === "Pagará") && (
                            <label className="collection-promise-date">
                              <span>Data combinada</span>
                              <input
                                type="date"
                                aria-label={`Data prometida para pagamento de ${lead.nome}`}
                                value={promiseDrafts[delinquentItem.id] ?? promises[delinquentItem.id] ?? ""}
                                disabled={savingPromiseId === delinquentItem.id || delinquentItem.payment_status === "paid"}
                                onChange={(event) => {
                                  const chosenDate = event.target.value;
                                  setPromiseDrafts(current => ({ ...current, [delinquentItem.id]: chosenDate }));
                                  if (chosenDate) void savePromiseDate(delinquentItem.id, chosenDate);
                                }}
                              />
                            </label>
                          )}
                      </div>
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
                  <td colSpan={activeTab === "delinquent" ? 11 : 7} className="empty">
                    Nenhum {activeTab === "delinquent" ? "inadimplente" : activeTab === "inactive" ? "aluno inativo" : "registro de oportunidade"} encontrado nesta carteira.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      </>)}

      <p className="footer-note">
        Oportunidades, inadimplentes e inativos permanecem em carteiras separadas. Inadimplentes mantêm o histórico financeiro diário e Inativos ficam focados em reativação.
      </p>
    </main>
  );
}
