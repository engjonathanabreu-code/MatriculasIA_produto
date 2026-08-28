/**
 * api/stripe-webhook.js
 * ---------------------------------------------------------------------------
 * Recebe eventos do Stripe (pagamento confirmado, assinatura renovada,
 * cancelada, etc.) e mantem a tabela public.subscriptions sincronizada.
 *
 * IMPORTANTE: precisa do CORPO CRU da requisicao (nao processado) para
 * validar a assinatura HMAC do Stripe - por isso bodyParser esta desligado
 * e lemos o corpo manualmente com raw-body.
 *
 * Configure esta URL (https://seu-dominio.vercel.app/api/stripe-webhook) no
 * painel do Stripe em Developers -> Webhooks, e copie o "Signing secret"
 * gerado la para a variavel de ambiente STRIPE_WEBHOOK_SECRET na Vercel.
 * ---------------------------------------------------------------------------
 */
const getRawBody = require("raw-body");
const { getSupabaseAdmin } = require("../server/supabaseAdmin");
const { getStripe } = require("../server/stripeClient");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET nao configurado.");
    res.status(500).end();
    return;
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] assinatura invalida:", err.message);
    res.status(400).json({ erro: "Assinatura invalida." });
    return;
  }

  try {
    const admin = getSupabaseAdmin();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          await sincronizarAssinatura(admin, stripe, session.subscription, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        var userId = subscription.metadata && subscription.metadata.supabase_user_id;
        await sincronizarAssinatura(admin, stripe, subscription.id, userId);
        break;
      }
      default:
        // outros eventos nao nos interessam - ignora silenciosamente
        break;
    }

    res.status(200).json({ recebido: true });
  } catch (err) {
    console.error("[stripe-webhook] erro ao processar evento:", err);
    // Devolve 500 para o Stripe tentar de novo mais tarde
    res.status(500).json({ erro: "Erro ao processar evento." });
  }
};

/** Busca a assinatura completa no Stripe e reflete o estado atual na tabela subscriptions. */
async function sincronizarAssinatura(admin, stripe, stripeSubscriptionIdOuObjeto, userIdFallback) {
  var subscription =
    typeof stripeSubscriptionIdOuObjeto === "string"
      ? await stripe.subscriptions.retrieve(stripeSubscriptionIdOuObjeto)
      : stripeSubscriptionIdOuObjeto;

  var userId = (subscription.metadata && subscription.metadata.supabase_user_id) || userIdFallback;
  if (!userId) {
    console.error("[stripe-webhook] assinatura sem supabase_user_id associado:", subscription.id);
    return;
  }

  var priceId = subscription.items && subscription.items.data[0] && subscription.items.data[0].price.id;
  var planId = subscription.metadata && subscription.metadata.plan_id;

  if (!planId && priceId) {
    var { data: planoPorPreco } = await admin.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (planoPorPreco) planId = planoPorPreco.id;
  }

  var registro = {
    user_id: userId,
    plan_id: planId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    periodo_inicio: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
    periodo_fim: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancelar_ao_fim_periodo: !!subscription.cancel_at_period_end,
    atualizado_em: new Date().toISOString()
  };

  await admin.from("subscriptions").upsert(registro, { onConflict: "stripe_subscription_id" });
}

// IMPORTANTE: desliga o parsing automatico do corpo da requisicao - o Stripe
// exige os bytes exatos e originais para validar a assinatura HMAC.
module.exports.config = {
  api: { bodyParser: false }
};
