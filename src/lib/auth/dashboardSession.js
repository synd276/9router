import { SignJWT, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";

function isCloudflareWorker() {
  try {
    if (typeof WebSocketPair !== "undefined") return true;
    if (typeof navigator !== "undefined" && navigator?.userAgent === "Cloudflare-Workers") return true;
    if (process.env.OPENNEXT_CLOUDFLARE === "1") return true;
  } catch {}
  return false;
}

function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // On Cloudflare Workers / serverless edge, filesystem is unavailable.
  // Use a deterministic fallback stored in globalThis to stay stable within the isolate,
  // but warn loudly — callers should set JWT_SECRET env var for cross-isolate consistency.
  if (isCloudflareWorker()) {
    if (!globalThis.__jwtSecretFallback) {
      globalThis.__jwtSecretFallback = crypto.randomBytes(32).toString("hex");
      console.warn("[Auth] JWT_SECRET env var not set — using ephemeral secret. Sessions will not survive cold starts or cross middleware/server boundaries. Set JWT_SECRET in wrangler.jsonc vars.");
    }
    return globalThis.__jwtSecretFallback;
  }

  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {}
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, generated, { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString("hex");
  }
}

const SECRET = new TextEncoder().encode(loadJwtSecret());

export function shouldUseSecureCookie(request) {
  const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const isHttpsRequest = forwardedProto === "https";
  return forceSecureCookie || isHttpsRequest;
}

export async function createDashboardAuthToken(claims = {}) {
  return new SignJWT({ authenticated: true, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifyDashboardAuthToken(token) {
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(cookieStore, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
  });
}

export function clearDashboardAuthCookie(cookieStore) {
  cookieStore.delete("auth_token");
}
