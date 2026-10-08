const { chromium } = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();
 await page.setContent('<div id="conversation"></div>');
 await page.evaluate(()=>{window.messages=[];window.fetch=async(url,options)=>({ok:true,json:async()=>{if(options.method==='POST'){window.messages.push({autor:'suporte',conteudo_texto:JSON.parse(options.body).mensagem,criado_em:new Date().toISOString()});return {sucesso:true};}return {sucesso:true,chamado:{conteudo_texto:'Certidão não lida',criado_em:new Date().toISOString()},mensagens:window.messages};}});});
 await page.addScriptTag({path:'support-conversation.js'});
 await page.evaluate(()=>mountSupportConversation(document.getElementById('conversation'),'/api/support-tickets',()=> 'token','id',true));
 await page.getByText('Certidão não lida',{exact:true}).waitFor();
 await page.getByLabel('Nova mensagem').fill('Resposta de teste <img src=x onerror=alert(1)>');
 await page.getByRole('button',{name:'Enviar mensagem'}).click();
 await page.getByText('Resposta de teste <img src=x onerror=alert(1)>',{exact:true}).waitFor();
 if(await page.locator('.support-message img').count()) throw Error('HTML executável na conversa');
 if(await page.getByLabel('Nova mensagem').inputValue()) throw Error('Mensagem não foi limpa após envio');
 console.log('Tela validada: histórico, envio e texto seguro.');await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
