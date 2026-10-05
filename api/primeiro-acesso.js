/**
 * api/primeiro-acesso.js
 * ---------------------------------------------------------------------------
 * Conclui o primeiro acesso do usuario logado:
 *   - contas criadas pelo admin (deve_trocar_senha = true): define a nova
 *     senha escolhida pelo usuario (substitui a senha generica);
 *   - toda conta sem termos_aceitos_em: registra o aceite dos Termos de Uso
 *     e da Politica de Privacidade.
 *
 * Tudo e feito no servidor (service_role) para que o navegador nao consiga
 * marcar o primeiro acesso como concluido sem realmente trocar a senha.
 *
 * POST { novaSenha?: string, aceiteTermos: true }
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin, getAuthenticatedUser } = require("../server/supabaseAdmin");
const { checarRateLimit } = require("../server/rateLimit");
const { hashSenhaProvisoria } = require("../server/senhaProvisoria");

function validarSenha(senha) {
  const s = String(senha || "");
  if (s.length < 8) return "A nova senha precisa ter pelo menos 8 caracteres.";
  if (Buffer.byteLength(s, "utf8") > 72) return "A nova senha e longa demais (maximo 72 caracteres).";
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return "Use letras e numeros na nova senha.";
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ sucesso: false, erro: "Metodo nao permitido." });

  try {
    const limite = await checarRateLimit(req, "primeiro-acesso", 10, 15 * 60 * 1000);
    if (!limite.permitido) return res.status(429).json({ sucesso: false, erro: "Muitas tentativas. Aguarde alguns minutos." });

    const user = await getAuthenticatedUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const admin = getSupabaseAdmin();

    const { data: perfil, error: erroPerfil } = await admin
      .from("profiles")
      .select("deve_trocar_senha, termos_aceitos_em")
      .eq("id", user.id)
      .maybeSingle();
    if (erroPerfil) throw erroPerfil;
    if (!perfil) return res.status(404).json({ sucesso: false, erro: "Perfil nao encontrado." });

    if (body.aceiteTermos !== true) {
      return res.status(400).json({ sucesso: false, erro: "E preciso concordar com os Termos de Uso e a Politica de Privacidade." });
    }

    const atualizacao = {};
    if (perfil.deve_trocar_senha) {
      const problema = validarSenha(body.novaSenha);
      if (problema) return res.status(400).json({ sucesso: false, erro: problema });

      const hashProvisoria = user.app_metadata && user.app_metadata.senha_provisoria_sha;
      if (hashProvisoria && hashProvisoria === hashSenhaProvisoria(user.id, body.novaSenha)) {
        return res.status(400).json({ sucesso: false, erro: "A nova senha precisa ser diferente da senha provisoria." });
      }

      const { error: erroSenha } = await admin.auth.admin.updateUserById(user.id, {
        password: String(body.novaSenha),
        app_metadata: Object.assign({}, user.app_metadata || {}, { senha_provisoria_sha: null })
      });
      if (erroSenha) {
        const msg = /pwned|leak|breach|weak|known/i.test(erroSenha.message || "")
          ? "Essa senha e conhecida por ja ter vazado em outros sites. Escolha uma senha diferente."
          : /same|different from the old/i.test(erroSenha.message || "")
            ? "A nova senha precisa ser diferente da senha provisoria."
            : "Nao foi possivel definir a nova senha: " + erroSenha.message;
        return res.status(400).json({ sucesso: false, erro: msg });
      }
      atualizacao.deve_trocar_senha = false;
    }
    if (!perfil.termos_aceitos_em) atualizacao.termos_aceitos_em = new Date().toISOString();

    if (Object.keys(atualizacao).length) {
      const { error } = await admin.from("profiles").update(atualizacao).eq("id", user.id);
      if (error) throw error;
    }

    return res.status(200).json({ sucesso: true, senhaAlterada: !!perfil.deve_trocar_senha });
  } catch (err) {
    console.error("[primeiro-acesso]", err);
    return res.status(err.statusCode || 500).json({ sucesso: false, erro: err.statusCode ? err.message : "Erro ao concluir o primeiro acesso." });
  }
};
