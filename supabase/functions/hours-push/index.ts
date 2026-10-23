import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://nth8m6fcs7-byte.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
export function allowedEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
 (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false}
}
async function config(){
 let {data,error}=await db.from('hours_push_config').select('*').eq('id',true).maybeSingle();if(error)throw error;
 if(!data){const keys=webpush.generateVAPIDKeys();
  const result=await db.from('hours_push_config').upsert({id:true,public_key:keys.publicKey,private_key:keys.privateKey},{onConflict:'id',ignoreDuplicates:true});if(result.error)throw result.error;
  const result2=await db.from('hours_push_config').select('*').eq('id',true).single();if(result2.error)throw result2.error;data=result2.data;
 }return data;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
  const keys=await config();
  if(req.method==='GET')return json({publicKey:keys.public_key});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(req.headers.get('x-hours-cron')!==keys.cron_token)return json({error:'Unauthorized'},401);
  const {data:jobs,error}=await db.rpc('hours_claim_push');if(error)throw error;
  webpush.setVapidDetails('https://nth8m6fcs7-byte.github.io/Hours/',keys.public_key,keys.private_key);
  let sent=0,failed=0;const skipped:Record<string,number>={};
  for(const job of jobs||[]){
   if(!allowedEndpoint(job.endpoint)){failed++;continue}
   // Recheck immediately before dispatch: pause/completion may have changed after claiming.
   const {data:shift,error:readError}=await db.from('personal_work_hours').select('day_type,end_time,paused_at,duration_minutes,updated_at').eq('id',job.shift_id).single();
   if(readError||!shift||shift.day_type!=='work'||shift.end_time||shift.paused_at||shift.duration_minutes!==null){const reason=readError?'read-'+readError.code:!shift?'missing':'shift-ineligible';skipped[reason]=(skipped[reason]||0)+1;continue;}
   // A recent change gets a fresh due-time evaluation on the next scheduler pass.
   if(Date.now()-Date.parse(shift.updated_at)<60000)continue;
   try{
    await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify({title:'HOURS · 8 horas trabalhadas',body:'Já completaste 8 horas, descontando as pausas. Confirma a tua saída.',tag:'hours-eight-'+job.shift_id}),{TTL:120,urgency:'high',timeout:10000});
    const result=await db.from('hours_push_deliveries').update({delivered_at:new Date().toISOString()}).eq('shift_id',job.shift_id).eq('subscription_id',job.subscription_id);if(result.error)throw result.error;sent++;
   }catch(err){failed++;console.error('OTTO push failure',JSON.stringify({subscription:job.subscription_id,status:err.statusCode||null,name:err.name,code:err.code||null,reason:typeof err.body==='string'?(/\"reason\"\s*:\s*\"([A-Za-z]+)\"/.exec(err.body)?.[1]||null):null,runtime:typeof err.message==='string'&&/not implemented|not supported|unsupported/i.test(err.message)?'unsupported-runtime':null}));if(err.statusCode===404||err.statusCode===410)await db.from('hours_push_subscriptions').delete().eq('id',job.subscription_id);}
  }return json({sent,failed,skipped});
 }catch{console.error('HOURS push dispatch failed');return json({error:'Push service unavailable'},500)}
});
