import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import Stripe from "npm:stripe@22.6.0";
const ORIGIN="https://cap-budget.github.io", APP=ORIGIN+"/cap-ados/", PRICE="price_1UQSxPQSKBv4bDcXupls6W3F";
const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,"Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return respond({error:"Méthode non autorisée"},405);
 if(req.headers.get("origin")!==ORIGIN)return respond({error:"Origine non autorisée"},403);
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return respond({error:"Connexion requise"},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("STRIPE_SECRET_KEY");
 if(!url||!anon||!key?.startsWith("sk_test_"))return respond({error:"Configuration TEST indisponible"},503);
 try{
 const db=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user||!user.email)return respond({error:"Session invalide"},401);
 const body=await req.json().catch(()=>null),requestId=body?.request_id;
 if(typeof requestId!=="string"||!/^[-0-9a-f]{36}$/i.test(requestId))return respond({error:"Identifiant de demande invalide"},400);
 const stripe=new Stripe(key,{apiVersion:"2026-08-26.dahlia",httpClient:Stripe.createFetchHttpClient()});
 const price=await stripe.prices.retrieve(PRICE);
 if(price.livemode||!price.active||price.currency!=="eur"||price.unit_amount!==499||price.recurring)return respond({error:"Offre de test indisponible"},503);
 const session=await stripe.checkout.sessions.create({
 mode:"payment",line_items:[{price:PRICE,quantity:1}],managed_payments:{enabled:false},
 customer_email:user.email,client_reference_id:user.id,
 metadata:{cap_app:"cap-ados",supabase_user_id:user.id,cap_plan:"test_lifetime"},
 integration_identifier:"cap-ados-test-qmvazrnp",
 success_url:APP+"?ados_checkout=success",cancel_url:APP+"?ados_checkout=cancel"
 },{idempotencyKey:"cap-ados:"+user.id+":"+requestId});
 if(session.livemode||!session.url)return respond({error:"Session de test invalide"},502);
 return respond({url:session.url});
 }catch{console.error("CAP Ados checkout test failed");return respond({error:"Impossible de préparer le paiement de test"},502);}
});