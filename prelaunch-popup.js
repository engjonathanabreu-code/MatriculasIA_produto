(function () {
  const style = document.createElement('style');
  style.textContent = `
    .prelaunch-overlay{position:fixed;inset:0;background:rgba(15,23,42,.58);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:99999;opacity:0;visibility:hidden;transition:.2s ease}
    .prelaunch-overlay.is-open{opacity:1;visibility:visible}
    .prelaunch-modal{position:relative;width:min(560px,100%);max-height:min(760px,92vh);overflow:auto;background:#fff;border:1px solid #e4e7ec;border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.28);padding:30px}
    .prelaunch-close{position:absolute;right:16px;top:14px;width:38px;height:38px;border:0;border-radius:50%;background:#f2f4f7;color:#344054;font-size:24px;line-height:1;cursor:pointer}
    .prelaunch-tag{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
    .prelaunch-modal h2{font-size:28px;line-height:1.15;letter-spacing:-.03em;margin:0 42px 10px 0;color:#101828}
    .prelaunch-modal .prelaunch-lead{font-size:14px;line-height:1.6;color:#667085;margin:0 0 22px}
    .prelaunch-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .prelaunch-field{margin-bottom:14px}.prelaunch-field.full{grid-column:1/-1}
    .prelaunch-field label{display:block;font-size:12px;font-weight:700;color:#344054;margin-bottom:6px}
    .prelaunch-field input,.prelaunch-field select{width:100%;height:46px;border:1px solid #d0d5dd;border-radius:10px;padding:0 12px;font:inherit;background:#fff;color:#101828;outline:none}
    .prelaunch-field input:focus,.prelaunch-field select:focus{border-color:#84adff;box-shadow:0 0 0 4px #eff4ff}
    .prelaunch-submit{width:100%;height:48px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-weight:750;cursor:pointer}.prelaunch-submit:hover{background:#1d4ed8}.prelaunch-submit:disabled{opacity:.6;cursor:wait}
    .prelaunch-msg{display:none;margin-top:12px;padding:11px 12px;border-radius:9px;font-size:12px}.prelaunch-msg.ok{display:block;background:#ecfdf3;color:#067647}.prelaunch-msg.err{display:block;background:#fef3f2;color:#b42318}
    .prelaunch-fine{font-size:10px;line-height:1.5;color:#98a2b3;text-align:center;margin:12px 0 0}
    .prelaunch-trigger{position:fixed;right:22px;bottom:22px;z-index:9998;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:13px 18px;font:inherit;font-size:13px;font-weight:750;box-shadow:0 12px 30px rgba(37,99,235,.28);cursor:pointer}
    @media(max-width:620px){.prelaunch-modal{padding:24px 18px;border-radius:18px}.prelaunch-grid{grid-template-columns:1fr}.prelaunch-field.full{grid-column:auto}.prelaunch-trigger{right:14px;bottom:14px}.prelaunch-modal h2{font-size:24px}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'prelaunch-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Pré-cadastro para versão de testes');
  overlay.innerHTML = `
    <div class="prelaunch-modal">
      <button class="prelaunch-close" type="button" aria-label="Fechar">×</button>
      <span class="prelaunch-tag">Pré-lançamento</span>
      <h2>Quer testar o Matrícula.IA antes do lançamento?</h2>
      <p class="prelaunch-lead">Cadastre seus dados para entrar na lista de acesso antecipado. Avisaremos por WhatsApp ou e-mail quando sua versão de testes estiver disponível.</p>
      <form id="prelaunchForm">
        <div class="prelaunch-grid">
          <div class="prelaunch-field full"><label for="preNome">Nome completo</label><input id="preNome" name="nome" autocomplete="name" required></div>
          <div class="prelaunch-field"><label for="preWhatsapp">WhatsApp</label><input id="preWhatsapp" name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="(47) 99999-9999" required></div>
          <div class="prelaunch-field"><label for="preEmail">E-mail</label><input id="preEmail" name="email" type="email" autocomplete="email" required></div>
          <div class="prelaunch-field full"><label for="preArea">Área de atuação</label><select id="preArea" name="area" required><option value="">Selecione</option><option>Engenharia</option><option>Topografia / Agrimensura</option><option>Arquitetura</option><option>Regularização fundiária / REURB</option><option>Cartório / Registro de Imóveis</option><option>Prefeitura / Gestão Pública</option><option>Advocacia / Direito Imobiliário</option><option>Imobiliária</option><option>Outro</option></select></div>
        </div>
        <button class="prelaunch-submit" id="prelaunchSubmit" type="submit">Quero participar do teste</button>
        <div id="prelaunchMsg" class="prelaunch-msg"></div>
        <p class="prelaunch-fine">Seus dados serão usados somente para contato relacionado ao pré-lançamento do Matrícula.IA.</p>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const trigger = document.createElement('button');
  trigger.className = 'prelaunch-trigger';
  trigger.type = 'button';
  trigger.textContent = 'Quero testar antes';
  document.body.appendChild(trigger);

  const closeBtn = overlay.querySelector('.prelaunch-close');
  function openModal(){overlay.classList.add('is-open'); document.body.style.overflow='hidden';}
  function closeModal(){overlay.classList.remove('is-open'); document.body.style.overflow='';}
  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

  let visitorKey = localStorage.getItem('matriculaia_visitor');
  if (!visitorKey) { visitorKey = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(); localStorage.setItem('matriculaia_visitor', visitorKey); }
  fetch('/api/site-visit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:location.pathname, visitorKey}) }).catch(()=>{});

  const form = overlay.querySelector('#prelaunchForm');
  const submit = overlay.querySelector('#prelaunchSubmit');
  const msg = overlay.querySelector('#prelaunchMsg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); submit.disabled = true; submit.textContent = 'Enviando...'; msg.className = 'prelaunch-msg';
    try {
      const r = await fetch('/api/prelaunch-register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nomeCompleto:form.nome.value, whatsapp:form.whatsapp.value, email:form.email.value, areaAtuacao:form.area.value}) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'Não foi possível cadastrar.');
      msg.textContent = 'Pré-cadastro realizado. Vamos entrar em contato quando a versão de testes for liberada.'; msg.className = 'prelaunch-msg ok'; form.reset();
      localStorage.setItem('matriculaia_prelaunch_registered','1');
    } catch (err) { msg.textContent = err.message; msg.className = 'prelaunch-msg err'; }
    finally { submit.disabled = false; submit.textContent = 'Quero participar do teste'; }
  });

  if (localStorage.getItem('matriculaia_prelaunch_registered') !== '1') {
    setTimeout(openModal, 900);
  }
})();
