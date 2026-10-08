(function () {
  'use strict';
  window.mountSupportConversation = function (container, endpoint, getToken, ticketId, includeOriginal) {
    var history = document.createElement('div'), form = document.createElement('form');
    var label = document.createElement('label'), input = document.createElement('textarea');
    var send = document.createElement('button'), refresh = document.createElement('button'), notice = document.createElement('p');
    container.classList.add('support-conversation');
    label.textContent = 'Nova mensagem'; input.maxLength = 20000; input.required = true; input.rows = 4;
    label.appendChild(input); send.type = 'submit'; send.textContent = 'Enviar mensagem';
    refresh.type = 'button'; refresh.textContent = 'Atualizar conversa';
    notice.setAttribute('role', 'status');
    form.append(label, send, refresh, notice); container.append(history, form);
    async function request(method, body) {
      var token = getToken();
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
      var response = await fetch(endpoint + (method === 'GET' ? '?id=' + encodeURIComponent(ticketId) : ''), {
        method: method, headers: { Authorization:'Bearer ' + token, 'Content-Type':'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      var result = await response.json();
      if (!response.ok || !result.sucesso) throw new Error(result.erro || 'Não foi possível carregar a conversa.');
      return result;
    }
    function message(m) {
      var item = document.createElement('div'), head = document.createElement('strong'), text = document.createElement('p');
      item.className = 'support-message ' + m.autor;
      head.textContent = (m.autor === 'suporte' ? 'Suporte' : 'Cliente') + ' · ' + new Date(m.criado_em).toLocaleString('pt-BR');
      text.textContent = m.conteudo_texto; item.append(head, text); history.appendChild(item);
    }
    async function load() {
      try {
        var result = await request('GET'); history.replaceChildren();
        if (includeOriginal) message({autor:'cliente', conteudo_texto:result.chamado.conteudo_texto, criado_em:result.chamado.criado_em});
        result.mensagens.forEach(message);
      } catch (error) { notice.textContent = error.message; }
    }
    refresh.onclick = function () { notice.textContent = ''; load(); };
    form.onsubmit = async function (event) {
      event.preventDefault(); if (send.disabled) return;
      if (!input.value.trim()) return;
      send.disabled = true; notice.textContent = 'Enviando…';
      try {
        await request('POST', {ticketId:ticketId, mensagem:input.value});
        input.value = ''; notice.textContent = 'Mensagem enviada.'; await load();
      } catch (error) { notice.textContent = error.message; }
      finally { send.disabled = false; }
    };
    load();
  };
})();
