import { JWTPayload, SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
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

export async function createSession(session: CommercialSession) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function getSession(token?: string): Promise<CommercialSession | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const data = payload as JWTPayload & Partial<CommercialSession>;

    if (
      !data.username ||
      !data.displayName ||
      !data.role ||
      !data.userId ||
      (data.role !== "admin" && data.role !== "commercial" && data.role !== "user")
    ) {
      return null;
    }

    return {
      username: data.username,
      displayName: data.displayName,
      role: data.role,
      userId: data.userId,
      unitId: data.unitId ?? null,
      unitName: data.unitName ?? null
    };
  } catch {
    return null;
  }
}

export async function verifySession(token?: string) {
  return Boolean(await getSession(token));
}
