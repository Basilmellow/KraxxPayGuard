export const catalog = Object.freeze({notebook:{label:'Security Field Notebook',amountCents:4900},console:{label:'Workspace Console',amountCents:65000}});
export const authorization = Object.freeze({merchantId:'kraxx-demo-store',payeeId:'kraxx-sandbox-merchant',currency:'USD',autoLimitCents:10000,reviewLimitCents:100000});
export function evaluate(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid intent');
  const {merchantId,payeeId,currency,productId,amountCents,untrustedContext=''}=raw;
  if (![merchantId,payeeId,currency,productId].every(v=>typeof v==='string' && v.length>0 && v.length<=100) || !Number.isSafeInteger(amountCents) || amountCents<=0 || typeof untrustedContext!=='string' || untrustedContext.length>2000) throw Error('Invalid intent fields');
  const reasons=[],product=catalog[productId];
  if(merchantId!==authorization.merchantId) reasons.push('Unauthorized merchant');
  if(payeeId!==authorization.payeeId) reasons.push('Unauthorized recipient');
  if(currency!==authorization.currency) reasons.push('Unauthorized currency');
  if(!product || amountCents!==product.amountCents) reasons.push('Amount or product fails trusted catalog check');
  if(/ignore (all )?(previous|prior) instructions|override (the )?policy|bypass (the )?firewall|redirect (the )?payment|send (the )?money to/i.test(untrustedContext)) reasons.push('Suspected instruction injection in untrusted content');
  if(amountCents>authorization.reviewLimitCents) reasons.push('Above maximum authorized review limit');
  const decision=reasons.length?'BLOCK':amountCents>authorization.autoLimitCents?'REVIEW':'ALLOW';
  if(decision==='REVIEW') reasons.push('Human approval required above automatic spending limit');
  if(decision==='ALLOW') reasons.push('Matches trusted merchant, product, payee, price and spending limit');
  return {decision,reasons,product:product||null,intent:{merchantId,payeeId,currency,productId,amountCents,untrustedContext},policyVersion:'pg-v1'};
}
