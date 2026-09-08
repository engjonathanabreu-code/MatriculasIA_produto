const crypto = require("crypto");
const { getSupabaseAdmin } = require("../server/supabaseAdmin");

function clean(v, max) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ sucesso: false });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] || "");
    const fallbackKey = crypto.createHash("sha256").update(`${forwarded}|${ua}`).digest("hex").slice(0, 40);
    const visitorKey = clean(body.visitorKey || fallbackKey, 120);

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("site_visits").insert({
      path: clean(body.path || "/", 200),
      visitor_key: visitorKey,
      user_agent: clean(ua, 500),
      referer: clean(req.headers.referer, 500)
    });
    if (error) throw error;
    return res.status(200).json({ sucesso: true });
  } catch (err) {
    console.error("[site-visit]", err);
    return res.status(200).json({ sucesso: false });
  }
};
