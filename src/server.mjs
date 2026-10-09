import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {evaluate,catalog,authorization} from './policy.mjs';
const data=new Map(), port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const token=process.env.OPERATOR_TOKEN||'';
if(!['127.0.0.1','::1','localhost'].includes(host)&&token.length<24) throw Error('Remote bind requires OPERATOR_TOKEN >=24 characters');
const send=(res,status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(payload));};
const read=async req=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw Error('Request too large');}return JSON.parse(s||'{}')};
const record=(item,event)=>item.audit.push({event,at:new Date().toISOString()});
const paypal=async(path,{method='GET',body,requestId}={})=>{
 if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET)throw Error('PayPal Sandbox not configured');
 const base='https://api-m.sandbox.paypal.com';
 const auth=Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64');
 const t=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 if(!t.ok)throw Error('PayPal Sandbox OAuth error '+t.status);
 const j=await t.json();
 const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+j.access_token,'Content-Type':'application/json',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const content=await r.json().catch(()=>({}));if(!r.ok)throw Error('PayPal API error '+r.status+' '+(content.message||''));return content;
};
export function makeServer(){return http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(p.startsWith('/api/')&&token){const supplied=req.headers.authorization?.replace(/^Bearer /,'')||'';const a=Buffer.from(supplied),b=Buffer.from(token);if(a.length!==b.length||!timingSafeEqual(a,b))return send(res,401,{error:'Unauthorized'});}
 if(req.method==='GET'&&p==='/api/status')return send(res,200,{status:'ok',paypalConfigured:!!(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),aiConfigured:!!process.env.OPENAI_API_KEY,authorization});
 if(req.method==='GET'&&p==='/api/catalog')return send(res,200,{catalog});
 if(req.method==='GET'&&p==='/api/intents')return send(res,200,{intents:[...data.values()].reverse()});
 if(req.method==='POST'&&p==='/api/intents'){
 const evaluation=evaluate(await read(req)),item={id:randomUUID(),...evaluation,approval:evaluation.decision==='REVIEW'?'PENDING':'NOT_REQUIRED',payment:{status:'NOT_CREATED'},audit:[]};record(item,'EVALUATED');data.set(item.id,item);if(data.size>500)data.delete(data.keys().next().value);return send(res,201,item);
 }
 const m=p.match(/^\/api\/intents\/([a-f0-9-]+)\/(review|checkout|capture)$/);
 if(req.method==='POST'&&m){const item=data.get(m[1]);if(!item)return send(res,404,{error:'Intent not found'});
 if(m[2]==='review'){
 if(item.decision!=='REVIEW'||item.approval!=='PENDING')return send(res,409,{error:'Not pending review'});
 const body=await read(req);if(typeof body.approve!=='boolean')return send(res,400,{error:'Boolean approve required'});
 item.approval=body.approve?'APPROVED':'REJECTED';record(item,item.approval);return send(res,200,item);
 }
 if(item.decision==='BLOCK'||item.approval==='PENDING'||item.approval==='REJECTED')return send(res,403,{error:'Policy denies payment'});
 if(m[2]==='checkout'){
 if(item.payment.status!=='NOT_CREATED')return send(res,409,{error:'Order already created'});
 // Never accept payee, amount, or currency from checkout request.
 const order=await paypal('/v2/checkout/orders',{method:'POST',requestId:item.id,body:{intent:'CAPTURE',purchase_units:[{reference_id:item.id,amount:{currency_code:item.intent.currency,value:(item.intent.amountCents/100).toFixed(2)},description:item.product.label}]} });
 item.payment={status:'AWAITING_BUYER_APPROVAL',orderId:order.id,approvalUrl:order.links?.find(x=>x.rel==='approve')?.href||null};record(item,'PAYPAL_ORDER_CREATED');return send(res,200,item);
 }
 if(item.payment.status==='COMPLETED')return send(res,200,item);
 if(item.payment.status!=='AWAITING_BUYER_APPROVAL')return send(res,409,{error:'No pending order'});
 const order=await paypal('/v2/checkout/orders/'+encodeURIComponent(item.payment.orderId));
 const u=order.purchase_units?.[0];const amt=u?.amount;
 if(order.status!=='APPROVED'||amt?.currency_code!==item.intent.currency||amt?.value!==(item.intent.amountCents/100).toFixed(2)||u?.reference_id!==item.id)return send(res,409,{error:'PayPal order details or approval status do not match intent'});
 const captured=await paypal('/v2/checkout/orders/'+encodeURIComponent(item.payment.orderId)+'/capture',{method:'POST',requestId:item.id+'-capture'});
 if(captured.status!=='COMPLETED')return send(res,409,{error:'PayPal capture not confirmed',paypalStatus:captured.status});
 item.payment.status='COMPLETED';item.payment.captureId=captured.purchase_units?.[0]?.payments?.captures?.[0]?.id||null;record(item,'PAYPAL_CAPTURE_COMPLETED');return send(res,200,item);
 }
 if(req.method==='GET'&&(p==='/'||p==='/app.js'||p==='/style.css')){
 const name=p==='/'?'index.html':p.slice(1),content=await readFile(new URL('../public/'+name,import.meta.url));res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});return res.end(content);
 }
 return send(res,404,{error:'Not found'});
 }catch(err){return send(res,err.message.startsWith('Invalid')||err.message.startsWith('Request too')?400:502,{error:err.message})}
})}
if(process.argv[1]===fileURLToPath(import.meta.url))makeServer().listen(port,host,()=>console.log('Kraxx PayGuard local demo: http://'+host+':'+port));
