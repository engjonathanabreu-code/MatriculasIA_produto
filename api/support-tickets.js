/**
 * api/support-tickets.js
 * ---------------------------------------------------------------------------
 * Chamados de suporte abertos pelo usuario logado no app.
 *   GET  -> lista os chamados do proprio usuario
 *   POST -> abre um novo chamado { tipo, titulo, conteudoHtml }
 * Autenticacao: token JWT do Supabase (Authorization: Bearer <token>).
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin, getAuthenticatedUser } = require("../server/supabaseAdmin");
const { checarRateLimit } = require("../server/rateLimit");
const { sanitizeHtml, htmlToText } = require("../server/sanitizeHtml");

const TIPOS = ["erro", "sugestao", "duvida", "outro"];

function bodyOf(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}

module.exports = async function handler(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    const admin = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("support_tickets")
        .select("id,tipo,titulo,status,criado_em,atualizado_em")
        .eq("user_id", user.id)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.status(200).json({ sucesso: true, chamados: data || [] });
    }

    if (req.method !== "POST") return res.status(405).json({ sucesso: false, erro: "Método não permitido." });

    const limite = await checarRateLimit(req, "support-ticket", 10, 60 * 60 * 1000);
    if (!limite.permitido) return res.status(429).json({ sucesso: false, erro: "Você abriu muitos chamados em pouco tempo. Tente novamente mais tarde." });

    const body = bodyOf(req);
    const tipo = TIPOS.indexOf(body.tipo) !== -1 ? body.tipo : "outro";
    const titulo = String(body.titulo || "").trim().replace(/\s+/g, " ").slice(0, 150);
    const conteudoHtml = sanitizeHtml(body.conteudoHtml, 60000);
    const conteudoTexto = htmlToText(conteudoHtml).slice(0, 20000);

    if (titulo.length < 3) return res.status(400).json({ sucesso: false, erro: "Informe um título com pelo menos 3 caracteres." });
    if (conteudoTexto.length < 5) return res.status(400).json({ sucesso: false, erro: "Descreva o chamado com um pouco mais de detalhe." });

    let nome = (user.user_metadata && user.user_metadata.full_name) || null;
    if (!nome) {
      const { data: perfil } = await admin.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
      nome = perfil && perfil.nome_completo ? perfil.nome_completo : null;
    }

    const { data, error } = await admin.from("support_tickets").insert({
      user_id: user.id,
      user_email: user.email,
      user_nome: nome,
      tipo,
      titulo,
      conteudo_html: conteudoHtml,
      conteudo_texto: conteudoTexto,
      pagina_origem: String(body.paginaOrigem || "").slice(0, 120) || null,
      navegador: String(req.headers["user-agent"] || "").slice(0, 300) || null
    }).select("id,tipo,titulo,status,criado_em").single();
    if (error) throw error;

    return res.status(200).json({ sucesso: true, chamado: data });
  } catch (err) {
    console.error("[support-tickets]", err);
    return res.status(err.statusCode || 500).json({ sucesso: false, erro: err.statusCode ? err.message : "Não foi possível registrar o chamado." });
  }
};
