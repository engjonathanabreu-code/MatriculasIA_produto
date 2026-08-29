/**
 * server/stripeClient.js
 * ---------------------------------------------------------------------------
 * Cliente Stripe compartilhado. STRIPE_SECRET_KEY e configurada no painel da
 * Vercel (nunca aparece no navegador).
 * ---------------------------------------------------------------------------
 */
const Stripe = require("stripe");

let _client = null;

function getStripe() {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY nao configurada nas variaveis de ambiente da Vercel.");
  }
  _client = new Stripe(key, { apiVersion: "2024-06-20" });
  return _client;
}

module.exports = { getStripe };
