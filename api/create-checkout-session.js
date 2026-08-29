/**
 * api/create-checkout-session.js
 * ---------------------------------------------------------------------------
 * Recebe { planId } do navegador (usuario ja logado, token Supabase no
 * header Authorization) e devolve a URL do Checkout do Stripe para onde o
 * navegador deve redirecionar. O cartao de credito e digitado DENTRO do
 * Stripe, nunca passa por este servidor.
 * ---------------------------------------------------------------------------
 */
const { getSupabaseAdmin, getAuthenticatedUser } = require("../server/supabaseAdmin");
const { getStripe } = require("../server/stripeClient");
const { checarRateLimit } = require("../server/rateLimit");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ sucesso: false, erro: "Metodo nao permitido." });
    return;
  }

  try {
    const limite = await checarRateLimit(req, "create-checkout-session", 10, 10 * 60 * 1000);
    if (!limite.permitido) {
      res.status(429).json({ sucesso: false, erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
      return;
    }

    const user = await getAuthenticatedUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const planId = body && body.planId;

    if (!planId || !["basico", "pro", "expert"].includes(planId)) {
      res.status(400).json({ sucesso: false, erro: "Plano invalido." });
      return;
    }

    const admin = getSupabaseAdmin();
    const stripe = getStripe();

    const { data: plano, error: erroPlano } = await admin.from("plans").select("*").eq("id", planId).single();
    if (erroPlano || !plano) {
      res.status(400).json({ sucesso: false, erro: "Plano nao encontrado." });
      return;
    }
    if (!plano.stripe_price_id) {
      res.status(500).json({
        sucesso: false,
        erro: "Este plano ainda nao foi configurado no Stripe (falta o stripe_price_id na tabela plans)."
      });
      return;
    }

    const { data: perfil } = await admin.from("profiles").select("*").eq("id", user.id).single();

    let stripeCustomerId = perfil && perfil.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      stripeCustomerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id);
    }

    const appUrl = process.env.APP_URL || ("https://" + req.headers.host);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: plano.stripe_price_id, quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: user.id, plan_id: planId } },
      success_url: appUrl + "/app.html?checkout=sucesso",
      cancel_url: appUrl + "/app.html?checkout=cancelado",
      allow_promotion_codes: true
    });

    res.status(200).json({ sucesso: true, url: session.url });
  } catch (err) {
    console.error("[create-checkout-session] erro:", err);
    res.status(err.statusCode || 500).json({ sucesso: false, erro: err.message || "Erro interno." });
  }
};
