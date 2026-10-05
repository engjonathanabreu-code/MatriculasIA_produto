/**
 * server/cota.js
 * ---------------------------------------------------------------------------
 * Regras de cota compartilhadas por /api/verify-captcha (inicio do lote) e
 * /api/analisar-documento (cada arquivo do lote).
 *
 * Dois modos de contagem, definidos pela tabela public.plans:
 *   - conta_por_lote = false (planos pagos e teste gratuito):
 *       cada ARQUIVO analisado com sucesso consome 1 analise.
 *   - conta_por_lote = true (Plano Testes):
 *       cada LOTE (um clique em "Analisar", com ate max_arquivos_por_analise
 *       arquivos) consome 1 analise, desde que pelo menos 1 arquivo do lote
 *       tenha sido analisado com sucesso.
 * ---------------------------------------------------------------------------
 */

const LOTE_VALIDADE_MS = 6 * 60 * 60 * 1000; // um lote vale por 6h depois de criado

function erroHttp(status, mensagem, extra) {
  const err = new Error(mensagem);
  err.statusCode = status;
  err.extra = extra || {};
  return err;
}

function ehEmailAdmin(email) {
  const lista = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(Boolean);
  return lista.indexOf(String(email || "").toLowerCase()) !== -1;
}

/** Bloqueia quem ainda nao concluiu o primeiro acesso (troca de senha + aceite dos termos). */
async function exigirPrimeiroAcessoConcluido(admin, userId) {
  const { data: perfil, error } = await admin
    .from("profiles")
    .select("deve_trocar_senha, termos_aceitos_em")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!perfil || perfil.deve_trocar_senha || !perfil.termos_aceitos_em) {
    throw erroHttp(403, "Conclua o primeiro acesso (nova senha e aceite dos Termos) antes de analisar documentos.", {
      precisaPrimeiroAcesso: true
    });
  }
}

async function buscarAssinaturaAtiva(admin, userId) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function inicioDoPeriodo(assinatura) {
  return assinatura.periodo_inicio || assinatura.criado_em;
}

