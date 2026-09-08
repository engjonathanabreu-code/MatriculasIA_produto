const crypto = require("crypto");
const { getSupabaseAdmin } = require("./supabaseAdmin");

const ADMIN_EMAIL = "eng.jonathanabreu@gmail.com";
const PASSWORD_SALT_B64 = "lIUJ0gqRBJ15Xwtl+ZXXhw==";
const PASSWORD_HASH_B64 = "9Ij3wfdprQNJzUDs0wZBNV/oDE8tGIdlJSd/xRPmiV5quGTxNrf59zGkeKyRCKKUG19VbD7GNFutZVsFU3z37A==";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function verifyPassword(password) {
  const salt = Buffer.from(PASSWORD_SALT_B64, "base64");
  const expected = Buffer.from(PASSWORD_HASH_B64, "base64");
  const actual = crypto.scryptSync(String(password || ""), salt, expected.length, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createAdminSession() {
  const admin = getSupabaseAdmin();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await admin.from("site_admin_sessions").insert({
    admin_email: ADMIN_EMAIL,
    token_hash: tokenHash(token),
    expira_em: expiraEm
  });
  if (error) throw error;
  return { token, expiraEm };
}

async function requireSiteAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const err = new Error("Sessão administrativa ausente.");
    err.statusCode = 401;
    throw err;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("site_admin_sessions")
    .select("id, admin_email, expira_em")
    .eq("token_hash", tokenHash(token))
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    const err = new Error("Sessão administrativa inválida ou expirada.");
    err.statusCode = 401;
    throw err;
  }
  return data;
}

async function revokeSiteAdminSession(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return;
  const admin = getSupabaseAdmin();
  await admin.from("site_admin_sessions").delete().eq("token_hash", tokenHash(token));
}

module.exports = {
  ADMIN_EMAIL,
  normalizeEmail,
  verifyPassword,
  createAdminSession,
  requireSiteAdmin,
  revokeSiteAdminSession
};
