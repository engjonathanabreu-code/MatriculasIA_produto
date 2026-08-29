/**
 * server/rateLimit.js
 * ---------------------------------------------------------------------------
 * Limite de requisicoes por IP (protecao basica contra bots/abuso), usando a
 * tabela public.rate_limits do Supabase como armazenamento compartilhado
 * entre execucoes da funcao serverless (que nao tem memoria persistente).
 *
 * Janela deslizante simples: se a ultima janela para essa chave comecou ha
 * mais de WINDOW_MS, reseta a contagem; senao, incrementa e bloqueia se
 * passar do limite.
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin } = require("./supabaseAdmin");

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "desconhecido";
}

/**
 * @param {object} req - requisicao (usada para extrair IP)
 * @param {string} escopo - nome logico do limite (ex: "analisar-documento")
 * @param {number} limite - numero maximo de requisicoes na janela
 * @param {number} janelaMs - duracao da janela em milissegundos
 * @returns {Promise<{permitido: boolean, restante: number}>}
 */
async function checarRateLimit(req, escopo, limite, janelaMs) {
  const ip = getClientIp(req);
  const chave = escopo + ":" + ip;
  const agora = Date.now();
  const admin = getSupabaseAdmin();

  const { data: existente } = await admin
    .from("rate_limits")
    .select("*")
    .eq("chave", chave)
    .maybeSingle();

  if (!existente) {
    await admin.from("rate_limits").insert({ chave: chave, janela_inicio: new Date(agora).toISOString(), contagem: 1 });
    return { permitido: true, restante: limite - 1 };
  }

  const inicioJanela = new Date(existente.janela_inicio).getTime();
  if (agora - inicioJanela > janelaMs) {
    // janela expirou - reseta
    await admin
      .from("rate_limits")
      .update({ janela_inicio: new Date(agora).toISOString(), contagem: 1 })
      .eq("chave", chave);
    return { permitido: true, restante: limite - 1 };
  }

  if (existente.contagem >= limite) {
    return { permitido: false, restante: 0 };
  }

  await admin.from("rate_limits").update({ contagem: existente.contagem + 1 }).eq("chave", chave);
  return { permitido: true, restante: limite - existente.contagem - 1 };
}

module.exports = { checarRateLimit, getClientIp };
