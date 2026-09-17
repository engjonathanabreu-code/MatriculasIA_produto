/**
 * support.js
 * ---------------------------------------------------------------------------
 * Chamados de suporte dentro do app: modal com editor de texto rico
 * (negrito, italico, sublinhado, tamanho de fonte, estilo de paragrafo,
 * alinhamento e listas) e lista "Meus chamados" em Minha conta.
 * Os chamados vao para /api/support-tickets e aparecem no Site ADM.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var TIPOS = { erro: "Erro", sugestao: "Sugestão", duvida: "Dúvida", outro: "Outro" };
  var STATUS = { aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido", fechado: "Fechado" };

  var modal, form, editor, titulo, msg, submitBtn, success, lastFocus, savedRange;

  function token() {
    return window.__auth && typeof window.__auth.getAccessToken === "function" ? window.__auth.getAccessToken() : null;
  }

  function show(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.style.display = visible ? "" : "none";
  }

  function setMsg(text) {
    msg.textContent = text || "";
    show(msg, !!text);
  }

  // ------------------------------------------------------------------ editor
  function saveSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    editor.focus();
    if (!savedRange) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function exec(cmd, value) {
    restoreSelection();
    try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* noop */ }
    document.execCommand(cmd, false, value == null ? null : value);
    saveSelection();
    updateToolbarState();
  }

  function applyFontSize(px) {
    restoreSelection();
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      setMsg("Selecione o trecho do texto antes de mudar o tamanho da fonte.");
      return;
    }
    setMsg("");
    try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* noop */ }
    document.execCommand("fontSize", false, "7");
    editor.querySelectorAll('font[size="7"]').forEach(function (font) {
      var span = document.createElement("span");
      span.style.fontSize = px;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.parentNode.replaceChild(span, font);
    });
    // Navegadores que usam CSS no lugar de <font>
    editor.querySelectorAll("span").forEach(function (span) {
      if (span.style.fontSize === "xxx-large" || span.style.fontSize === "-webkit-xxx-large") span.style.fontSize = px;
    });
    saveSelection();
  }

  function updateToolbarState() {
    ["bold", "italic", "underline", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull", "insertUnorderedList", "insertOrderedList"].forEach(function (cmd) {
      var btn = form.querySelector('.support-toolbar button[data-cmd="' + cmd + '"]');
      if (!btn) return;
      var on = false;
      try { on = document.queryCommandState(cmd); } catch (e) { on = false; }
      btn.classList.toggle("is-active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function initToolbar() {
    var toolbar = form.querySelector(".support-toolbar");
    toolbar.addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) e.preventDefault(); // nao perde a selecao
    });
    toolbar.querySelectorAll("button[data-cmd]").forEach(function (btn) {
      btn.addEventListener("click", function () { exec(btn.dataset.cmd); });
    });
    toolbar.querySelectorAll("select[data-cmd]").forEach(function (select) {
      select.addEventListener("change", function () {
        var value = select.value;
        if (!value) return;
        if (select.dataset.cmd === "fontSizePx") {
          applyFontSize(value);
          select.value = "";
        } else {
          exec("formatBlock", "<" + value + ">");
          select.value = "";
        }
      });
    });
    ["keyup", "mouseup", "input", "focus"].forEach(function (ev) {
      editor.addEventListener(ev, function () { saveSelection(); updateToolbarState(); });
    });
    document.addEventListener("selectionchange", function () {
      if (!modal.hidden && document.activeElement === editor) updateToolbarState();
    });
    // Colar sempre como texto simples (evita trazer HTML externo)
    editor.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });
    editor.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = e.key.toLowerCase();
      if (k === "b" || k === "i" || k === "u") {
        e.preventDefault();
        exec(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
      }
    });
  }

  function editorText() {
    return (editor.innerText || "").replace(/\u00a0/g, " ").trim();
  }

  // ------------------------------------------------------------------ modal
  function openModal() {
    if (!token()) {
      alert("Entre na sua conta para abrir um chamado.");
      return;
    }
    lastFocus = document.activeElement;
    show(form, true);
    show(success, false);
    setMsg("");
    show(modal, true);
    document.body.style.overflow = "hidden";
    setTimeout(function () { titulo.focus(); }, 30);
  }

  function closeModal() {
    show(modal, false);
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function resetForm() {
    form.reset();
    editor.innerHTML = "";
    savedRange = null;
    updateToolbarState();
  }

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    var t = titulo.value.trim();
    if (t.length < 3) { setMsg("Informe um título com pelo menos 3 caracteres."); titulo.focus(); return; }
    if (editorText().length < 5) { setMsg("Descreva o chamado com um pouco mais de detalhe."); editor.focus(); return; }
    var accessToken = token();
    if (!accessToken) { setMsg("Sua sessão expirou. Entre novamente para enviar o chamado."); return; }

    var tipo = (form.querySelector('input[name="support-tipo"]:checked') || {}).value || "outro";
    var activeView = document.querySelector(".nav-item.active");

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";
    try {
      var resp = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({
          tipo: tipo,
          titulo: t,
          conteudoHtml: editor.innerHTML,
          paginaOrigem: activeView ? activeView.dataset.view : ""
        })
      });
      var json = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !json.sucesso) throw new Error(json.erro || "Não foi possível enviar o chamado.");
      resetForm();
      show(form, false);
      show(success, true);
      loadMyTickets();
    } catch (err) {
      setMsg(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar chamado";
    }
  }

  // ------------------------------------------------------------ meus chamados
  function badge(cls, text) {
    var s = document.createElement("span");
    s.className = "support-badge " + cls;
    s.textContent = text;
    return s;
  }

  async function loadMyTickets() {
    var list = document.getElementById("support-my-list");
    var accessToken = token();
    if (!list || !accessToken) return;
    try {
      var resp = await fetch("/api/support-tickets", { headers: { Authorization: "Bearer " + accessToken } });
      var json = await resp.json();
      if (!resp.ok || !json.sucesso) throw new Error(json.erro);
      list.innerHTML = "";
      if (!json.chamados.length) {
        var empty = document.createElement("div");
        empty.className = "support-empty";
        empty.textContent = "Nenhum chamado aberto ainda.";
        list.appendChild(empty);
        return;
      }
      json.chamados.forEach(function (c) {
        var row = document.createElement("div");
        row.className = "support-my-item";
        var title = document.createElement("span");
        title.className = "support-my-title";
        title.textContent = c.titulo;
        title.title = c.titulo;
        var date = document.createElement("span");
        date.className = "support-my-date";
        date.textContent = new Date(c.criado_em).toLocaleDateString("pt-BR");
        row.appendChild(badge("support-badge--tipo", TIPOS[c.tipo] || c.tipo));
        row.appendChild(title);
        row.appendChild(date);
        row.appendChild(badge("support-badge--" + c.status, STATUS[c.status] || c.status));
        list.appendChild(row);
      });
    } catch (err) {
      console.warn("[support] não foi possível carregar os chamados", err);
    }
  }

  // ------------------------------------------------------------------- boot
  document.addEventListener("DOMContentLoaded", function () {
    modal = document.getElementById("support-modal");
    if (!modal) return;
    form = document.getElementById("support-form");
    editor = document.getElementById("support-editor");
    titulo = document.getElementById("support-titulo");
    msg = document.getElementById("support-msg");
    submitBtn = document.getElementById("support-submit");
    success = document.getElementById("support-success");
    show(modal, false);
    show(msg, false);
    show(success, false);

    initToolbar();
    form.addEventListener("submit", submit);
    document.querySelectorAll("[data-abrir-suporte]").forEach(function (b) { b.addEventListener("click", openModal); });
    modal.querySelectorAll("[data-fechar-suporte]").forEach(function (b) { b.addEventListener("click", closeModal); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    // Atualiza "Meus chamados" ao entrar em Minha conta e apos o login
    document.querySelectorAll('.nav-item[data-view="conta"]').forEach(function (b) { b.addEventListener("click", loadMyTickets); });
    if (window.supabaseClient) {
      window.supabaseClient.auth.onAuthStateChange(function (event, session) {
        if (session) setTimeout(loadMyTickets, 300);
      });
    }
  });

  window.__suporte = { abrir: openModal, recarregar: loadMyTickets };
})();
