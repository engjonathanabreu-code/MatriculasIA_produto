(function(){
  const cards = [
    {
      title:'Leitura estruturada de documentos',
      text:'Extrai e organiza dados registrais e cadastrais, incluindo matrícula, titulares, confrontações, vértices, sistema de referência, coordenadas e histórico de atos.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h10l5 5v17H9z"/><path d="M19 5v6h6M12 16h9M12 20h9M12 24h6"/><circle cx="12" cy="12" r="1.3"/></svg>'
    },
    {
      title:'Processamento geométrico',
      text:'Reconstrói a poligonal e calcula área, perímetro e fechamento por rotinas matemáticas determinísticas, permitindo conferência objetiva dos resultados.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 24 12 7l14 4-4 15z"/><circle cx="7" cy="24" r="1.8"/><circle cx="12" cy="7" r="1.8"/><circle cx="26" cy="11" r="1.8"/><circle cx="22" cy="26" r="1.8"/><path d="m11 21 5-8 5 7z"/></svg>'
    },
    {
      title:'Visualização geoespacial',
      text:'Representa uma ou várias matrículas no mesmo ambiente cartográfico, facilitando análise de posição relativa, sobreposição, confrontações e contexto territorial.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m6 9 7-3 7 3 6-3v18l-6 3-7-3-7 3z"/><path d="M13 6v18M20 9v18"/><path d="m9 17 4-3 4 2 5-4"/></svg>'
    },
    {
      title:'Rastreabilidade e consistência',
      text:'Mantém vínculo entre cada informação extraída e seu trecho de origem, além de sinalizar divergências entre dados registrais, cálculos geométricos e elementos do documento.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 7 8v7c0 6 3.8 10.2 9 13 5.2-2.8 9-7 9-13V8z"/><path d="m11.5 16 3 3 6-7"/><path d="M10 9h5"/></svg>'
    },
    {
      title:'Interoperabilidade técnica',
      text:'Exporta resultados em formatos amplamente utilizados em geoprocessamento e análise técnica, como GeoJSON, KML, CSV e relatórios estruturados.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 19v7h16v-7M16 5v15M11 10l5-5 5 5"/><path d="M11 15h10"/></svg>'
    },
    {
      title:'Relacionamento registral',
      text:'Identifica referências a matrículas confrontantes ou relacionadas ao histórico do imóvel, apoiando o encadeamento documental e a análise de vínculos registrais.',
      icon:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13.5 19.5 11 22a5 5 0 0 1-7-7l4-4a5 5 0 0 1 7 0"/><path d="m18.5 12.5 2.5-2.5a5 5 0 0 1 7 7l-4 4a5 5 0 0 1-7 0"/><path d="m11 21 10-10"/></svg>'
    }
  ];

  const style = document.createElement('style');
  style.textContent = `
    .lp-feature-icon svg{width:27px;height:27px;fill:none;stroke:#2563eb;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;display:block}
    .lp-feature-icon{display:flex;align-items:center;justify-content:center;color:#2563eb}
    .footer-admin-link{color:inherit;text-decoration:none;transition:color .15s ease}
    .footer-admin-link:hover{color:#2563eb;text-decoration:underline;text-underline-offset:3px}
  `;
  document.head.appendChild(style);

  const featureCards = document.querySelectorAll('#recursos .lp-feature-card');
  featureCards.forEach((card,index)=>{
    if(!cards[index]) return;
    const icon = card.querySelector('.lp-feature-icon');
    const title = card.querySelector('h3');
    const text = card.querySelector('p');
    if(icon) icon.innerHTML = cards[index].icon;
    if(title) title.textContent = cards[index].title;
    if(text) text.textContent = cards[index].text;
  });

  const sectionTitle = document.querySelector('#recursos .lp-section-title');
  if(sectionTitle) sectionTitle.textContent = 'Recursos técnicos do Matrícula.IA';

  const credit = document.querySelector('.footer-credit-dev');
  if(credit){
    const original = credit.textContent || '';
    const name = 'Jonathan David de Abreu';
    if(original.includes(name)){
      credit.innerHTML = original.replace(name, '<a class="footer-admin-link" href="site-admin.html" title="Acesso administrativo">'+name+'</a>');
    }
  }
})();
