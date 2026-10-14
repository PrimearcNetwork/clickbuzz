const { Payment, Subscription, SubscriptionPlan, Session } = require('../models');
const { sequelize } = require('../config/db.config');
const razorpayUtil = require('../utils/razorpay.util');
const metaCapiUtil = require('../utils/metaCapi.util');
const affiliatePostbackUtil = require('../utils/affiliatePostback.util');

const FINAL_STATUSES = ['success', 'failed', 'cancelled'];
const VERIFY_THROTTLE_MS = 5000;

// After this many consecutive failed/halted recurring charges, autopay is
// auto-disabled on our side too (Razorpay itself already halts a
// subscription after its own configured retry attempts — this just keeps
// our local Subscription row in sync with that).
const AUTOPAY_MAX_CONSECUTIVE_FAILURES = parseInt(process.env.AUTOPAY_MAX_CONSECUTIVE_FAILURES, 10) || 3;

// Applies a captured/failed Razorpay payment to its Payment row idempotently
// under a row lock, so a concurrent /verify call and a webhook delivery for
// the same payment can't double-process it. `razorpayPayment` is the full
// payment entity from either razorpayUtil.fetchPayment (verify path) or a
// webhook's payload.payment.entity (webhook path).
async function applyPaymentResult(txnid, razorpayPayment) {
    const t = await sequelize.transaction();
    try {
        const payment = await Payment.findOne({ where: { txnid }, transaction: t, lock: true });
        if (!payment) {
            console.warn(`Razorpay reconcile for unknown txnid=${txnid}`);
            await t.commit();
            return null;
        }

        if (FINAL_STATUSES.includes(payment.status)) {
            await t.commit();
            return payment;
        }

        const newStatus = razorpayUtil.mapRazorpayStatus(razorpayPayment.status);

        await payment.update({
            status: newStatus,
            razorpay_payment_id: razorpayPayment.id || payment.razorpay_payment_id,
            razorpay_method: razorpayPayment.method || null,
            razorpay_bank_ref: razorpayPayment.acquirer_data?.bank_transaction_id
                || razorpayPayment.acquirer_data?.upi_transaction_id
                || null,
            razorpay_response: JSON.stringify(razorpayPayment),
            error_message: newStatus === 'failed' ? (razorpayPayment.error_description || null) : null,
            last_verified_at: new Date()
        }, { transaction: t });

        await t.commit();
        console.log(`Payment txnid=${txnid} reconciled with Razorpay -> status=${newStatus}`);

        if (newStatus === 'success' && !payment.capi_sent_at && payment.payment_method !== 'RAZORPAY_AUTOPAY') {
            sendMetaCapiCompleteRegistration(payment).catch((err) => {
                console.error(`Meta CAPI send failed for txnid=${txnid}:`, err);
            });
        }

        // Affiliate S2S conversion postback (TrafficMedia24, CLAUDE.md §26) —
        // only for the original conversion, never a recurring autopay
        // re-charge (same reasoning as the Meta CAPI guard above), only when
        // this visitor actually arrived with a click_id, and only once per
        // payment. This branch is only reached the instant `status`
        // transitions into 'success' (the FINAL_STATUSES check above makes
        // every later call to applyPaymentResult for this same payment
        // return early before ever reaching here), so a concurrent
        // verify-call/webhook race can't double-send either — the
        // `!affiliate_postback_sent_at` check is extra defense-in-depth on
        // top of that, mirroring the capi_sent_at guard above.
        if (newStatus === 'success' && payment.click_id && !payment.affiliate_postback_sent_at && payment.payment_method !== 'RAZORPAY_AUTOPAY') {
            sendAffiliateConversionPostback(payment).catch((err) => {
                console.error(`Affiliate postback failed for txnid=${txnid}:`, err);
            });
        }

        // First-party analytics: the visit this checkout came from now counts
        // as a conversion (dashboard "Conversions"). Fire-and-forget, same as
        // the calls above — it can never affect the payment itself.
        if (newStatus === 'success' && payment.analytics_session_id && payment.payment_method !== 'RAZORPAY_AUTOPAY') {
            Session.update({ converted: true }, { where: { session_id: payment.analytics_session_id } }).catch((err) => {
                console.error(`Analytics conversion mark failed for txnid=${txnid}:`, err.message);
            });
        }

        return payment;
    } catch (err) {
        await t.rollback();
        console.error(`Error reconciling payment txnid=${txnid} with Razorpay:`, err);
        return null;
    }
}

