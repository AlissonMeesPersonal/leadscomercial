import { JWTPayload, SignJWT, jwtVerify } from "jose";

const SESSION_DURATION = "12h";
const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-only-change-this-secret"
);

export type CommercialRole = "admin" | "commercial" | "user";

export type CommercialSession = {
  username: string;
  displayName: string;
  role: CommercialRole;
  userId: string;
  unitId: string | null;
  unitName: string | null;
};

function isCommercialRole(value: unknown): value is CommercialRole {
  return value === "admin" || value === "commercial" || value === "user";
}

function sessionFromPayload(
  payload: JWTPayload & Partial<CommercialSession>
): CommercialSession | null {
  if (
    !payload.username ||
    !payload.displayName ||
    !payload.userId ||
    !isCommercialRole(payload.role)
  ) {
    return null;
  }

  return {
    username: payload.username,
    displayName: payload.displayName,
    role: payload.role,
    userId: payload.userId,
    unitId: payload.unitId ?? null,
    unitName: payload.unitName ?? null
  };
}

export async function createSession(session: CommercialSession) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(SESSION_SECRET);
}

export async function getSession(
  token?: string
): Promise<CommercialSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return sessionFromPayload(
      payload as JWTPayload & Partial<CommercialSession>
    );
  } catch {
    return null;
  }
}

export async function verifySession(token?: string) {
  return (await getSession(token)) !== null;
}
