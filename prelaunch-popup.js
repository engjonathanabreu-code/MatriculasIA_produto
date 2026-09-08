(function () {
  const style = document.createElement('style');
  style.textContent = `
    .prelaunch-overlay{position:fixed;inset:0;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:24px;z-index:99999;opacity:0;visibility:hidden;transition:.2s ease}
    .prelaunch-overlay.is-open{opacity:1;visibility:visible}
    .prelaunch-overlay.is-minimized{background:transparent;pointer-events:none;align-items:flex-end;justify-content:flex-end;padding:20px}
    .prelaunch-modal{position:relative;width:min(560px,calc(100vw - 32px));max-height:min(760px,88vh);overflow:auto;background:#fff;border:1px solid #e4e7ec;border-radius:20px;box-shadow:0 28px 80px rgba(15,23,42,.28);padding:30px;pointer-events:auto;transition:.2s ease}
    .prelaunch-overlay.is-minimized .prelaunch-modal{width:310px;max-height:none;overflow:hidden;padding:0;border-radius:14px}
    .prelaunch-overlay.is-minimized .prelaunch-content{display:none}
    .prelaunch-windowbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-8px -8px 14px}
    .prelaunch-overlay.is-minimized .prelaunch-windowbar{margin:0;padding:13px 14px}
    .prelaunch-window-title{font-size:12px;font-weight:800;color:#344054;letter-spacing:.01em}
    .prelaunch-actions{display:flex;gap:6px}
    .prelaunch-window-btn{width:32px;height:32px;border:0;border-radius:8px;background:#f2f4f7;color:#475467;font-size:18px;line-height:1;cursor:pointer;display:grid;place-items:center}
    .prelaunch-window-btn:hover{background:#e4e7ec}
    .prelaunch-tag{display:inline-flex;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
    .prelaunch-modal h2{font-size:28px;line-height:1.15;letter-spacing:-.03em;margin:0 0 10px;color:#101828}
    .prelaunch-modal .prelaunch-lead{font-size:14px;line-height:1.6;color:#667085;margin:0 0 22px}
    .prelaunch-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .prelaunch-field{margin-bottom:14px}.prelaunch-field.full{grid-column:1/-1}
    .prelaunch-field label{display:block;font-size:12px;font-weight:700;color:#344054;margin-bottom:6px}
    .prelaunch-field input,.prelaunch-field select{box-sizing:border-box;width:100%;height:46px;border:1px solid #d0d5dd;border-radius:10px;padding:0 12px;font:inherit;background:#fff;color:#101828;outline:none}
    .prelaunch-field input:focus,.prelaunch-field select:focus{border-color:#84adff;box-shadow:0 0 0 4px #eff4ff}
    .prelaunch-submit{width:100%;height:48px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-weight:750;cursor:pointer}.prelaunch-submit:hover{background:#1d4ed8}.prelaunch-submit:disabled{opacity:.6;cursor:wait}
    .prelaunch-msg{display:none;margin-top:12px;padding:11px 12px;border-radius:9px;font-size:12px}.prelaunch-msg.ok{display:block;background:#ecfdf3;color:#067647}.prelaunch-msg.err{display:block;background:#fef3f2;color:#b42318}
    .prelaunch-fine{font-size:10px;line-height:1.5;color:#98a2b3;text-align:center;margin:12px 0 0}
    .prelaunch-trigger{position:fixed;right:22px;bottom:22px;z-index:9998;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:13px 18px;font:inherit;font-size:13px;font-weight:750;box-shadow:0 12px 30px rgba(37,99,235,.28);cursor:pointer}
    @media(max-width:620px){.prelaunch-overlay{padding:12px}.prelaunch-modal{padding:22px 16px;border-radius:16px;max-height:88vh}.prelaunch-grid{grid-template-columns:1fr}.prelaunch-field.full{grid-column:auto}.prelaunch-trigger{right:14px;bottom:14px}.prelaunch-modal h2{font-size:23px}.prelaunch-overlay.is-minimized{padding:12px}.prelaunch-overlay.is-minimized .prelaunch-modal{width:min(310px,calc(100vw - 24px))}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'prelaunch-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Pré-cadastro para versão de testes');
  overlay.innerHTML = `
    <div class="prelaunch-modal">
      <div class="prelaunch-windowbar">
        <span class="prelaunch-window-title">Pré-cadastro Matrícula.IA</span>
        <div class="prelaunch-actions">
          <button class="prelaunch-window-btn prelaunch-minimize" type="button" aria-label="Minimizar" title="Minimizar">−</button>
          <button class="prelaunch-window-btn prelaunch-close" type="button" aria-label="Fechar" title="Fechar">×</button>
        </div>
      </div>
      <div class="prelaunch-content">
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
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const trigger = document.createElement('button');
  trigger.className = 'prelaunch-trigger';
  trigger.type = 'button';
  trigger.textContent = 'Quero testar antes';
  document.body.appendChild(trigger);

  const closeBtn = overlay.querySelector('.prelaunch-close');
  const minimizeBtn = overlay.querySelector('.prelaunch-minimize');
  function openModal(){overlay.classList.add('is-open');overlay.classList.remove('is-minimized');minimizeBtn.textContent='−';minimizeBtn.setAttribute('aria-label','Minimizar');document.body.style.overflow='hidden';}
  function closeModal(){overlay.classList.remove('is-open','is-minimized');document.body.style.overflow='';}
  function toggleMinimize(){
    const minimized = overlay.classList.toggle('is-minimized');
    minimizeBtn.textContent = minimized ? '□' : '−';
    minimizeBtn.setAttribute('aria-label', minimized ? 'Restaurar' : 'Minimizar');
    document.body.style.overflow = '';
  }
  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  minimizeBtn.addEventListener('click', toggleMinimize);
  overlay.addEventListener('click', e => { if (e.target === overlay && !overlay.classList.contains('is-minimized')) closeModal(); });
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

  if (localStorage.getItem('matriculaia_prelaunch_registered') !== '1') setTimeout(openModal, 700);
})();