// Used by POST /api/payments/verify (one-time order flow, signature already
// checked by the controller) — fetches the payment straight from Razorpay
// rather than trusting the client-supplied status, same "never trust a
// single unverified signal" rule this app has always applied to gateway
// callbacks.
async function reconcileOrderPayment(txnid, razorpayPaymentId) {
    const razorpayPayment = await razorpayUtil.fetchPayment(razorpayPaymentId);
    return applyPaymentResult(txnid, razorpayPayment);
}

// Used by GET /api/payments/status/:txnid's throttled re-check when the
// payment is still pending. If we already have a razorpay_payment_id, just
// re-fetch it; otherwise fall back to listing the order's payments (covers a
// resumed session where neither /verify nor the webhook has landed yet).
async function reconcilePendingPayment(payment) {
    let razorpayPayment;
    if (payment.razorpay_payment_id) {
        razorpayPayment = await razorpayUtil.fetchPayment(payment.razorpay_payment_id);
    } else if (payment.razorpay_order_id) {
        const list = await razorpayUtil.fetchOrderPayments(payment.razorpay_order_id);
        razorpayPayment = list?.items?.[0];
    } else {
        // Autopay checkout: the Payment row has neither id (the subscription
        // flow never creates an order of ours) — recover through the
        // Subscription row that points at it.
        const subscription = await Subscription.findOne({ where: { last_payment_id: payment.id } });
        if (subscription?.razorpay_subscription_id) {
            const recovered = await reconcileSubscriptionFirstCharge(subscription);
            if (recovered && recovered.status !== 'pending') return recovered;
        }
    }

    if (!razorpayPayment) {
        await payment.update({ last_verified_at: new Date() });
        return payment;
    }

    return applyPaymentResult(payment.txnid, razorpayPayment);
}

// Used by POST /api/payments/verify for the autopay/subscription flow
// (signature already checked by the controller) — confirms the
// subscription's first (authorizing) charge and flips the Subscription's
// mandate_status to 'active' so the recurring-billing webhooks below can
// take over from here.
async function reconcileSubscriptionAuth(txnid, razorpaySubscriptionId, razorpayPaymentId) {
    const payment = await applyPaymentResult(txnid, await razorpayUtil.fetchPayment(razorpayPaymentId));
    if (!payment) return null;

    const subscription = await Subscription.findOne({ where: { razorpay_subscription_id: razorpaySubscriptionId } });
    if (!subscription) return payment;

    if (payment.status === 'success') {
        await subscription.update({ mandate_status: 'active' });
    } else if (payment.status === 'failed' || payment.status === 'cancelled') {
        await subscription.update({ mandate_status: 'failed', autopay_enabled: false });
    }

    return payment;
}

// Completes a subscription's first (authorizing) charge when the browser's
// /verify call never arrived — common with UPI Autopay on mobile, where the
// customer approves in their UPI app and the Checkout tab is killed or
// reloaded before its `handler` fires. Without this the checkout's Payment
// row stayed 'pending' and mandate_status stayed 'created' forever, so a
// customer Razorpay had already charged was sent back to /plans.
// `razorpayPayment` comes from a webhook payload when available; otherwise
// it's looked up via the subscription's paid invoice. Only ever promotes to
// success — a declined attempt inside Checkout can still be retried with
// another method, so it must not lock the row as 'failed' here.
async function reconcileSubscriptionFirstCharge(subscription, razorpayPayment = null) {
    if (!subscription.last_payment_id) return null;
    const original = await Payment.findByPk(subscription.last_payment_id);
    if (!original || original.payment_method !== 'RAZORPAY' || FINAL_STATUSES.includes(original.status)) {
        return original;
    }

    let chargedPayment = razorpayPayment;
    if (!chargedPayment) {
        const invoices = await razorpayUtil.fetchSubscriptionInvoices(subscription.razorpay_subscription_id);
        const paidInvoice = invoices?.items?.find((invoice) => invoice.status === 'paid' && invoice.payment_id);
        if (!paidInvoice) {
            await original.update({ last_verified_at: new Date() });
            return original;
        }
        chargedPayment = await razorpayUtil.fetchPayment(paidInvoice.payment_id);
    }

    if (razorpayUtil.mapRazorpayStatus(chargedPayment.status) !== 'success') return original;

    const payment = await applyPaymentResult(original.txnid, chargedPayment);
    if (payment?.status === 'success') {
        await subscription.update({ mandate_status: 'active' });
        console.log(`Recovered first subscription charge: txnid=${original.txnid}, razorpaySubscriptionId=${subscription.razorpay_subscription_id}`);
    }
    return payment;
}

