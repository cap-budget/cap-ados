import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const respond = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const iso = (seconds: number | null | undefined) => seconds ? new Date(seconds * 1000).toISOString() : null;
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond(405, "Méthode non autorisée");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !key?.startsWith("sk_test_") || !url || !serviceKey) return respond(503, "Configuration TEST incomplète");
  const signature = req.headers.get("stripe-signature");
  if (!signature) return respond(400, "Signature manquante");
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret); }
  catch { return respond(400, "Signature invalide"); }
  if (event.livemode) return respond(400, "Événement réel refusé en mode TEST");
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    // CAP Ados is isolated from the CAP Budget entitlement table.
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const ados = event.data.object as Stripe.Checkout.Session;
      if (ados.metadata?.cap_app === "cap-ados") {
        const uid = ados.client_reference_id;
        if (!uid || ados.metadata?.supabase_user_id !== uid || ados.metadata?.cap_plan !== "test_lifetime") return respond(200, "CAP Ados : utilisateur non associé");
        if (ados.mode !== "payment" || ados.payment_status !== "paid" || ados.livemode || ados.currency !== "eur" || ados.amount_total !== 499) return respond(200, "CAP Ados : paiement non confirmé");
        const full = await stripe.checkout.sessions.retrieve(ados.id, { expand: ["line_items"] });
        const items = full.line_items?.data;
        if (full.livemode || full.payment_status !== "paid" || full.amount_total !== 499 || full.currency !== "eur" || full.metadata?.cap_app !== "cap-ados" || full.client_reference_id !== uid || !items || items.length !== 1 || items[0].quantity !== 1 || items[0].price?.id !== "price_1UQSxPQSKBv4bDcXupls6W3F") return respond(200, "CAP Ados : offre inconnue");
        const { error } = await db.from("cap_ados_premium_access").upsert({
          user_id: uid, test_lifetime_access: true, stripe_checkout_session_id: ados.id,
          paid_at: new Date(full.created * 1000).toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) throw error;
        return respond(200, "CAP Ados Premium TEST confirmé");
      }
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id;
      const plan = session.metadata?.cap_plan;
      if (!uid || session.metadata?.supabase_user_id !== uid || !["monthly", "lifetime"].includes(plan || "")) return respond(200, "Session externe ignorée");
      if (plan === "lifetime") {
        if (session.mode !== "payment" || session.payment_status !== "paid") return respond(200, "Paiement non confirmé");
        const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items"] });
        if (!full.line_items?.data.some(x => x.price?.id === "price_1UOCpCQSKBv4bDcXf3kVXR52")) return respond(200, "Prix inconnu");
        const { error } = await db.from("cap_premium_access").upsert({
          user_id: uid, lifetime_access: true, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) throw error;
      } else {
        if (session.mode !== "subscription" || !session.subscription) return respond(200, "Abonnement absent");
        const sub = await stripe.subscriptions.retrieve(String(session.subscription));
        if (sub.metadata.supabase_user_id !== uid || !sub.items.data.some(x => x.price.id === "price_1UOCnkQSKBv4bDcXSkorAMbQ")) return respond(200, "Abonnement non associé");
        const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
        const { error } = await db.from("cap_premium_access").upsert({
          user_id: uid, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id,
          subscription_status: status, subscription_period_end: iso(sub.items.data[0]?.current_period_end ?? sub.current_period_end),
          trial_started_at: iso(sub.trial_start), updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) throw error;
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      let subId: string | null = null;
      if (event.type.startsWith("customer.subscription.")) subId = (event.data.object as Stripe.Subscription).id;
      else {
        const invoice = event.data.object as Stripe.Invoice;
        subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id || null;
      }
      if (!subId) return respond(200, "Aucun abonnement associé");
      if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
        const sub = await stripe.subscriptions.retrieve(subId);
        const uid = sub.metadata?.supabase_user_id;
        if (uid && sub.metadata?.cap_plan === "monthly" && sub.items.data.some(x => x.price.id === "price_1UOCnkQSKBv4bDcXSkorAMbQ")) {
          const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
          const { error } = await db.from("cap_premium_access").upsert({
            user_id: uid, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id,
            subscription_status: status, subscription_period_end: iso(sub.items.data[0]?.current_period_end ?? sub.current_period_end),
            trial_started_at: iso(sub.trial_start), updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (error) throw error;
          return respond(200, "Abonnement synchronisé");
        }
      }
      const { data: row, error: findError } = await db.from("cap_premium_access")
        .select("user_id").eq("stripe_subscription_id", subId).maybeSingle();
      if (findError) throw findError;
      if (!row) return respond(200, "Abonnement non lié ignoré");
      const sub = await stripe.subscriptions.retrieve(subId);
      const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
      const { error } = await db.from("cap_premium_access").update({
        subscription_status: status, subscription_period_end: iso(sub.items.data[0]?.current_period_end ?? sub.current_period_end),
        updated_at: new Date().toISOString(),
      }).eq("user_id", row.user_id).eq("stripe_subscription_id", subId);
      if (error) throw error;
    }
    return respond(200, "Événement traité");
  } catch (e) {
    console.error("Stripe event failed", event.id, event.type, JSON.stringify(e, Object.getOwnPropertyNames(e), 2), String(e));
    return respond(500, "Traitement échoué : Stripe peut réessayer");
  }
});
