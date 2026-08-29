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
  var TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

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
      callback: function (token) { state.turnstileToken = token; },
      "expired-callback": function () { state.turnstileToken = null; }
    });
  }

  function getTurnstileToken() {
    return state.turnstileToken;
  }

  function initAuthTabs() {
    var tabs = document.querySelectorAll(".auth-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        state.modo = tab.dataset.authTab;
        document.getElementById("btn-auth-submit").textContent = state.modo === "cadastrar" ? "Criar conta" : "Entrar";
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

  function initAuthForm() {
    document.getElementById("form-auth").addEventListener("submit", async function (e) {
      e.preventDefault();
      esconderErroAuth();
      var email = document.getElementById("auth-email").value.trim();
      var senha = document.getElementById("auth-senha").value;
      var btn = document.getElementById("btn-auth-submit");
      btn.disabled = true;

      try {
        if (state.modo === "cadastrar") {
          var { error } = await window.supabaseClient.auth.signUp({ email: email, password: senha });
          if (error) throw error;
          mostrarErroAuth("Conta criada! Se a confirmacao de e-mail estiver ativada, verifique sua caixa de entrada antes de entrar.");
        } else {
          var resp = await window.supabaseClient.auth.signInWithPassword({ email: email, password: senha });
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
      }
    });

    document.getElementById("btn-auth-google").addEventListener("click", async function () {
      esconderErroAuth();
      var { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin }
      });
      if (error) mostrarErroAuth(traduzErroAuth(error.message));
    });
  }

  function traduzErroAuth(msg) {
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
    if (/user already registered/i.test(msg)) return "Ja existe uma conta com esse e-mail. Tente entrar.";
    if (/password.*at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/email not confirmed/i.test(msg)) return "EMAIL_NAO_CONFIRMADO";
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
      var { count } = await sb
        .from("analysis_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("criado_em", inicioPeriodo);
      usoAtual = count || 0;
    }

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
    var ehTeste = assinatura && assinatura.plan_id === "trial";

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
      : (ehTeste ? "Nao renova (uso unico)" : "N/D");
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
  // BOOT
  // ==========================================================================
  document.addEventListener("DOMContentLoaded", function () {
    initAuthTabs();
    initAuthForm();
    initBotoesDePlanos();
    initLogout();

    // Plano escolhido na landing page (index.html?plano=basico|pro|expert|trial),
    // capturado uma unica vez ao carregar a pagina.
    var planoDesejado = new URLSearchParams(window.location.search).get("plano");

    window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      state.session = session;
      if (session) {
        esconderGateDeAuth();
        carregarDadosDaConta();
        if (typeof window.__iniciarAppPrincipal === "function") {
          window.__iniciarAppPrincipal(session);
        }

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
        mostrarGateDeAuth();
      }
    });
  });

  // Exposto para o app.js poder pedir o token/turnstile na hora de analisar
  window.__auth = {
    getAccessToken: function () { return state.session ? state.session.access_token : null; },
    getTurnstileToken: getTurnstileToken,
    recarregarConta: carregarDadosDaConta
  };
})();
