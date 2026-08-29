/**
 * lib/supabaseClient.js
 * ---------------------------------------------------------------------------
 * Cliente Supabase do lado do navegador. A chave abaixo e a chave PUBLICA
 * (publishable/anon) - e seguro ela aparecer no codigo-fonte do navegador;
 * a seguranca real dos dados vem das politicas de RLS configuradas no banco
 * (cada usuario so consegue ler/escrever os proprios dados).
 *
 * NUNCA coloque aqui a chave "service_role" - essa e secreta e so pode
 * existir no servidor (ver server/supabaseAdmin.js).
 * ---------------------------------------------------------------------------
 */
(function (root) {
  "use strict";

  var SUPABASE_URL = "https://lnuoakuzkpyqilatxgkz.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iKhsfx3EXiv3-WsJG__aSw_Hchpl8iK";

  if (typeof supabase === "undefined") {
    console.error("[supabaseClient] Biblioteca do Supabase nao carregou (verifique o <script> no index.html).");
    return;
  }

  root.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})(window);
