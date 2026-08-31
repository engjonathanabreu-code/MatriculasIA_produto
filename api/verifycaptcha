/**
 * api/verify-captcha.js
 * ---------------------------------------------------------------------------
 * Verifica o token do Cloudflare Turnstile UMA VEZ, antes de comecar a
 * processar um lote de documentos - nao a cada arquivo individual (um token
 * do Turnstile so pode ser usado uma vez, entao pedir um por arquivo criava
 * atrito/erros em lotes com varios documentos).
 *
 * O navegador chama esta rota uma vez ao clicar em "Analisar documento(s)";
 * se aprovado, as chamadas seguintes a /api/analisar-documento nao precisam
 * mais enviar token - a "prova de humano" ja foi feita para esta sessao de
 * envio.
 * ---------------------------------------------------------------------------
 */
const { getAuthenticatedUser } = require("../server/supabaseAdmin");
const { getClientIp, checarRateLimit } = require("../server/rateLimit");
const { verificarTurnstile } = require("../server/turnstile");

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { sucesso: false, erro: "Metodo nao permitido." });
  }

  let usuario;
  try {
    usuario = await getAuthenticatedUser(req);
  } catch (e) {
    return sendJson(res, 401, { sucesso: false, erro: "Faca login para continuar." });
  }

  const ip = getClientIp(req);
  const limite = await checarRateLimit(req, "verify-captcha", 20, 15 * 60 * 1000);
  if (!limite.permitido) {
    return sendJson(res, 429, { sucesso: false, erro: "Muitas tentativas em pouco tempo. Aguarde alguns minutos." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const token = body && body.turnstileToken;

  const aprovado = await verificarTurnstile(token, ip);
  if (!aprovado) {
    return sendJson(res, 403, { sucesso: false, erro: "Verificacao de seguranca falhou. Recarregue a pagina e tente novamente." });
  }

  return sendJson(res, 200, { sucesso: true });
};