/** Quantas analises o usuario ja consumiu no periodo atual da assinatura. */
async function usoNoPeriodo(admin, userId, assinatura) {
  const desde = inicioDoPeriodo(assinatura);
  if (assinatura.plans && assinatura.plans.conta_por_lote) {
    // Lote consumido = lote com pelo menos 1 arquivo reservado (em analise ou
    // concluido). Arquivos que falham devolvem a reserva (liberarArquivo).
    const { count, error } = await admin
      .from("analysis_batches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("criado_em", desde)
      .gt("arquivos_reservados", 0);
    if (error) throw error;
    return count || 0;
  }
  const { count, error } = await admin
    .from("analysis_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("criado_em", desde);
  if (error) throw error;
  return count || 0;
}

function erroLimite(assinatura, limite) {
  const nome = assinatura.plans ? assinatura.plans.nome : "";
  const ehTestes = assinatura.plans && assinatura.plans.conta_por_lote;
  return erroHttp(
    402,
    ehTestes
      ? "Voce ja usou as " + limite + " analises do " + nome + ". Obrigado por testar o Matricula.IA! Para continuar, assine um plano em Minha conta."
      : "Voce atingiu o limite de " + limite + " analises do seu plano (" + nome + ") neste periodo. Faca upgrade de plano ou aguarde a renovacao.",
    { limiteAtingido: true }
  );
}

/**
 * Chamado no INICIO de um lote (verify-captcha). Valida plano/cota e cria o
 * registro do lote no servidor. Devolve { loteId, maxArquivos }.
 */
async function iniciarLote(admin, usuario, quantidadeArquivos) {
  // Sem quantidade informada (versao antiga do app em cache): assume 1.
  const qtd = quantidadeArquivos == null ? 1 : parseInt(quantidadeArquivos, 10);
  if (!qtd || qtd < 1 || qtd > 50) throw erroHttp(400, "Quantidade de arquivos do lote invalida.");

  const ehAdmin = ehEmailAdmin(usuario.email);
  if (!ehAdmin) await exigirPrimeiroAcessoConcluido(admin, usuario.id);

  const assinatura = ehAdmin ? null : await buscarAssinaturaAtiva(admin, usuario.id);
  if (!ehAdmin && !assinatura) {
    throw erroHttp(402, "Voce ainda nao tem um plano ativo. Assine um plano para analisar documentos.", { precisaAssinatura: true });
  }

  const plano = assinatura && assinatura.plans;
  const maxArquivos = (plano && plano.max_arquivos_por_analise) || 10;
  if (qtd > maxArquivos) {
    throw erroHttp(400, "Seu plano permite no maximo " + maxArquivos + " arquivos por analise.");
  }

  if (assinatura) {
    const usado = await usoNoPeriodo(admin, usuario.id, assinatura);
    const limite = plano ? plano.limite_analises : 0;
    if (usado >= limite) throw erroLimite(assinatura, limite);
  }

  const { data: lote, error } = await admin
    .from("analysis_batches")
    .insert({ user_id: usuario.id, subscription_id: assinatura ? assinatura.id : null, arquivos_declarados: qtd })
    .select("id")
    .single();
  if (error) throw error;

  return { loteId: lote.id, maxArquivos: maxArquivos };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buscarLoteDoUsuario(admin, userId, loteId) {
  if (!loteId || !UUID_RE.test(String(loteId))) return null;
  const { data, error } = await admin
    .from("analysis_batches")
    .select("id, user_id, subscription_id, criado_em")
    .eq("id", loteId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Chamado a cada ARQUIVO (analisar-documento), antes da IA. Devolve
 * { assinatura, loteId, reservado }. Quando reservado=true, quem chamou deve
 * chamar liberarArquivo() se a analise falhar (devolve a reserva).
 */
async function autorizarArquivo(admin, usuario, loteId) {
  const ehAdmin = ehEmailAdmin(usuario.email);
  if (ehAdmin) {
    const loteAdmin = await buscarLoteDoUsuario(admin, usuario.id, loteId);
    return { assinatura: null, loteId: loteAdmin ? loteAdmin.id : null, reservado: false };
  }

  await exigirPrimeiroAcessoConcluido(admin, usuario.id);

  const assinatura = await buscarAssinaturaAtiva(admin, usuario.id);
  if (!assinatura) {
    throw erroHttp(402, "Voce ainda nao tem um plano ativo. Assine um plano para analisar documentos.", { precisaAssinatura: true });
  }
  const plano = assinatura.plans || {};
  const limite = plano.limite_analises || 0;
  const lote = await buscarLoteDoUsuario(admin, usuario.id, loteId);

  if (plano.conta_por_lote) {
    if (!lote || lote.subscription_id !== assinatura.id) {
      throw erroHttp(400, "Lote de analise invalido. Recarregue a pagina e tente novamente.");
    }
    if (Date.now() - new Date(lote.criado_em).getTime() > LOTE_VALIDADE_MS) {
      throw erroHttp(400, "Este lote de analise expirou. Clique em Analisar novamente.");
    }
    const maxArquivos = plano.max_arquivos_por_analise || 10;
    // Reserva atomica no banco (trava por usuario): impede furar a cota ou o
    // limite de arquivos com requisicoes simultaneas.
    const { data: resultado, error } = await admin.rpc("reservar_arquivo_lote", {
      p_lote: lote.id,
      p_user: usuario.id,
      p_max: maxArquivos,
      p_limite: limite,
      p_desde: inicioDoPeriodo(assinatura)
    });
    if (error) throw error;
    if (resultado === "lote_cheio") throw erroHttp(400, "Esta analise ja atingiu o maximo de " + maxArquivos + " arquivos.");
    if (resultado === "limite") throw erroLimite(assinatura, limite);
    if (resultado !== "ok") throw erroHttp(400, "Lote de analise invalido. Recarregue a pagina e tente novamente.");
    return { assinatura: assinatura, loteId: lote.id, reservado: true };
  }

  const usado = await usoNoPeriodo(admin, usuario.id, assinatura);
  if (usado >= limite) throw erroLimite(assinatura, limite);
  return { assinatura: assinatura, loteId: lote ? lote.id : null, reservado: false };
}

/** Devolve a reserva de um arquivo que falhou (o lote nao conta se nenhum arquivo der certo). */
async function liberarArquivo(admin, userId, loteId) {
  if (!loteId) return;
  const { error } = await admin.rpc("liberar_arquivo_lote", { p_lote: loteId, p_user: userId });
  if (error) console.error("[cota] falha ao liberar reserva do lote:", error.message);
}

module.exports = { iniciarLote, autorizarArquivo, liberarArquivo, ehEmailAdmin, erroHttp, usoNoPeriodo, buscarAssinaturaAtiva };
