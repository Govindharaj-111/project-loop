import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { JWTPayload, SessionUser } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET || "project-loop-super-secret-jwt-key-2026-secure";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
export const COOKIE_NAME = "loop_session";

export async function createToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as unknown as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload || !payload.sub || !payload.workspaceId) return null;

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      workspaceId: payload.workspaceId,
      workspaceName: payload.workspaceName,
    };
  } catch {
    return null;
  }
}
