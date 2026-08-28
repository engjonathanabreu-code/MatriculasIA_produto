/**
 * server/turnstile.js
 * ---------------------------------------------------------------------------
 * Verifica o token do Cloudflare Turnstile (CAPTCHA invisivel, gratuito)
 * enviado pelo navegador. Protege rotas caras (chamada a IA) contra bots.
 * ---------------------------------------------------------------------------
 */
async function verificarTurnstile(token, ipRemoto) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Sem chave configurada: nao bloqueia (evita derrubar o site se alguem
    // esquecer de configurar), mas isso deveria ser corrigido em producao.
    console.warn("[turnstile] TURNSTILE_SECRET_KEY nao configurada - verificacao pulada.");
    return true;
  }
  if (!token) return false;

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secret, response: token, remoteip: ipRemoto || "" })
    });
    const json = await resp.json();
    return json.success === true;
  } catch (e) {
    console.error("[turnstile] erro ao verificar token:", e.message);
    return false;
  }
}

module.exports = { verificarTurnstile };
