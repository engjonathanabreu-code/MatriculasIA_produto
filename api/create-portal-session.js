/**
 * api/create-portal-session.js
 * ---------------------------------------------------------------------------
 * Devolve a URL do Portal do Cliente do Stripe - uma pagina hospedada pelo
 * proprio Stripe onde o usuario troca de plano, atualiza o cartao ou cancela
 * a assinatura sozinho, sem precisar de suporte manual.
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
    const limite = await checarRateLimit(req, "create-portal-session", 10, 10 * 60 * 1000);
    if (!limite.permitido) {
      res.status(429).json({ sucesso: false, erro: "Muitas tentativas. Aguarde alguns minutos." });
      return;
    }

    const user = await getAuthenticatedUser(req);
    const admin = getSupabaseAdmin();
    const stripe = getStripe();

    const { data: perfil } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!perfil || !perfil.stripe_customer_id) {
      res.status(400).json({ sucesso: false, erro: "Voce ainda nao tem uma assinatura." });
      return;
    }

    const appUrl = process.env.APP_URL || ("https://" + req.headers.host);

    const session = await stripe.billingPortal.sessions.create({
      customer: perfil.stripe_customer_id,
      return_url: appUrl + "/"
    });

    res.status(200).json({ sucesso: true, url: session.url });
  } catch (err) {
    console.error("[create-portal-session] erro:", err);
    res.status(err.statusCode || 500).json({ sucesso: false, erro: err.message || "Erro interno." });
  }
};
