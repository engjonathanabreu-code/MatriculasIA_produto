/**
 * api/site-admin-testers.js
 * ---------------------------------------------------------------------------
 * Usuarios do periodo de testes, gerenciados pelo Site ADM.
 *   GET   -> lista os usuarios do Plano Testes com consumo
 *   POST  -> cria usuario { email, whatsapp, senha, nome? }
 *            (conta ja confirmada, Plano Testes, troca de senha + aceite dos
 *            Termos obrigatorios no primeiro acesso)
 *   PATCH -> { userId, acao: "redefinir_senha", senha } volta a conta para
 *            senha provisoria + troca obrigatoria no proximo acesso
 * Autenticacao: sessao do Site ADM (server/siteAdminAuth.js).
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { requireSiteAdmin } = require("../server/siteAdminAuth");
const { hashSenhaProvisoria } = require("../server/senhaProvisoria");

const PLANO_TESTES = "testes";
const MAX_TESTERS = 25;

function erro(status, msg) {
  const e = new Error(msg);
  e.statusCode = status;
  return e;
}

function lerBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}

function normalizarWhatsapp(v) {
  const d = String(v || "").replace(/\D/g, "");
  const semPais = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length < 10 || semPais.length > 11) return null;
  return semPais.length === 11
    ? "(" + semPais.slice(0, 2) + ") " + semPais.slice(2, 7) + "-" + semPais.slice(7)
    : "(" + semPais.slice(0, 2) + ") " + semPais.slice(2, 6) + "-" + semPais.slice(6);
}

function validarSenhaProvisoria(s) {
  s = String(s || "");
  if (s.length < 8) return "A senha provisória precisa ter pelo menos 8 caracteres.";
  if (Buffer.byteLength(s, "utf8") > 72) return "A senha provisória é longa demais.";
  return null;
}

function traduzErroAuth(msg) {
  msg = String(msg || "");
  if (/already.*(registered|exists)/i.test(msg)) return "Já existe uma conta com esse e-mail.";
  if (/pwned|leak|breach|weak|known/i.test(msg)) return "Essa senha provisória é considerada fraca/vazada pelo Supabase. Use outra (ex.: com letras, números e símbolo).";
  if (/password/i.test(msg)) return "Senha recusada pelo Supabase: " + msg;
  if (/email/i.test(msg)) return "E-mail recusado: " + msg;
  return msg || "Erro ao criar usuário.";
}

async function listar(admin) {
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("id, user_id, status, periodo_inicio, criado_em, plans(limite_analises, max_arquivos_por_analise), profiles(email, nome_completo, telefone, deve_trocar_senha, termos_aceitos_em, criado_em)")
    .eq("plan_id", PLANO_TESTES)
    .order("criado_em", { ascending: false });
  if (error) throw error;

  const ids = (subs || []).map(function (s) { return s.user_id; });
  let usos = [];
  if (ids.length) {
    const r = await admin
      .from("analysis_usage")
      .select("user_id, lote_id, criado_em")
      .in("user_id", ids)
      .eq("sucesso", true);
    if (r.error) throw r.error;
    usos = r.data || [];
  }

  const testers = (subs || []).map(function (s) {
    const p = s.profiles || {};
    const desde = new Date(s.periodo_inicio || s.criado_em).getTime();
    const meus = usos.filter(function (u) { return u.user_id === s.user_id && new Date(u.criado_em).getTime() >= desde; });
    const lotes = new Set(meus.filter(function (u) { return u.lote_id; }).map(function (u) { return u.lote_id; }));
    const ultimo = meus.reduce(function (acc, u) { return !acc || u.criado_em > acc ? u.criado_em : acc; }, null);
    return {
      userId: s.user_id,
      email: p.email,
      nome: p.nome_completo,
      whatsapp: p.telefone,
      status: s.status,
      primeiroAcessoPendente: !!p.deve_trocar_senha || !p.termos_aceitos_em,
      termosAceitosEm: p.termos_aceitos_em,
      criadoEm: p.criado_em || s.criado_em,
      analisesUsadas: lotes.size,
      arquivosAnalisados: meus.length,
      limiteAnalises: s.plans ? s.plans.limite_analises : null,
      maxArquivos: s.plans ? s.plans.max_arquivos_por_analise : null,
      ultimaAnalise: ultimo
    };
  });

  return { testers: testers, maxTesters: MAX_TESTERS, ativos: testers.filter(function (t) { return t.status === "active"; }).length };
}

async function criar(admin, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const nome = String(body.nome || "").trim().slice(0, 120) || null;
  const whatsapp = normalizarWhatsapp(body.whatsapp);
  const senha = String(body.senha || "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw erro(400, "Informe um e-mail válido.");
  if (!whatsapp) throw erro(400, "Informe um WhatsApp válido com DDD (ex.: (48) 99999-9999).");
  const problemaSenha = validarSenhaProvisoria(senha);
  if (problemaSenha) throw erro(400, problemaSenha);

  const { count, error: erroCount } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", PLANO_TESTES)
    .eq("status", "active");
  if (erroCount) throw erroCount;
  if ((count || 0) >= MAX_TESTERS && body.ignorarLimite !== true) {
    throw erro(409, "Já existem " + MAX_TESTERS + " usuários de teste ativos.");
  }

  // Quem já tem conta (ex.: criou sozinho pelo app no teste gratuito) não
  // ganha conta nova: a assinatura ativa sem Stripe é trocada pelo Plano
  // Testes e a senha/aceite que a pessoa já tem continuam valendo.
  const { data: perfilExistente, error: erroPerfil } = await admin
    .from("profiles")
    .select("id, telefone, nome_completo")
    .eq("email", email)
    .maybeSingle();
  if (erroPerfil) throw erroPerfil;
  if (perfilExistente) return converterContaExistente(admin, perfilExistente, whatsapp, nome, senha);

  // Cria a conta ja confirmada (sem e-mail de confirmacao). O trigger
  // handle_new_user cria o perfil e uma assinatura "trial"; logo abaixo a
  // assinatura e trocada para o Plano Testes.
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email: email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome, telefone: whatsapp, origem: "testes" }
  });
  if (erroCriar || !criado || !criado.user) throw erro(400, traduzErroAuth(erroCriar && erroCriar.message));
  const userId = criado.user.id;

  try {
    const { error: e1 } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: Object.assign({}, criado.user.app_metadata || {}, { senha_provisoria_sha: hashSenhaProvisoria(userId, senha) })
    });
    if (e1) throw e1;

    const { error: e2 } = await admin
      .from("profiles")
      .update({ telefone: whatsapp, nome_completo: nome, deve_trocar_senha: true, criado_por_admin: true, termos_aceitos_em: null })
      .eq("id", userId);
    if (e2) throw e2;

    const agora = new Date().toISOString();
    const { error: e3 } = await admin
      .from("subscriptions")
      .update({ status: "superseded", atualizado_em: agora })
      .eq("user_id", userId)
      .eq("status", "active");
    if (e3) throw e3;

    const { error: e4 } = await admin
      .from("subscriptions")
      .insert({ user_id: userId, plan_id: PLANO_TESTES, status: "active", periodo_inicio: agora });
    if (e4) throw e4;
  } catch (e) {
    // Nao deixa conta "pela metade": desfaz a criacao.
    console.error("[site-admin-testers] falha ao configurar usuario, removendo:", e);
    await admin.auth.admin.deleteUser(userId).catch(function () {});
    throw erro(500, "Não foi possível configurar o usuário de teste: " + (e.message || e));
  }

  return { userId: userId, email: email, whatsapp: whatsapp, existente: false };
}

async function converterContaExistente(admin, perfil, whatsapp, nome, senha) {
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("id, plan_id, status, stripe_subscription_id")
    .eq("user_id", perfil.id)
    .in("status", ["active", "past_due", "trialing"]);
  if (error) throw error;
  if ((subs || []).some(function (x) { return x.stripe_subscription_id; })) {
    throw erro(409, "Esta pessoa já é assinante de um plano pago.");
  }
  if ((subs || []).some(function (x) { return x.plan_id === PLANO_TESTES && x.status === "active"; })) {
    throw erro(409, "Esta pessoa já está no Plano Testes.");
  }
  const agora = new Date().toISOString();
  const { error: e1 } = await admin
    .from("subscriptions")
    .update({ status: "superseded", atualizado_em: agora })
    .eq("user_id", perfil.id)
    .eq("status", "active")
    .is("stripe_subscription_id", null);
  if (e1) throw e1;
  const { error: e2 } = await admin
    .from("subscriptions")
    .insert({ user_id: perfil.id, plan_id: PLANO_TESTES, status: "active", periodo_inicio: agora });
  if (e2) throw e2;
  // Mesmo acesso dos demais testadores: e-mail + senha provisória, com troca
  // obrigatória da senha no primeiro acesso.
  const { data: atual, error: e3 } = await admin.auth.admin.getUserById(perfil.id);
  if (e3 || !atual || !atual.user) throw erro(404, "Usuário não encontrado.");
  const { error: e4 } = await admin.auth.admin.updateUserById(perfil.id, {
    password: senha,
    email_confirm: true,
    app_metadata: Object.assign({}, atual.user.app_metadata || {}, { senha_provisoria_sha: hashSenhaProvisoria(perfil.id, senha) })
  });
  if (e4) throw erro(400, traduzErroAuth(e4.message));
  const extra = { deve_trocar_senha: true };
  if (!perfil.telefone && whatsapp) extra.telefone = whatsapp;
  if (!perfil.nome_completo && nome) extra.nome_completo = nome;
  const { error: e5 } = await admin.from("profiles").update(extra).eq("id", perfil.id);
  if (e5) throw e5;
  return { userId: perfil.id, whatsapp: perfil.telefone || whatsapp, existente: true };
}

async function redefinirSenha(admin, body) {
  const userId = String(body.userId || "");
  const senha = String(body.senha || "");
  const problemaSenha = validarSenhaProvisoria(senha);
  if (!userId) throw erro(400, "Usuário inválido.");
  if (problemaSenha) throw erro(400, problemaSenha);

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", PLANO_TESTES)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!sub) throw erro(404, "Este usuário não está com o Plano Testes ativo.");

  const { data: atual, error: e0 } = await admin.auth.admin.getUserById(userId);
  if (e0 || !atual || !atual.user) throw erro(404, "Usuário não encontrado.");

  const { error: e1 } = await admin.auth.admin.updateUserById(userId, {
    password: senha,
    app_metadata: Object.assign({}, atual.user.app_metadata || {}, { senha_provisoria_sha: hashSenhaProvisoria(userId, senha) })
  });
  if (e1) throw erro(400, traduzErroAuth(e1.message));

  const { error: e2 } = await admin.from("profiles").update({ deve_trocar_senha: true }).eq("id", userId);
  if (e2) throw e2;
  return { userId: userId };
}

module.exports = async function handler(req, res) {
  try {
    await requireSiteAdmin(req);
    const admin = getSupabaseAdmin();

    if (req.method === "GET") {
      return res.status(200).json(Object.assign({ sucesso: true }, await listar(admin)));
    }
    if (req.method === "POST") {
      const criado = await criar(admin, lerBody(req));
      return res.status(201).json({ sucesso: true, usuario: criado });
    }
    if (req.method === "PATCH") {
      const body = lerBody(req);
      if (body.acao !== "redefinir_senha") return res.status(400).json({ sucesso: false, erro: "Ação inválida." });
      return res.status(200).json(Object.assign({ sucesso: true }, await redefinirSenha(admin, body)));
    }
    return res.status(405).json({ sucesso: false, erro: "Método não permitido." });
  } catch (err) {
    if (!err.statusCode || err.statusCode >= 500) console.error("[site-admin-testers]", err);
    return res.status(err.statusCode || 500).json({ sucesso: false, erro: err.message || "Erro no servidor." });
  }
};
