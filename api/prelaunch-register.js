const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { checarRateLimit } = require("../server/rateLimit");

function bodyOf(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}
function clean(v, max) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ sucesso: false, erro: "Método não permitido." });
  try {
    const limite = await checarRateLimit(req, "prelaunch-register", 8, 15 * 60 * 1000);
    if (!limite.permitido) return res.status(429).json({ sucesso: false, erro: "Muitas tentativas. Tente novamente em alguns minutos." });

    const body = bodyOf(req);
    const nomeCompleto = clean(body.nomeCompleto, 150);
    const whatsapp = clean(body.whatsapp, 40);
    const email = clean(body.email, 180).toLowerCase();
    const areaAtuacao = clean(body.areaAtuacao, 160);

    if (nomeCompleto.split(" ").filter(Boolean).length < 2) return res.status(400).json({ sucesso: false, erro: "Informe seu nome completo." });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ sucesso: false, erro: "Informe um e-mail válido." });
    if (whatsapp.replace(/\D/g, "").length < 10) return res.status(400).json({ sucesso: false, erro: "Informe um WhatsApp válido com DDD." });
    if (areaAtuacao.length < 2) return res.status(400).json({ sucesso: false, erro: "Informe sua área de atuação." });

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("site_prelaunch_registrations").upsert({
      nome_completo: nomeCompleto,
      whatsapp,
      email,
      area_atuacao: areaAtuacao,
      origem: "pre-cadastro-site"
    }, { onConflict: "email" });
    if (error) throw error;

    return res.status(200).json({ sucesso: true });
  } catch (err) {
    console.error("[prelaunch-register]", err);
    return res.status(500).json({ sucesso: false, erro: "Não foi possível concluir o pré-cadastro." });
  }
};
