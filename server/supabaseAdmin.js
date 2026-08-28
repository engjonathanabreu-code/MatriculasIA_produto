/**
 * server/supabaseAdmin.js
 * ---------------------------------------------------------------------------
 * Cliente Supabase com a chave service_role - IGNORA row level security.
 * So deve ser usado dentro de api/*.js (nunca importado por arquivos que vao
 * para o navegador). As variaveis de ambiente SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY sao configuradas no painel da Vercel.
 * ---------------------------------------------------------------------------
 */
const { createClient } = require("@supabase/supabase-js");

let _client = null;

function getSupabaseAdmin() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados nas variaveis de ambiente da Vercel."
    );
  }

  _client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _client;
}

/**
 * Valida o token JWT enviado pelo navegador (header Authorization: Bearer <token>)
 * e devolve o usuario autenticado. Lanca erro se o token for invalido/ausente.
 */
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    const err = new Error("Nao autenticado: token ausente.");
    err.statusCode = 401;
    throw err;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data || !data.user) {
    const err = new Error("Nao autenticado: token invalido ou expirado.");
    err.statusCode = 401;
    throw err;
  }
  return data.user;
}

module.exports = { getSupabaseAdmin, getAuthenticatedUser };
