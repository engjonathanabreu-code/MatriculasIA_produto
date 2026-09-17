/**
 * api/site-admin-tickets.js
 * ---------------------------------------------------------------------------
 * Chamados de suporte na administracao do site.
 *   GET   -> lista todos os chamados (mais recentes primeiro)
 *   PATCH -> altera o status { id, status }
 * Autenticacao: sessao do Site ADM (server/siteAdminAuth.js).
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { requireSiteAdmin } = require("../server/siteAdminAuth");

const STATUS = ["aberto", "em_andamento", "resolvido", "fechado"];

module.exports = async function handler(req, res) {
  try {
    await requireSiteAdmin(req);
    const admin = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("support_tickets")
        .select("id,user_email,user_nome,tipo,titulo,conteudo_html,status,pagina_origem,navegador,criado_em,atualizado_em")
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ sucesso: true, chamados: data || [] });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body.id || STATUS.indexOf(body.status) === -1) {
        return res.status(400).json({ sucesso: false, erro: "Chamado ou status inválido." });
      }
      const { data, error } = await admin
        .from("support_tickets")
        .update({ status: body.status, atualizado_em: new Date().toISOString() })
        .eq("id", body.id)
        .select("id,status,atualizado_em")
        .single();
      if (error) throw error;
      return res.status(200).json({ sucesso: true, chamado: data });
    }

    return res.status(405).json({ sucesso: false, erro: "Método não permitido." });
  } catch (err) {
    console.error("[site-admin-tickets]", err);
    return res.status(err.statusCode || 500).json({ sucesso: false, erro: err.message || "Erro ao carregar chamados." });
  }
};
