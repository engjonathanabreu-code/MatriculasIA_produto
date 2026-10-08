const { checarRateLimit } = require('./rateLimit');
async function conversation(req, res, admin, userId) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const id = req.method === 'GET' ? req.query.id : body.ticketId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return res.status(400).json({ sucesso:false, erro:'Chamado inválido.' });
  let query = admin.from('support_tickets').select('id,conteudo_texto,criado_em').eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { data: ticket, error } = await query.maybeSingle();
  if (error) throw error;
  if (!ticket) return res.status(404).json({ sucesso:false, erro:'Chamado não encontrado.' });
  if (req.method === 'POST') {
    const text = String(body.mensagem || '').trim();
    if (!text || text.length > 20000) return res.status(400).json({ sucesso:false, erro:'Escreva uma mensagem de até 20.000 caracteres.' });
    const limit = await checarRateLimit(req, 'support-message', 30, 60 * 60 * 1000);
    if (!limit.permitido) return res.status(429).json({ sucesso:false, erro:'Muitas mensagens. Tente novamente mais tarde.' });
    const { data, error: insertError } = await admin.from('support_ticket_messages').insert({ ticket_id:id, autor:userId ? 'cliente' : 'suporte', conteudo_texto:text }).select('id,autor,conteudo_texto,criado_em').single();
    if (insertError) throw insertError;
    return res.status(200).json({ sucesso:true, mensagem:data });
  }
  const { data, error: readError } = await admin.from('support_ticket_messages').select('id,autor,conteudo_texto,criado_em').eq('ticket_id', id).order('criado_em', { ascending:true }).order('id', { ascending:true });
  if (readError) throw readError;
  return res.status(200).json({ sucesso:true, chamado:ticket, mensagens:data || [] });
}
module.exports = { conversation };