// Webhook `payment.captured`/`payment.failed` for a subscription charge —
// those carry Razorpay's own invoice/order ids, never one stored on our
// Payment row, so they're traced back through the invoice to the
// Subscription and its checkout Payment.
async function reconcileSubscriptionPaymentEvent(paymentEntity) {
    if (!paymentEntity?.invoice_id || razorpayUtil.mapRazorpayStatus(paymentEntity.status) !== 'success') return;
    const invoice = await razorpayUtil.fetchInvoice(paymentEntity.invoice_id);
    if (!invoice?.subscription_id) return;
    const subscription = await Subscription.findOne({ where: { razorpay_subscription_id: invoice.subscription_id } });
    if (!subscription) return;
    await reconcileSubscriptionFirstCharge(subscription, paymentEntity);
}

// Webhook `subscription.activated` — Razorpay's own confirmation that the
// mandate is live and its first charge went through.
async function handleSubscriptionActivated(subscriptionEntity) {
    const subscription = await Subscription.findOne({ where: { razorpay_subscription_id: subscriptionEntity.id } });
    if (!subscription) return;

    await reconcileSubscriptionFirstCharge(subscription);
    if (subscriptionEntity.status === 'active' && ['created', 'authenticated'].includes(subscription.mandate_status)) {
        await subscription.update({ mandate_status: 'active' });
    }
}

// Login-time recovery for a customer whose checkout was never confirmed
// (see reconcileSubscriptionFirstCharge) — checks only their most recent
// unconfirmed autopay checkout, throttled by its Payment's last_verified_at
// so this public lookup can't hammer Razorpay.
async function recoverUnconfirmedSubscription(customerPhone) {
    const subscription = await Subscription.findOne({
        where: { customer_phone: customerPhone, mandate_status: 'created' },
        order: [['created_at', 'DESC']]
    });
    if (!subscription?.razorpay_subscription_id || !subscription.last_payment_id) return null;

    const original = await Payment.findByPk(subscription.last_payment_id);
    if (!original || original.status !== 'pending') return null;
    const lastVerified = original.last_verified_at ? new Date(original.last_verified_at).getTime() : 0;
    if (Date.now() - lastVerified <= VERIFY_THROTTLE_MS) return null;

    const payment = await reconcileSubscriptionFirstCharge(subscription);
    return payment?.status === 'success' ? subscription.reload() : null;
}

// Called by the webhook handler for `subscription.charged` — Razorpay itself
// decided a recurring charge was due and already collected it; this just
// records the resulting Payment row and advances the Subscription's billing
// period, mirroring what the old (now-removed) autopay billing cron used to
// do on success, just triggered by Razorpay's own schedule instead of ours.
async function handleSubscriptionCharged({ subscriptionEntity, paymentEntity }) {
    const subscription = await Subscription.findOne({ where: { razorpay_subscription_id: subscriptionEntity.id } });
    if (!subscription) {
        console.warn(`subscription.charged webhook for unknown razorpay_subscription_id=${subscriptionEntity.id}`);
        return;
    }

    // Idempotent — Razorpay can redeliver the same webhook.
    const existing = await Payment.findOne({ where: { razorpay_payment_id: paymentEntity.id } });
    if (existing) return;

    // First charge of a new subscription whose /verify hasn't landed: it
    // belongs to the checkout's own pending Payment row (expires_at already
    // covers that first period) — not a renewal, so no new row and no
    // extra period.
    const original = subscription.last_payment_id ? await Payment.findByPk(subscription.last_payment_id) : null;
    if (original && original.payment_method === 'RAZORPAY' && original.status === 'pending') {
        await reconcileSubscriptionFirstCharge(subscription, paymentEntity);
        return;
    }

    const plan = await SubscriptionPlan.findByPk(subscription.plan_id);
    const newStatus = razorpayUtil.mapRazorpayStatus(paymentEntity.status);

    const payment = await Payment.create({
        txnid: `RZP${paymentEntity.id}`,
        plan_id: subscription.plan_id,
        subscription_id: subscription.id,
        customer_name: 'ClickBuz User',
        customer_email: subscription.customer_email || `user${subscription.customer_phone}@clickbuz-demo.local`,
        customer_phone: subscription.customer_phone,
        amount: (paymentEntity.amount / 100).toFixed(2),
        payment_method: 'RAZORPAY_AUTOPAY',
        status: newStatus,
        razorpay_payment_id: paymentEntity.id,
        razorpay_method: paymentEntity.method || null,
        razorpay_response: JSON.stringify(paymentEntity)
    });

    if (newStatus === 'success') {
        const extendDays = plan ? plan.number_of_days : 30;
        const base = subscription.expires_at && subscription.expires_at.getTime() > Date.now()
            ? subscription.expires_at
            : new Date();
        await subscription.update({
            expires_at: new Date(base.getTime() + extendDays * 86400000),
            last_billed_at: new Date(),
            last_payment_id: payment.id,
            failed_attempt_count: 0,
            // A successful charge means the mandate is live, even if the
            // activation never reached us.
            ...(['created', 'authenticated', 'pending'].includes(subscription.mandate_status) ? { mandate_status: 'active' } : {})
        });
    } else {
        const nextCount = (subscription.failed_attempt_count || 0) + 1;
        const updates = { failed_attempt_count: nextCount };
        if (nextCount >= AUTOPAY_MAX_CONSECUTIVE_FAILURES) {
            updates.autopay_enabled = false;
            updates.mandate_status = 'cancelled';
        }
        await subscription.update(updates);
    }
}

