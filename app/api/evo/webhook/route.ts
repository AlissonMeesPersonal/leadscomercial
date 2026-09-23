import { NextResponse } from "next/server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
      normalized === "unitname" ||
      normalized === "organizationid" ||
      normalized === "organizationname";

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Leads Comercial · EVO webhook",
    status: "ready"
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

  const routing = collectRoutingFields(payload);

  console.info(
    "[EVO WEBHOOK TEST]",
    JSON.stringify({
      receivedAt: new Date().toISOString(),
      routing,
      topLevelKeys:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload)
          : []
    })
  );

  return NextResponse.json({
    ok: true,
    received: true
  });
}
