/**
 * api/verify-captcha.js
 * ---------------------------------------------------------------------------
 * Verifica o token do Cloudflare Turnstile uma vez antes de processar um
 * lote de documentos. Durante o pre-lancamento, uma falha isolada do
 * Turnstile nao deve derrubar o fluxo de um usuario ja autenticado: login,
 * rate limit e cota continuam sendo validados no servidor antes da chamada
 * cara de IA.
 * ---------------------------------------------------------------------------
 */
const { getAuthenticatedUser } = require("../server/supabaseAdmin");
const { getClientIp, checarRateLimit } = require("../server/rateLimit");
const { verificarTurnstile } = require("../server/turnstile");
const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { iniciarLote } = require("../server/cota");

/**
 * Alem do CAPTCHA, esta rota tambem ABRE o lote de analise no servidor:
 * valida primeiro acesso, plano, cota e quantidade de arquivos, e devolve
 * um loteId que o navegador envia junto de cada arquivo para
 * /api/analisar-documento.
 */
async function abrirLote(usuario, body, turnstileBypass) {
  const lote = await iniciarLote(getSupabaseAdmin(), usuario, body && body.quantidadeArquivos);
  return { sucesso: true, turnstileBypass: turnstileBypass, loteId: lote.loteId, maxArquivos: lote.maxArquivos };
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { sucesso: false, erro: "Método não permitido." });
  }

  let usuario;
  try {
    usuario = await getAuthenticatedUser(req);
  } catch (e) {
    return sendJson(res, 401, { sucesso: false, erro: "Faça login para continuar." });
  }

  const ip = getClientIp(req);
  const limite = await checarRateLimit(req, "verify-captcha", 20, 15 * 60 * 1000);
  if (!limite.permitido) {
    return sendJson(res, 429, { sucesso: false, erro: "Muitas tentativas em pouco tempo. Aguarde alguns minutos." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  const token = body && body.turnstileToken;

  const aprovado = await verificarTurnstile(token, ip);
  if (!aprovado) {
    // Fail-open controlado para o pre-lancamento: esta rota so chega aqui
    // depois de confirmar uma sessao Supabase valida e aplicar rate limit.
    // A rota /api/analisar-documento repete autenticacao, rate limit e cota
    // antes de chamar a IA. Mantemos o alerta no log para corrigir a
    // configuracao do widget/hostname sem interromper os testes de usuarios.
    console.warn(
      "[verify-captcha] Turnstile recusado para usuário autenticado; liberando lote em modo pre-lancamento.",
      { userId: usuario.id, hasToken: Boolean(token) }
    );
  }

  try {
    return sendJson(res, 200, await abrirLote(usuario, body, !aprovado));
  } catch (err) {
    if (!err.statusCode) console.error("[verify-captcha] erro ao abrir lote:", err);
    return sendJson(res, err.statusCode || 500, Object.assign(
      { sucesso: false, erro: err.statusCode ? err.message : "Não foi possível iniciar a análise." },
      err.extra || {}
    ));
  }
};
