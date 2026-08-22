import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const authHeader=req.headers.get("Authorization"); if(!authHeader)return json({error:"Oturum bulunamadı"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}}),adminClient=createClient(url,service);
  const token=authHeader.replace("Bearer ","");
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user)return json({error:"Geçersiz oturum"},401);
  const {data:caller}=await adminClient.from("profiles").select("role,is_active").eq("id",userData.user.id).single();
  if(!caller||!caller.is_active||!["admin","office"].includes(caller.role))return json({error:"İşi yalnızca Ofis veya Yönetici düzenleyebilir."},403);
  const body=await req.json();
  const jobId=String(body.job_id||""),customerName=String(body.customer_name||"").trim(),customerPhone=String(body.customer_phone||"").trim(),customerAddress=String(body.customer_address||"").trim(),description=String(body.description||"").trim(),scheduledAt=String(body.scheduled_at||"");
  const priority=body.priority==="urgent"?"urgent":"normal",assignedTo=body.assigned_to?String(body.assigned_to):null;
  if(!jobId||!customerName||!customerPhone||!description||Number.isNaN(Date.parse(scheduledAt)))return json({error:"Tarih-saat, müşteri, telefon ve yapılacak iş gerekli."},400);
  if(assignedTo){const {data:p}=await adminClient.from("profiles").select("id,role,is_active").eq("id",assignedTo).single();if(!p||p.role!=="service"||!p.is_active)return json({error:"Seçilen servis personeli geçerli değil."},400)}
  const {error}=await adminClient.from("jobs").update({customer_name:customerName,customer_phone:customerPhone,customer_address:customerAddress||null,description,scheduled_at:scheduledAt,priority,assigned_to:assignedTo}).eq("id",jobId);
  if(error)throw error; return json({ok:true});
 }catch(error){return json({error:error instanceof Error?error.message:"Beklenmeyen hata"},400)}
});
