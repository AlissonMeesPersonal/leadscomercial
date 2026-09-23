import { pbkdf2Sync } from "node:crypto";
import { NextResponse } from "next/server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const SUPABASE_URL = "https://efahamylmoueniflnvzl.supabase.co";
const SUPABASE_KEY = "sb_publishable_TD903F8atFHoM64JbiEEFA_qhnm_PhI";
const COMMERCIAL_ACCESS_SALT = "lc-supa-2026-7f4d2a9bc18e6d53";
const COMMERCIAL_ACCESS_ITERATIONS = 310000;

const OPPORTUNITY_EVENTS = new Set([
  "crm.automation.prospect_registration",
  "crm.automation.prospect_campaign_landing_signup"
]);

function deriveCommercialAccess(username: string, password: string) {
  return pbkdf2Sync(
    `${username}:${password}`,
    COMMERCIAL_ACCESS_SALT,
    COMMERCIAL_ACCESS_ITERATIONS,
    32,
    "sha256"
  ).toString("hex");
}

function getPath(value: JsonValue, path: string[]) {
  let current: JsonValue = value;

  for (const segment of path) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function scalarString(value: JsonValue) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  return "";
}

function firstScalar(payload: JsonValue, paths: string[][]) {
  for (const path of paths) {
    const value = scalarString(getPath(payload, path));
    if (value) return value;
  }

  return "";
}

function collectRoutingFields(
  value: JsonValue,
  path = "",
  output: Record<string, JsonValue> = {}
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectRoutingFields(item, `${path}[${index}]`, output)
    );
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    const normalized = key.toLowerCase();

    const isRoutingField =
      normalized === "eventtype" ||
      normalized === "eventlabel" ||
      normalized === "eventdate" ||
      normalized === "idw12" ||
      normalized === "idbranch" ||
      normalized === "branchid" ||
      normalized === "branchname" ||
      normalized === "unitid" ||
      normalized === "unitname";

    if (
      isRoutingField &&
      (typeof child === "string" ||
        typeof child === "number" ||
        typeof child === "boolean" ||
        child === null)
    ) {
      output[currentPath] = child;
    }

    collectRoutingFields(child, currentPath, output);
  }

  return output;
}

function collectUsefulFields(
  value: JsonValue,
  path = "",
  output: Record<string, JsonValue> = {}
) {
  if (Array.isArray(value)) {
    value.slice(0, 10).forEach((item, index) =>
      collectUsefulFields(item, `${path}[${index}]`, output)
    );
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    const normalized = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const interesting =
      normalized === "id" ||
      normalized.includes("idprospect") ||
      normalized.includes("idmember") ||
      normalized.includes("personid") ||
      normalized.includes("memberid") ||
      normalized.includes("clientid") ||
      normalized.includes("name") ||
      normalized.includes("nome") ||
      normalized.includes("phone") ||
      normalized.includes("telefone") ||
      normalized.includes("mobile") ||
      normalized.includes("celular") ||
      normalized.includes("whatsapp") ||
      normalized.includes("email") ||
      normalized.includes("status");

    if (
      interesting &&
      (typeof child === "string" ||
        typeof child === "number" ||
        typeof child === "boolean" ||
        child === null)
    ) {
      output[currentPath] = child;
    }

    collectUsefulFields(child, currentPath, output);
  }

  return output;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Leads Comercial · EVO webhook",
    status: "ready",
    opportunities: true
  });
}

export async function POST(request: Request) {
  let payload: JsonValue;

  try {
    payload = (await request.json()) as JsonValue;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const eventType = firstScalar(payload, [["eventType"]]);
  const eventLabel = firstScalar(payload, [["eventLabel"]]);
  const eventDate = firstScalar(payload, [["eventDate"]]);

  const branchId = firstScalar(payload, [
    ["organization", "idBranch"],
    ["organization", "branchId"],
    ["idBranch"],
    ["branchId"]
  ]);

  const branchName = firstScalar(payload, [
    ["organization", "branchName"],
    ["organization", "name"],
    ["branchName"]
  ]);

  const fullName = firstScalar(payload, [
    ["person", "fullName"],
    ["person", "name"]
  ]);

  const firstName = firstScalar(payload, [["person", "firstName"]]);
  const lastName = firstScalar(payload, [["person", "lastName"]]);
  const personName =
    fullName || [firstName, lastName].filter(Boolean).join(" ").trim();

  const phone = firstScalar(payload, [
    ["person", "phone"],
    ["person", "mobilePhone"],
    ["person", "mobile"],
    ["person", "cellPhone"],
    ["person", "whatsapp"]
  ]);

  const email = firstScalar(payload, [["person", "email"]]);

  const routing = collectRoutingFields(payload);
  const useful = collectUsefulFields(payload);

  console.info(
    "[EVO WEBHOOK]",
    JSON.stringify({
      receivedAt: new Date().toISOString(),
      eventType,
      branchId,
      branchName,
      routing,
      useful
    })
  );

  if (!OPPORTUNITY_EVENTS.has(eventType)) {
    return NextResponse.json({
      ok: true,
      received: true,
      status: "ignored",
      eventType
    });
  }

  const commercialUser = process.env.COMERCIAL_USER;
  const commercialPassword = process.env.COMERCIAL_PASSWORD;

  if (!commercialUser || !commercialPassword) {
    console.error("[EVO WEBHOOK] Credenciais internas do Setor Comercial ausentes.");
    return NextResponse.json(
      { ok: false, error: "Integração indisponível" },
      { status: 503 }
    );
  }

  const accessToken = deriveCommercialAccess(
    commercialUser,
    commercialPassword
  );

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/evo_ingest_opportunity`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "x-client-info": accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_event_type: eventType,
        p_event_label: eventLabel || null,
        p_event_date: eventDate || null,
        p_branch_id: branchId || null,
        p_branch_name: branchName || null,
        p_person_name: personName || null,
        p_phone: phone || null,
        p_email: email || null
      }),
      cache: "no-store"
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      "[EVO WEBHOOK] Falha ao processar oportunidade:",
      response.status,
      responseText
    );

    return NextResponse.json(
      { ok: false, error: "Falha ao processar oportunidade" },
      { status: 500 }
    );
  }

  let result: unknown = null;

  try {
    result = JSON.parse(responseText);
  } catch {
    result = responseText;
  }

  console.info(
    "[EVO WEBHOOK RESULT]",
    JSON.stringify({
      eventType,
      branchId,
      branchName,
      result
    })
  );

  return NextResponse.json({
    ok: true,
    received: true,
    integration: result
  });
}
