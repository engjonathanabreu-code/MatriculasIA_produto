const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === './rateLimit') return { checarRateLimit: async () => ({ permitido:true }) };
  return originalLoad.call(this, name, parent, main);
};
const { conversation } = require('../server/supportConversation');
Module._load = originalLoad;
const id = '00fb1ada-f06c-4584-92a6-61569fbdd647';
function fixture() {
  const messages = [], ticket = {id, user_id:'owner', conteudo_texto:'Mensagem original', criado_em:'2026-10-06T17:22:19Z'};
  return {messages, ticket, admin:{from(table) {
    const filters = {};
    return { select(){return this;}, eq(k,v){filters[k]=v;return this;},
      maybeSingle: async () => ({data:filters.user_id && filters.user_id !== ticket.user_id ? null : ticket}),
      insert(data){messages.push({...data,id:'new',criado_em:'2026-10-08T12:00:00Z'}); return this;},
      single: async () => ({data:messages.at(-1)}),
      order(){return this;}, then(resolve){resolve({data:messages.filter(m=>m.ticket_id===filters.ticket_id)});}
    };
  }}};
}
function response() { return {status(code){this.code=code;return this;},json(data){this.data=data;return this;}}; }
test('cliente e suporte acrescentam mensagens no mesmo chamado sem substituir o original', async () => {
 const f=fixture();
 for (const user of ['owner',null]) {
  const r=response();await conversation({method:'POST',headers:{},body:{ticketId:id,mensagem:'Nova mensagem',autor:'suporte'}},r,f.admin,user);
  assert.equal(r.code,200);
 }
 assert.deepEqual(f.messages.map(m=>m.autor),['cliente','suporte']);
 assert.equal(f.ticket.conteudo_texto,'Mensagem original');
 const r=response();await conversation({method:'GET',query:{id}},r,f.admin,'owner');
 assert.equal(r.data.mensagens.length,2);
});
test('outro cliente não pode ler nem responder ao chamado',async()=>{
 for(const method of ['GET','POST']) {
  const f=fixture(),r=response();await conversation({method,query:{id},body:{ticketId:id,mensagem:'invasão'}},r,f.admin,'other');
  assert.equal(r.code,404);assert.equal(f.messages.length,0);
 }
});
test('mensagens vazias ou excessivas não são gravadas',async()=>{
 for(const mensagem of ['   ','x'.repeat(20001)]) {
  const f=fixture(),r=response();await conversation({method:'POST',body:{ticketId:id,mensagem}},r,f.admin,'owner');
  assert.equal(r.code,400);assert.equal(f.messages.length,0);
 }
});