// Called by the webhook handler for `subscription.completed` /
// `subscription.halted` / `subscription.cancelled` — no new charge, just a
// lifecycle status change on the mandate itself.
async function handleSubscriptionStatusChange(subscriptionEntity) {
    const subscription = await Subscription.findOne({ where: { razorpay_subscription_id: subscriptionEntity.id } });
    if (!subscription) return;

    await subscription.update({
        mandate_status: subscriptionEntity.status,
        autopay_enabled: ['halted', 'cancelled', 'completed', 'expired'].includes(subscriptionEntity.status) ? false : subscription.autopay_enabled
    });
}

// Fires the server-side Meta CAPI mirror of the CompleteRegistration event
// the frontend already sends client-side, once per payment — capi_sent_at
// marks the attempt so a webhook retry on an already-success payment never
// sends a duplicate.
async function sendMetaCapiCompleteRegistration(payment) {
    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    await metaCapiUtil.sendCompleteRegistrationEvent({
        eventId: payment.meta_event_id,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: `${frontendUrl}/plans`,
        phone: payment.customer_phone,
        valueAmount: payment.amount,
        currency: 'INR',
        clientIp: payment.client_ip,
        userAgent: payment.client_user_agent,
        fbc: payment.fbc,
        fbp: payment.fbp
    });
    await payment.update({ capi_sent_at: new Date() });
}

// Fires the S2S conversion postback to the affiliate partner for a payment
// that just became 'success' and has a click_id — see
// backend/utils/affiliatePostback.util.js for the actual HTTP call/URL
// construction. Only marks affiliate_postback_sent_at on an actual success;
// left null on failure so a future reconciliation pass can find and retry
// it (see the column's own comment on the Payment model) — deliberately
// different from sendMetaCapiCompleteRegistration's capi_sent_at, which
// marks any attempt regardless of outcome, since CAPI has no equivalent
// retry requirement.
async function sendAffiliateConversionPostback(payment) {
    // The paid plan's cycle picks the partner (weekly → media9, others →
    // TrafficMedia24) — see resolvePostbackConfig in affiliatePostback.util.js.
    const plan = payment.plan_id ? await SubscriptionPlan.findByPk(payment.plan_id) : null;
    const result = await affiliatePostbackUtil.sendAffiliatePostback({
        clickId: payment.click_id,
        txnid: payment.txnid,
        billingCycle: plan?.billing_cycle
    });
    if (result.ok) {
        await payment.update({ affiliate_postback_sent_at: new Date() });
    }
}

module.exports = {
    FINAL_STATUSES,
    VERIFY_THROTTLE_MS,
    reconcileOrderPayment,
    reconcilePendingPayment,
    reconcileSubscriptionAuth,
    reconcileSubscriptionPaymentEvent,
    recoverUnconfirmedSubscription,
    handleSubscriptionActivated,
    handleSubscriptionCharged,
    handleSubscriptionStatusChange
};
