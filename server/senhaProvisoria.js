/**
 * server/senhaProvisoria.js
 * Hash da senha provisoria (generica) definida pelo admin, guardado em
 * app_metadata do usuario (nao editavel pelo navegador) so para impedir que
 * o usuario "troque" a senha pela mesma senha provisoria no primeiro acesso.
 */
const crypto = require("crypto");

function hashSenhaProvisoria(userId, senha) {
  return crypto.createHash("sha256").update(String(userId) + ":" + String(senha || "")).digest("hex");
}

module.exports = { hashSenhaProvisoria };
