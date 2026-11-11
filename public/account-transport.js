(function(root){'use strict';
 const failure=(code,message)=>Object.assign(Error(message),{code});
 async function request({origin,path,method='GET',body,token,timeoutMs=20000}){
  if(typeof window.XijianAccountFetch!=='function')throw failure('ACCOUNT_COMPONENT','登录组件未完整加载，请刷新页面后重试。');
  const controller=typeof AbortController==='function'?new AbortController():null;let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(failure('ACCOUNT_TIMEOUT','账号服务连接超时，本次操作尚未确认完成。请稍后重试；若注册提示邮箱已被使用，可用刚才的密码登录。'));controller?.abort()},timeoutMs)});
  try{return await Promise.race([timeout,(async()=>{
   let response;
   try{response=await window.XijianAccountFetch(new URL('/v1/transport',origin),{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({path,method,...(token?{token}:{}),...(body!==undefined?{payload:body}:{})}),...(controller?{signal:controller.signal}:{})})}
   catch{throw failure('ACCOUNT_NETWORK','当前网络无法连接账号服务，本次操作尚未确认完成。可稍后重试，或先选择游客体验。')}
   let data;try{data=await response.json()}catch{throw failure('ACCOUNT_GATEWAY',response.status===403?'账号服务的连接被网络防护拦截，暂时无法完成注册或登录。可先选择游客体验。':'账号服务返回了异常响应，本次操作尚未确认完成，请稍后重试。')}
   if(!data||typeof data!=='object'||Array.isArray(data))throw failure('ACCOUNT_RESPONSE','账号服务返回了异常响应，本次操作尚未确认完成，请稍后重试。');
   return {response,data};
  })()])}finally{clearTimeout(timer)}
 }
 root.XijianAccounts={request};
})(globalThis);
