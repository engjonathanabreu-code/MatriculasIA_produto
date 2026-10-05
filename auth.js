/**
 * auth.js
 * ---------------------------------------------------------------------------
 * Controla a tela de login/cadastro, a sessao do usuario, o indicador de uso
 * na sidebar e a pagina "Minha conta" (planos + assinatura via Stripe).
 *
 * So depois que existe uma sessao valida e que o app.js principal e' iniciado
 * (via window.__iniciarAppPrincipal, definido em app.js).
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // Chave publica de teste do Cloudflare Turnstile (sempre aprova) - troque
  // pela sua chave real (dashboard.cloudflare.com -> Turnstile) quando for
  // para producao de verdade. Colocar a chave aqui e seguro, e publica por
  // natureza (a protecao real esta na chave secreta, so no servidor).
  var TURNSTILE_SITE_KEY = "0x4AAAAAAEhJ_ng8WKl9r9RD";

  var state = {
    modo: "entrar", // 'entrar' | 'cadastrar'
    turnstileToken: null,
    turnstileWidgetId: null,
    session: null
  };

  function esc(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function mostrarErroAuth(msg) {
    var el = document.getElementById("auth-error");
    el.textContent = msg;
    el.hidden = false;
  }

  function mostrarErroAuthComAcao(msg, textoBotao, aoClicar) {
    var el = document.getElementById("auth-error");
    el.innerHTML = "";
    el.appendChild(document.createTextNode(msg + " "));
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "auth-error-action";
    botao.textContent = textoBotao;
    botao.addEventListener("click", aoClicar);
    el.appendChild(botao);
    el.hidden = false;
  }
  function esconderErroAuth() {
    var el = document.getElementById("auth-error");
    el.hidden = true;
  }

  function renderTurnstile() {
    if (typeof turnstile === "undefined") {
      // biblioteca ainda nao carregou (script async) - tenta de novo em breve
      setTimeout(renderTurnstile, 300);
      return;
    }
    if (state.turnstileWidgetId != null) return; // ja renderizado
    state.turnstileWidgetId = turnstile.render("#turnstile-widget", {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: "interaction-only",
      callback: function (token) { state.turnstileToken = token; },
      "expired-callback": function () { state.turnstileToken = null; }
    });
  }

  function getTurnstileToken() {
    return state.turnstileToken;
  }

  function atualizarCamposCadastro(modo) {
    var wrap = document.getElementById("campos-cadastro");
    var campoTermos = document.getElementById("campo-aceite-termos");
    var forcaSenhaWrap = document.getElementById("forca-senha-wrap");
    var ehCadastro = modo === "cadastrar";
    wrap.hidden = !ehCadastro;
    wrap.style.display = ehCadastro ? "flex" : "none";
    campoTermos.hidden = !ehCadastro;
    campoTermos.style.display = ehCadastro ? "flex" : "none";
    forcaSenhaWrap.hidden = !ehCadastro;
    forcaSenhaWrap.style.display = ehCadastro ? "flex" : "none";
    document.getElementById("auth-cpf").required = ehCadastro;
    document.getElementById("auth-telefone").required = ehCadastro;
    document.getElementById("auth-aceite-termos").checked = false;
  }

  /** Estima a forca da senha (0-6) com base em criterios simples e comuns. */
  function calcularForcaSenha(senha) {
    var pontos = 0;
    if (senha.length >= 8) pontos++;
    if (senha.length >= 12) pontos++;
    if (/[a-z]/.test(senha)) pontos++;
    if (/[A-Z]/.test(senha)) pontos++;
    if (/[0-9]/.test(senha)) pontos++;
    if (/[^A-Za-z0-9]/.test(senha)) pontos++;
    return pontos;
  }

  function atualizarMedidorSenha() {
    var senha = document.getElementById("auth-senha").value;
    var fill = document.getElementById("forca-senha-fill");
    var texto = document.getElementById("forca-senha-texto");

    if (!senha) {
      fill.style.width = "0%";
      texto.textContent = "";
      return;
    }

    var pontos = calcularForcaSenha(senha);
    var config;
    if (pontos <= 2) config = { largura: "25%", cor: "var(--error)", texto: "Fraca - tente adicionar mais caracteres, numeros e simbolos" };
    else if (pontos <= 3) config = { largura: "50%", cor: "#e08a1e", texto: "Razoavel - ja pode ser aceitavel, mas pode melhorar" };
    else if (pontos <= 4) config = { largura: "75%", cor: "#2e7d32", texto: "Boa - senha aceitavel" };
    else config = { largura: "100%", cor: "var(--ok)", texto: "Forte - otima senha" };

    fill.style.width = config.largura;
    fill.style.background = config.cor;
    texto.textContent = config.texto;
    texto.style.color = config.cor;
  }

  function initAuthTabs() {
    var tabs = document.querySelectorAll(".auth-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        state.modo = tab.dataset.authTab;
        document.getElementById("btn-auth-submit").textContent = state.modo === "cadastrar" ? "Criar conta" : "Entrar";
        atualizarCamposCadastro(state.modo);
        esconderErroAuth();
      });
    });

    // Quem chega da landing page com um plano escolhido (?plano=basico/pro/expert/trial)
    // provavelmente ainda nao tem conta - abre direto na aba de cadastro.
    if (new URLSearchParams(window.location.search).get("plano")) {
      var tabCadastrar = document.querySelector('.auth-tab[data-auth-tab="cadastrar"]');
      if (tabCadastrar) tabCadastrar.click();
    }
  }

  function initMascarasCadastro() {
    var cpfInput = document.getElementById("auth-cpf");
    cpfInput.addEventListener("input", function () {
      var v = cpfInput.value.replace(/\D/g, "").slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
      cpfInput.value = v;
    });

    var telInput = document.getElementById("auth-telefone");
    telInput.addEventListener("input", function () {
      var v = telInput.value.replace(/\D/g, "").slice(0, 11);
      if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
      else if (v.length > 5) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
      else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
      telInput.value = v;
    });

    document.getElementById("auth-senha").addEventListener("input", atualizarMedidorSenha);
  }

  /** Validacao real de CPF (digitos verificadores) - nao aceita qualquer sequencia de 11 numeros. */
  function cpfValido(cpfFormatado) {
    var cpf = String(cpfFormatado || "").replace(/\D/g, "");
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    var soma = 0, resto;
    for (var i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10), 10)) return false;
    soma = 0;
    for (i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(cpf.substring(10, 11), 10);
  }

  function initAuthForm() {
    document.getElementById("form-auth").addEventListener("submit", async function (e) {
      e.preventDefault();
      esconderErroAuth();
      var email = document.getElementById("auth-email").value.trim();
      var senha = document.getElementById("auth-senha").value;
      var btn = document.getElementById("btn-auth-submit");
      btn.disabled = true;

      try {
        var captchaToken = getTurnstileToken();
        if (state.modo === "cadastrar") {
          var cpf = document.getElementById("auth-cpf").value.trim();
          var telefone = document.getElementById("auth-telefone").value.trim();

          if (!cpfValido(cpf)) {
            mostrarErroAuth("CPF invalido. Confira os numeros digitados.");
            btn.disabled = false;
            return;
          }
          if (telefone.replace(/\D/g, "").length < 10) {
            mostrarErroAuth("Telefone invalido. Informe DDD + numero.");
            btn.disabled = false;
            return;
          }
          if (!document.getElementById("auth-aceite-termos").checked) {
            mostrarErroAuth("E preciso aceitar os Termos de Uso para criar a conta.");
            btn.disabled = false;
            return;
          }

          var optionsCadastro = { data: { cpf: cpf, telefone: telefone, termos_aceitos_em: new Date().toISOString() } };
          if (captchaToken) optionsCadastro.captchaToken = captchaToken;

          var { error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: senha,
            options: optionsCadastro
          });
          if (error) throw error;
          mostrarErroAuth("Conta criada! Se a confirmacao de e-mail estiver ativada, verifique sua caixa de entrada antes de entrar.");
        } else {
          var resp = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: senha,
            options: captchaToken ? { captchaToken: captchaToken } : undefined
          });
          if (resp.error) throw resp.error;
        }
      } catch (err) {
        var msgTraduzida = traduzErroAuth(err && err.message ? err.message : String(err));
        if (msgTraduzida === "EMAIL_NAO_CONFIRMADO") {
          mostrarErroAuthComAcao(
            "Este e-mail ainda nao foi confirmado.",
            "Reenviar e-mail de confirmacao",
            function () { reenviarConfirmacao(email); }
          );
        } else {
          mostrarErroAuth(msgTraduzida || "Erro inesperado ao autenticar. Tente novamente.");
        }
      } finally {
        btn.disabled = false;
        if (state.turnstileWidgetId != null && typeof turnstile !== "undefined") {
          turnstile.reset(state.turnstileWidgetId);
        }
      }
    });
  }

  function traduzErroAuth(msg) {
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
    if (/user already registered/i.test(msg)) return "Ja existe uma conta com esse e-mail. Tente entrar.";
    if (/password.*at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/email not confirmed/i.test(msg)) return "EMAIL_NAO_CONFIRMADO";
    if (/password.*(known|weak|easy to guess|pwned|compromised|breach)/i.test(msg)) {
      return "Essa senha e conhecida por ja ter vazado em outros sites e nao e segura. Escolha uma senha diferente, de preferencia unica.";
    }
    return msg;
  }

  async function reenviarConfirmacao(email) {
    try {
      await window.supabaseClient.auth.resend({ type: "signup", email: email });
      mostrarErroAuth("E-mail de confirmacao reenviado. Confira sua caixa de entrada (e o spam).");
    } catch (e) {
      mostrarErroAuth("Nao foi possivel reenviar o e-mail: " + e.message);
    }
  }

  function mostrarGateDeAuth() {
    var gate = document.getElementById("auth-gate");
    gate.hidden = false;
    gate.style.display = "flex";
    document.querySelector(".app-shell").style.display = "none";
    renderTurnstile();
  }

  function esconderGateDeAuth() {
    var gate = document.getElementById("auth-gate");
    gate.hidden = true;
    gate.style.display = "none";
    document.querySelector(".app-shell").style.display = "";
  }

  // ==========================================================================
  // CONTA / PLANOS / USO
  // ==========================================================================
  async function carregarDadosDaConta() {
    var sb = window.supabaseClient;
    var userId = state.session.user.id;

    var { data: assinatura } = await sb
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    var usoAtual = 0;
    if (assinatura) {
      var inicioPeriodo = assinatura.periodo_inicio || assinatura.criado_em;
      if (assinatura.plans && assinatura.plans.conta_por_lote) {
        // Plano Testes: 1 analise = 1 lote (clique em "Analisar") com ao menos 1 arquivo concluido
        var { data: usos } = await sb
          .from("analysis_usage")
          .select("lote_id")
          .eq("user_id", userId)
          .eq("sucesso", true)
          .gte("criado_em", inicioPeriodo)
          .not("lote_id", "is", null);
        usoAtual = new Set((usos || []).map(function (u) { return u.lote_id; })).size;
      } else {
        var { count } = await sb
          .from("analysis_usage")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("criado_em", inicioPeriodo);
        usoAtual = count || 0;
      }
    }
    state.assinatura = assinatura || null;

    renderIndicadorUso(assinatura, usoAtual);
    renderPaginaConta(assinatura, usoAtual);
  }

  function renderIndicadorUso(assinatura, usoAtual) {
    var el = document.getElementById("usage-indicator");
    if (!assinatura) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var limite = assinatura.plans.limite_analises;
    var pct = limite > 0 ? Math.min(100, Math.round((usoAtual / limite) * 100)) : 0;
    document.getElementById("usage-plan-name").textContent = assinatura.plans.nome;
    document.getElementById("usage-bar-fill").style.width = pct + "%";
    document.getElementById("usage-text").textContent = usoAtual + " / " + limite + " analises";
    if (pct >= 90) document.getElementById("usage-bar-fill").style.background = "#c0362c";
  }

  function renderPaginaConta(assinatura, usoAtual) {
    document.getElementById("conta-carregando").hidden = true;
    var semPlano = document.getElementById("conta-sem-plano");
    var comPlano = document.getElementById("conta-com-plano");
    var btnGerenciar = document.getElementById("btn-gerenciar-assinatura");

    // Sem nenhuma assinatura, ou so o teste gratuito (que nao passa pelo
    // Stripe): mostra os planos para assinar. O teste gratuito tambem mostra
    // o resumo de uso acima, mas sem o botao "gerenciar assinatura" (nao ha
    // nada no Stripe para gerenciar ainda).
    // Planos sem cobranca no Stripe (teste gratuito e Plano Testes): mostra os
    // planos pagos para assinar e esconde "gerenciar assinatura".
    var ehTeste = !!assinatura && !assinatura.stripe_subscription_id;

    if (!assinatura) {
      semPlano.hidden = false;
      comPlano.hidden = true;
      return;
    }

    comPlano.hidden = false;
    semPlano.hidden = !ehTeste;
    btnGerenciar.hidden = ehTeste;

    document.getElementById("conta-plano-nome").textContent = assinatura.plans.nome;
    document.getElementById("conta-uso-atual").textContent = usoAtual + " / " + assinatura.plans.limite_analises;
    document.getElementById("conta-status").textContent = assinatura.status === "active" ? "Ativa" : assinatura.status;
    document.getElementById("conta-renovacao").textContent = assinatura.periodo_fim
      ? new Date(assinatura.periodo_fim).toLocaleDateString("pt-BR")
      : (ehTeste ? "Não renova (uso único)" : "N/D");
    var maxArq = assinatura.plans.max_arquivos_por_analise;
    var notaLote = document.getElementById("conta-nota-lote");
    if (notaLote) {
      notaLote.hidden = !assinatura.plans.conta_por_lote;
      notaLote.textContent = assinatura.plans.conta_por_lote
        ? "No " + assinatura.plans.nome + ", cada clique em \"Analisar\" conta como 1 análise e pode incluir até " + (maxArq || 10) + " arquivos."
        : "";
    }
  }

  async function chamarApiComAuth(url, body) {
    var session = state.session;
    var resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token
      },
      body: JSON.stringify(body || {})
    });
    var json = await resp.json();
    if (!resp.ok || !json.sucesso) throw new Error(json.erro || "Erro ao comunicar com o servidor.");
    return json;
  }

  function initBotoesDePlanos() {
    document.querySelectorAll("[data-assinar-plano]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.textContent = "Redirecionando...";
        try {
          var json = await chamarApiComAuth("/api/create-checkout-session", { planId: btn.dataset.assinarPlano });
          window.location.href = json.url;
        } catch (err) {
          alert("Nao foi possivel iniciar a assinatura: " + err.message);
          btn.disabled = false;
        }
      });
    });

    document.getElementById("btn-gerenciar-assinatura").addEventListener("click", async function () {
      this.disabled = true;
      try {
        var json = await chamarApiComAuth("/api/create-portal-session", {});
        window.location.href = json.url;
      } catch (err) {
        alert("Nao foi possivel abrir o portal de assinatura: " + err.message);
        this.disabled = false;
      }
    });
  }

  function initLogout() {
    document.getElementById("btn-sair").addEventListener("click", async function () {
      if (!confirm("Sair da sua conta?")) return;
      await window.supabaseClient.auth.signOut();
    });
  }

  // ==========================================================================
  // PRIMEIRO ACESSO (contas criadas pelo admin: troca da senha provisoria;
  // qualquer conta sem aceite registrado: aceite dos Termos e Privacidade)
  // ==========================================================================
  var _primeiroAcessoPendente = null; // { trocarSenha: bool }

  function setVisivel(el, visivel, display) {
    el.hidden = !visivel;
    el.style.display = visivel ? (display || "") : "none";
  }

  function mostrarErroPA(msg) {
    var el = document.getElementById("pa-erro");
    el.textContent = msg;
    setVisivel(el, !!msg, "block");
  }

  async function buscarPendenciaPrimeiroAcesso(userId) {
    var resp = await window.supabaseClient
      .from("profiles")
      .select("deve_trocar_senha, termos_aceitos_em")
      .eq("id", userId)
      .maybeSingle();
    if (resp.error) throw resp.error;
    var p = resp.data;
    if (!p) return null;
    if (p.deve_trocar_senha || !p.termos_aceitos_em) return { trocarSenha: !!p.deve_trocar_senha };
    return null;
  }

  function mostrarPrimeiroAcesso(pendencia) {
    _primeiroAcessoPendente = pendencia;
    var camposSenha = document.getElementById("pa-campos-senha");
    camposSenha.classList.toggle("pa-oculto", !pendencia.trocarSenha);
    document.getElementById("pa-senha").value = "";
    document.getElementById("pa-senha2").value = "";
    document.getElementById("pa-aceite").checked = false;
    document.getElementById("pa-subtitulo").textContent = pendencia.trocarSenha
      ? "Sua conta foi criada com uma senha provisória. Defina sua senha pessoal e confirme que está de acordo com os termos para começar."
      : "Atualizamos nossos termos. Para continuar, confirme que está de acordo com os Termos de Serviço e a Política de Privacidade.";
    mostrarErroPA("");
    setVisivel(document.getElementById("primeiro-acesso-gate"), true, "flex");
    document.querySelector(".app-shell").style.display = "none";
  }

  function esconderPrimeiroAcesso() {
    _primeiroAcessoPendente = null;
    setVisivel(document.getElementById("primeiro-acesso-gate"), false);
  }

  function atualizarMedidorPA() {
    var senha = document.getElementById("pa-senha").value;
    var fill = document.getElementById("pa-forca-fill");
    var texto = document.getElementById("pa-forca-texto");
    if (!senha) { fill.style.width = "0%"; texto.textContent = ""; return; }
    var pontos = calcularForcaSenha(senha);
    var c = pontos <= 2 ? ["25%", "var(--error)", "Fraca"]
      : pontos <= 3 ? ["50%", "#e08a1e", "Razoável"]
      : pontos <= 4 ? ["75%", "#2e7d32", "Boa"]
      : ["100%", "var(--ok)", "Forte"];
    fill.style.width = c[0]; fill.style.background = c[1];
    texto.textContent = c[2]; texto.style.color = c[1];
  }

  function initPrimeiroAcesso() {
    document.getElementById("pa-senha").addEventListener("input", atualizarMedidorPA);
    document.getElementById("pa-sair").addEventListener("click", function () {
      window.supabaseClient.auth.signOut();
    });
    document.getElementById("form-primeiro-acesso").addEventListener("submit", async function (e) {
      e.preventDefault();
      mostrarErroPA("");
      var pend = _primeiroAcessoPendente || { trocarSenha: false };
      var senha = document.getElementById("pa-senha").value;
      var senha2 = document.getElementById("pa-senha2").value;

      if (pend.trocarSenha) {
        if (senha.length < 8) return mostrarErroPA("A nova senha precisa ter pelo menos 8 caracteres.");
        if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return mostrarErroPA("Use letras e números na nova senha.");
        if (senha !== senha2) return mostrarErroPA("As duas senhas não conferem.");
      }
      if (!document.getElementById("pa-aceite").checked) {
        return mostrarErroPA("Para continuar, é preciso concordar com os Termos de Serviço e a Política de Privacidade.");
      }

      var btn = document.getElementById("pa-enviar");
      btn.disabled = true;
      btn.textContent = "Salvando...";
      try {
        var json = await chamarApiComAuth("/api/primeiro-acesso", {
          novaSenha: pend.trocarSenha ? senha : undefined,
          aceiteTermos: true
        });
        if (json.senhaAlterada) {
          // a senha mudou no servidor: renova a sessao (se nao der, pede login de novo)
          var r = await window.supabaseClient.auth.refreshSession();
          if (r.error || !r.data || !r.data.session) {
            esconderPrimeiroAcesso();
            await window.supabaseClient.auth.signOut();
            mostrarErroAuth("Senha alterada com sucesso! Entre novamente com a sua nova senha.");
            return;
          }
          state.session = r.data.session;
        }
        esconderPrimeiroAcesso();
        liberarApp(state.session);
      } catch (err) {
        mostrarErroPA(err.message || "Não foi possível salvar. Tente novamente.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Salvar e continuar";
      }
    });
  }

  /** Mostra o app principal (so depois que o primeiro acesso esta concluido). */
  var _appLiberado = false;
  function liberarApp(session) {
    _appLiberado = true;
    esconderGateDeAuth();
    carregarDadosDaConta();
    if (typeof window.__iniciarAppPrincipal === "function") {
      window.__iniciarAppPrincipal(session);
    }
  }

  // ==========================================================================
  // BOOT
  // ==========================================================================
  document.addEventListener("DOMContentLoaded", function () {
    initAuthTabs();
    initAuthForm();
    initMascarasCadastro();
    initBotoesDePlanos();
    initLogout();
    initPrimeiroAcesso();

    // Plano escolhido na landing page (index.html?plano=basico|pro|expert|trial),
    // capturado uma unica vez ao carregar a pagina.
    var planoDesejado = new URLSearchParams(window.location.search).get("plano");

    window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      state.session = session;
      if (session) {
        // Checa o primeiro acesso FORA do callback (o supabase-js pode travar
        // se outra chamada dele for aguardada dentro do onAuthStateChange).
        var gateAuth = document.getElementById("auth-gate");
        gateAuth.hidden = true;
        gateAuth.style.display = "none";
        if (!_appLiberado) document.querySelector(".app-shell").style.display = "none";
        setTimeout(function () {
          buscarPendenciaPrimeiroAcesso(session.user.id)
            .catch(function (e) {
              console.error("[auth] falha ao checar primeiro acesso:", e);
              return null; // o servidor bloqueia as analises de qualquer forma
            })
            .then(function (pendencia) {
              if (!state.session) return; // saiu nesse meio tempo
              if (pendencia) { if (!_primeiroAcessoPendente) mostrarPrimeiroAcesso(pendencia); }
              else if (!_primeiroAcessoPendente) liberarApp(state.session);
            });
        }, 0);

        // So redireciona automaticamente para o checkout em um login/cadastro
        // FRESCO desta sessao de navegador (evento SIGNED_IN), nunca ao apenas
        // restaurar uma sessao ja existente (INITIAL_SESSION) - senao o
        // usuario seria jogado pro Stripe toda vez que so recarregasse a pagina.
        if (event === "SIGNED_IN" && planoDesejado && ["basico", "pro", "expert"].indexOf(planoDesejado) !== -1) {
          var planoParaAssinar = planoDesejado;
          planoDesejado = null; // consome uma unica vez
          chamarApiComAuth("/api/create-checkout-session", { planId: planoParaAssinar })
            .then(function (json) { window.location.href = json.url; })
            .catch(function (err) {
              mostrarErroAuth("Nao foi possivel iniciar a assinatura do plano " + planoParaAssinar + ": " + err.message);
            });
        }
      } else {
        _appLiberado = false;
        esconderPrimeiroAcesso();
        mostrarGateDeAuth();
      }
    });
  });

  // Exposto para o app.js poder pedir o token/turnstile na hora de analisar
  window.__auth = {
    getAccessToken: function () { return state.session ? state.session.access_token : null; },
    getTurnstileToken: getTurnstileToken,
    getMaxArquivosPorAnalise: function () {
      var p = state.assinatura && state.assinatura.plans;
      return (p && p.max_arquivos_por_analise) || 10;
    },
    abrirPrimeiroAcesso: function () {
      if (!state.session) return;
      buscarPendenciaPrimeiroAcesso(state.session.user.id)
        .then(function (p) { if (p && !_primeiroAcessoPendente) mostrarPrimeiroAcesso(p); })
        .catch(function (e) { console.error("[auth] primeiro acesso:", e); });
    },
    recarregarConta: carregarDadosDaConta
  };
})();
