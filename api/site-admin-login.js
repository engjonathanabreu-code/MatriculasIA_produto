const { checarRateLimit } = require("../server/rateLimit");
const {
  ADMIN_EMAIL,
  normalizeEmail,
  verifyPassword,
  createAdminSession,
  revokeSiteAdminSession
} = require("../server/siteAdminAuth");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "DELETE") {
      await revokeSiteAdminSession(req);
      return res.status(200).json({ sucesso: true });
    }
    if (req.method !== "POST") return res.status(405).json({ sucesso: false, erro: "Método não permitido." });

    const limite = await checarRateLimit(req, "site-admin-login", 6, 15 * 60 * 1000);
    if (!limite.permitido) return res.status(429).json({ sucesso: false, erro: "Muitas tentativas. Aguarde alguns minutos." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (normalizeEmail(body.email) !== ADMIN_EMAIL || !verifyPassword(body.password)) {
      return res.status(401).json({ sucesso: false, erro: "E-mail ou senha inválidos." });
    }

    const session = await createAdminSession();
    return res.status(200).json({ sucesso: true, email: ADMIN_EMAIL, token: session.token, expiraEm: session.expiraEm });
  } catch (err) {
    console.error("[site-admin-login]", err);
    return res.status(500).json({ sucesso: false, erro: "Não foi possível autenticar." });
  }
};
