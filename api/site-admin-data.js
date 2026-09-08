const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { requireSiteAdmin } = require("../server/siteAdminAuth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ sucesso: false, erro: "Método não permitido." });
  try {
    await requireSiteAdmin(req);
    const admin = getSupabaseAdmin();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [regs, visitsAll, visitsToday, visitsWeek] = await Promise.all([
      admin.from("site_prelaunch_registrations")
        .select("id,nome_completo,whatsapp,email,area_atuacao,criado_em")
        .order("criado_em", { ascending: false }),
      admin.from("site_visits").select("id,visitor_key,criado_em"),
      admin.from("site_visits").select("id", { count: "exact", head: true }).gte("criado_em", today),
      admin.from("site_visits").select("id,visitor_key").gte("criado_em", week)
    ]);

    for (const r of [regs, visitsAll, visitsToday, visitsWeek]) if (r.error) throw r.error;

    const allVisits = visitsAll.data || [];
    const weekVisits = visitsWeek.data || [];
    const uniqueAll = new Set(allVisits.map(v => v.visitor_key).filter(Boolean)).size;
    const uniqueWeek = new Set(weekVisits.map(v => v.visitor_key).filter(Boolean)).size;
    const cadastros = regs.data || [];

    return res.status(200).json({
      sucesso: true,
      metricas: {
        visitasTotais: allVisits.length,
        visitantesUnicos: uniqueAll,
        visitasHoje: visitsToday.count || 0,
        visitasUltimos7Dias: weekVisits.length,
        visitantesUnicosUltimos7Dias: uniqueWeek,
        preCadastros: cadastros.length,
        conversao: uniqueAll ? Number(((cadastros.length / uniqueAll) * 100).toFixed(1)) : 0
      },
      cadastros
    });
  } catch (err) {
    console.error("[site-admin-data]", err);
    return res.status(err.statusCode || 500).json({ sucesso: false, erro: err.message || "Erro ao carregar dados." });
  }
};
