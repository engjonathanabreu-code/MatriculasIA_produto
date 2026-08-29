# INTEGRAL GEO MATRÍCULA

Aplicação web para leitura de matrículas imobiliárias e memoriais descritivos
com IA (identificação/extração) + geoprocessamento determinístico (validação,
poligonal, área, perímetro). Desenvolvida para a **Integral Soluções em
Engenharia**.

> **Importante — divisão de responsabilidades**
> A IA (Claude, da Anthropic) **só identifica e extrai** o que está escrito no documento.
> **Nenhuma linha de código de geoprocessamento (conversão de coordenadas,
> construção da poligonal, área, perímetro, validações) usa IA.** Essa parte é
> feita inteiramente em JavaScript determinístico, com Turf.js e Proj4js, no
> navegador (`lib/coordinates.js` e `lib/geometry.js`).

---

## 1. Estrutura do projeto

```
/
├── index.html                  Shell da aplicação (sidebar + 5 telas)
├── styles.css                  Identidade visual (GIS/SaaS corporativo)
├── app.js                      Orquestração do frontend
├── lib/
│   ├── coordinates.js          Parsing/conversão de coordenadas (Proj4js)
│   ├── geometry.js             Poligonal, área, perímetro, validações (Turf.js)
│   └── export.js               Geração de GeoJSON / KML / CSV / TXT
├── api/
│   ├── analisar-documento.js   Serverless function: chama o Claude (Anthropic)
│   └── blob-upload.js          Serverless function: autoriza upload direto ao Vercel Blob
├── package.json
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

### Por que `lib/*.js` funcionam tanto no navegador quanto no backend?

Eles usam um pequeno padrão UMD (`if (module.exports) ... else window.X = ...`).
Na prática, hoje **apenas o navegador usa `lib/coordinates.js` e
`lib/geometry.js` e `lib/export.js`** (carregados como `<script>` em
`index.html`, junto com Leaflet, Turf.js e Proj4js via CDN). O backend
(`api/analisar-documento.js`) só faz uma coisa: montar a chamada para o
Claude e devolver o JSON de extração — ele não faz geoprocessamento, então
não precisa importar essas libs. O padrão UMD foi mantido para permitir, no
futuro, mover parte da validação para o servidor sem reescrever o código.

---

## 2. Como funciona (fluxo)

1. **Nova análise**: o usuário envia PDF/JPG/JPEG/PNG/WEBP (até 20 MB — veja
   a seção 6, "Upload de arquivos grandes").
2. O navegador envia o arquivo **direto para o Vercel Blob** (storage de
   arquivos da própria Vercel), usando `@vercel/blob/client` — o arquivo
   **nunca passa pelo corpo de uma Serverless Function**. `api/blob-upload.js`
   só autoriza esse upload (emite um token de curta duração); ele não recebe
   os bytes do arquivo.
3. O navegador então manda para `/api/analisar-documento` apenas a **URL**
   do arquivo no Blob (um payload pequeno) — não mais o arquivo em si.
4. O backend chama a **API da Anthropic (Claude)** — modelo com suporte a
   documento/imagem via URL — passando essa URL em um bloco `document` (PDF)
   ou `image` (foto/scan), com um prompt que proíbe explicitamente a IA de
   inventar qualquer dado (regra da seção 29 da especificação). A saída
   estruturada é obtida forçando o Claude a chamar uma única ferramenta
   (`tool_choice`) cujo `input_schema` é exatamente o formato de dados que
   precisamos — mais confiável do que pedir "responda em JSON" em texto
   livre, porque o campo `input` do bloco `tool_use` já vem como objeto,
   sem risco de vir com texto ou markdown em volta.
5. Assim que a análise termina — com sucesso ou erro — `api/analisar-documento.js`
   **apaga o arquivo do Vercel Blob** (`del(blobUrl)`), para manter a regra
   de não persistir documentos.
6. O JSON retornado é devolvido ao navegador. A partir daqui, **tudo é
   determinístico**:
   - `lib/coordinates.js` resolve cada vértice para `[lng, lat]` em WGS84
     (convertendo UTM→geográfica quando necessário via Proj4js, ou aplicando
     a cadeia de azimute/distância quando faltar coordenada absoluta);
   - `lib/geometry.js` constrói a poligonal (**respeitando a ordem
     documental**, nunca reordenando vértices), calcula área/perímetro
     (Turf.js) e roda as validações geométricas e espaciais;
   - o mapa (Leaflet), a tabela de vértices, o painel de validação e as
     exportações são todos gerados a partir desse resultado.
5. Qualquer edição manual na tabela de vértices dispara um novo cálculo
   completo (`recompute()`), e o vértice editado passa a ser marcado como
   **"EDITADO"** (vértices calculados por azimute/distância são marcados
   como **"CALCULADO"**, e os demais como **"EXTRAÍDO"**).

### Reconstrução por azimute/distância (seções 19 e 20)

- Se um vértice não tiver coordenada própria, mas o vértice anterior tiver
  coordenada resolvida **e** azimute/rumo + distância até o próximo vértice,
  o sistema calcula a posição do vértice seguinte por geodesia esférica
  (`Coords.destinationPoint`). Esses vértices ficam marcados como
  **CALCULADO**.
- Se **nenhum** vértice tiver coordenada absoluta, mas existir uma cadeia
  completa de azimute/rumo + distância, o sistema reconstrói apenas a
  **forma relativa** da poligonal (em um plano local, metros) para permitir
  calcular área/perímetro — mas **não desenha nada no mapa** e desabilita a
  exportação em GeoJSON/KML, exibindo um aviso claro. Isso evita posicionar
  a geometria arbitrariamente sobre o globo.

---

## 3. Limitações conhecidas (leia antes de usar em produção)

- **Conversão de datum**: os parâmetros de transformação Molodensky usados
  para SAD69, Córrego Alegre e Astro-Chuá em `lib/coordinates.js` são
  aproximações de uso comum em cartografia, **suficientes para
  visualização em mapa e cálculo de área/perímetro**, mas não substituem
  uma transformação geodésica oficial (ex.: PROGRID/IBGE) para fins de
  georreferenciamento certificado junto ao INCRA. Para SIRGAS2000/WGS84 a
  aproximação é mínima.
- **Upload de arquivos grandes**: as Vercel Serverless Functions têm um
  limite **fixo e não configurável** de ~4,5 MB por corpo de requisição
  (isso vale em qualquer plano — Hobby, Pro ou Enterprise — é uma restrição
  de infraestrutura, não uma configuração da Vercel). Para não esbarrar
  nisso com matrículas escaneadas (frequentemente > 10 MB), o arquivo **não
  passa mais pelo corpo de nenhuma function**: o navegador sobe o arquivo
  direto para o **Vercel Blob**, e as functions só trocam a URL do arquivo
  (veja a seção 2). O limite prático agora é o da própria Anthropic — **32 MB
  por PDF** — e o app está configurado com um teto de 20 MB
  (`MAX_FILE_SIZE_BYTES` em `api/blob-upload.js`, e a constante
  `MAX_FILE_BYTES` espelhada em `app.js`, já que o navegador não lê
  variáveis de ambiente do servidor).
  **Requer que um Vercel Blob Store esteja conectado ao projeto** — veja a
  seção 5.3.
- **Sem persistência**: nada é salvo em banco de dados ou disco. Se a
  página for recarregada, a análise se perde. Isso é intencional (requisito
  do projeto).

---

## 4. Rodando localmente

```bash
npm i -g vercel
vercel dev
```

Crie um arquivo `.env` (baseado em `.env.example`, **nunca commitado**) com:

```
ANTHROPIC_API_KEY=sk-...
CLAUDE_MODEL=claude-sonnet-5
MAX_FILE_SIZE_BYTES=20000000
```

Para o upload funcionar localmente também é preciso ter um Blob Store
conectado (seção 5.3) e rodar `vercel env pull` para trazer o
`BLOB_READ_WRITE_TOKEN` para o `.env` local.

Abra `http://localhost:3000`.

---

## 5. Passo a passo de deploy (GitHub → Vercel)

### 5.1. Criar o repositório no GitHub

```bash
cd integral-geo-matricula
git init
git add .
git commit -m "INTEGRAL GEO MATRICULA - versao inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/integral-geo-matricula.git
git push -u origin main
```

### 5.2. Importar na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login.
2. Clique em **Add New → Project**.
3. Selecione o repositório `integral-geo-matricula` no GitHub.
4. Em **Framework Preset**, deixe **Other** (não é um framework específico).
5. Não é necessário alterar Build/Output Settings — não há passo de build.

### 5.3. Criar e conectar um Vercel Blob Store (obrigatório)

O upload de arquivos depende do Vercel Blob. Sem isso, `api/blob-upload.js`
falha com erro de token ausente.

1. No projeto, vá em **Storage → Create Database → Blob**.
2. Dê um nome ao store (ex.: `integral-geo-matricula-blob`) e crie.
3. Conecte o store ao projeto `leitor-de-matriculas` (normalmente já vem
   pré-selecionado na criação). A Vercel injeta automaticamente a variável
   `BLOB_READ_WRITE_TOKEN` nos ambientes conectados — **não precisa
   cadastrar essa variável manualmente**.

### 5.4. Cadastrar a variável `ANTHROPIC_API_KEY`

Em **Settings → Environment Variables**, adicione:

- `ANTHROPIC_API_KEY` = sua chave secreta da Anthropic, obtida em
  [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
  (nunca a coloque no código ou no `.env.example`).
- `CLAUDE_MODEL` = `claude-sonnet-5` (padrão — bom equilíbrio entre precisão
  e custo). Para o máximo de precisão em documentos difíceis (letra
  pequena, digitalizações ruins), use `claude-opus-4-8`.
- `MAX_FILE_SIZE_BYTES` = `20000000` (opcional — 20 MB é o padrão se
  omitido; ajuste conforme necessário, respeitando o limite de 32 MB por
  PDF da Anthropic).

Marque para os ambientes **Production**, **Preview** e **Development**.

> Depois de salvar variáveis de ambiente novas, é preciso criar um novo
> deploy (**Deployments → ⋯ → Redeploy**) para elas entrarem em vigor —
> deploys já existentes não são atualizados retroativamente.

### 5.5. Deploy

Clique em **Deploy**. Após a build, a Vercel fornece uma URL pública
(`https://integral-geo-matricula-xxxx.vercel.app`). Não há login: qualquer
pessoa com o endereço pode usar a aplicação.

### 5.6. Primeiro teste com uma matrícula real

1. Abra a URL da aplicação.
2. Na aba **Nova análise**, envie um PDF de matrícula ou memorial descritivo
   real (ou uma foto/scan em JPG/PNG).
3. Clique em **Analisar documento** e acompanhe o fluxo visual.
4. Confira em **Dados extraídos** se número de matrícula, proprietário e
   sistema de referência foram lidos corretamente — e leia o trecho de
   evidência de cada vértice.
5. Vá em **Mapa** e confira visualmente se a poligonal está sobre o imóvel
   esperado. Corrija manualmente qualquer coordenada suspeita na tabela.
6. Em **Validação**, revise os alertas (✓ válido / ⚠ atenção / ✕ erro).
7. Em **Exportação**, baixe o GeoJSON/KML/CSV/TXT conforme necessário.

---

## 6. Segurança

- `ANTHROPIC_API_KEY` só existe como variável de ambiente da Vercel, lida em
  `api/analisar-documento.js` (`process.env.ANTHROPIC_API_KEY`). Nunca é
  incluída em nenhum arquivo servido ao navegador.
- O endpoint valida `mimeType` (lista branca) e tamanho do arquivo antes de
  chamar o Claude.
- Nenhum documento é armazenado em disco, banco de dados ou logs
  persistentes pela aplicação. O arquivo passa pelo Vercel Blob apenas
  durante a análise: `api/analisar-documento.js` o apaga (`del(blobUrl)`)
  assim que a chamada ao Claude termina, com sucesso ou erro.
- `api/blob-upload.js` só emite tokens para os tipos MIME permitidos e até
  o tamanho máximo configurado — não é um upload "livre". O arquivo fica
  em uma URL pública com nome aleatorizado (não listável), pelo tempo curto
  entre o upload e a exclusão pós-análise.
- `api/analisar-documento.js` só aceita processar/apagar URLs que pertençam
  de fato ao domínio do Blob do próprio projeto
  (`*.public.blob.vercel-storage.com`), rejeitando qualquer outra URL.
- Não há autenticação/login nesta versão — quem tiver o endereço da
  aplicação pode utilizá-la. Se isso não for desejável, considere colocar a
  aplicação atrás de Vercel Authentication/Password Protection ou de uma
  VPN interna (fora do escopo deste MVP).

---

## 7. Créditos de mapas

- Camada "Mapa": OpenStreetMap (`{s}.tile.openstreetmap.org`).
- Camada "Satélite": Esri World Imagery (`server.arcgisonline.com`), serviço
  público gratuito para uso geral — sem necessidade de chave de API.
