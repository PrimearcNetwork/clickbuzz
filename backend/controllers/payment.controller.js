const crypto = require('crypto');
const { Op } = require('sequelize');
const { Payment, Subscription, SubscriptionPlan } = require('../models');
const razorpayUtil = require('../utils/razorpay.util');
const { getClientIp } = require('../utils/analytics/ipHash.util');
const { isValidClickId } = require('../utils/affiliatePostback.util');
const {
    FINAL_STATUSES,
    VERIFY_THROTTLE_MS,
    reconcileOrderPayment,
    reconcilePendingPayment,
    reconcileSubscriptionAuth,
    handleSubscriptionCharged,
    handleSubscriptionStatusChange
} = require('../services/paymentReconcile.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;
// Same shape as the ids POST /api/analytics/collect accepts.
const ANALYTICS_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

// Razorpay Plan `period`/`interval` per this app's SubscriptionPlan.billing_cycle
// values, plus a total_count tuned to ~10 years of that cadence — matches
// createSubscription's own "no fixed end" reasoning, but per-period instead
// of one flat 120 (120 *weekly* cycles is only ~2.3 years, not 10).
//
// DAILY is a special case: Razorpay's Subscriptions API rejects period:
// 'daily' with interval 1 — "Interval provided is less than the minimum
// interval (7) allowed for the given period (daily)". Razorpay simply has no
// true day-to-day recurring cycle; 7 is its own enforced floor, so a DAILY
// plan's autopay actually recurs every 7 days (same cadence as WEEKLY) —
// it's still a distinct SKU/price point, just not literally daily billing.
const BILLING_CYCLE_TO_RAZORPAY = {
    DAILY: { period: 'daily', interval: 7, totalCount: 520 },
    WEEKLY: { period: 'weekly', interval: 1, totalCount: 520 },
    MONTHLY: { period: 'monthly', interval: 1, totalCount: 120 },
    YEARLY: { period: 'yearly', interval: 1, totalCount: 10 }
};

// Generates our own app-level transaction id, independent of Razorpay's own
// order/payment ids — used as this app's stable external reference (URL
// params, polling, the Razorpay order's `receipt` field).
const generateTxnId = () => {
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(5).toString('hex');
    return `NX${ts}${rand}`.toUpperCase();
};

// Creates a Payment record and either a Razorpay Order (one-time purchase)
// or a Razorpay Subscription (enable_autopay) for the frontend to open via
// Checkout.js.
exports.createPayment = async (req, res) => {
    try {
        const {
            plan_id, customer_name, customer_email, customer_phone, fbc, fbp, click_id, enable_autopay,
            analytics_session_id, analytics_visitor_id, is_internal
        } = req.body;

        if (!plan_id || !customer_name || !customer_email || !customer_phone) {
            return res.status(400).json({ message: 'plan_id, customer_name, customer_email and customer_phone are required' });
        }
        if (!EMAIL_RE.test(customer_email)) {
            return res.status(400).json({ message: 'Invalid email address' });
        }
        if (!PHONE_RE.test(customer_phone)) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }

        const plan = await SubscriptionPlan.findByPk(plan_id);
        if (!plan || !plan.status) {
            return res.status(404).json({ message: 'Subscription plan not found or inactive' });
        }

        const key = process.env.RAZORPAY_KEY_ID;
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!key || !secret) {
            console.error('Razorpay credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }

        const txnid = generateTxnId();
        const amount = Number(plan.original_price).toFixed(2);

        // Razorpay itself rejects an order below this — checked here too so
        // a misconfigured plan price fails with a clear 400 instead of a
        // confusing 502 from deeper inside the Razorpay call.
        if (razorpayUtil.toPaise(amount) < razorpayUtil.MIN_AMOUNT_PAISE) {
            return res.status(400).json({ message: `Plan amount is below Razorpay's minimum chargeable amount (₹${(razorpayUtil.MIN_AMOUNT_PAISE / 100).toFixed(2)})` });
        }

        // Shared with the client-side Meta Pixel's CompleteRegistration call
        // (once payment succeeds) so Meta can dedupe the two events — see
        // trackCompleteRegistration in src/analytics/metaEvents.js.
        const metaEventId = crypto.randomUUID();

        // Affiliate/marketing partner attribution (TrafficMedia24, see
        // CLAUDE.md §26) — a malformed/tampered value is silently dropped
        // (not a 400) so a broken click_id never blocks an otherwise valid
        // payment; it just means no postback fires for this one.
        if (click_id && !isValidClickId(click_id)) {
            console.warn(`Dropping malformed click_id on payment create (txnid not yet generated, plan=${plan_id})`);
        }
        const sanitizedClickId = isValidClickId(click_id) ? click_id : null;

        // First-party analytics link — same shape as the ids /api/analytics/collect
        // accepts; anything else is dropped (never blocks the payment).
        const analyticsId = (value) => (typeof value === 'string' && ANALYTICS_ID_RE.test(value) ? value : null);

        // Create the pending record first so we have an audit trail even if
        // the call to Razorpay below fails outright.
        const payment = await Payment.create({
            txnid,
            plan_id: plan.id,
            customer_name,
            customer_email,
            customer_phone,
            amount,
            payment_method: 'RAZORPAY',
            status: 'pending',
            fbc: typeof fbc === 'string' ? fbc.slice(0, 255) : null,
            fbp: typeof fbp === 'string' ? fbp.slice(0, 255) : null,
            click_id: sanitizedClickId,
            analytics_session_id: analyticsId(analytics_session_id),
            analytics_visitor_id: analyticsId(analytics_visitor_id),
            is_internal: is_internal === true,
            client_ip: getClientIp(req),
            client_user_agent: (req.headers['user-agent'] || '').toString().slice(0, 512),
            meta_event_id: metaEventId
        });

        if (enable_autopay) {
            try {
                // Recurring cadence follows the plan's own billing_cycle
                // (weekly/monthly/yearly) rather than always billing monthly.
                const razorpayCycle = BILLING_CYCLE_TO_RAZORPAY[plan.billing_cycle] || BILLING_CYCLE_TO_RAZORPAY.MONTHLY;

                // A Razorpay Plan is reusable across every subscriber of this
                // SubscriptionPlan — created once and cached, since Razorpay
                // has no "get or create" endpoint of its own.
                let razorpayPlanId = plan.razorpay_plan_id;
                if (!razorpayPlanId) {
                    const razorpayPlan = await razorpayUtil.createPlan({ amount, name: `ClickBuz ${plan.name}`, period: razorpayCycle.period, interval: razorpayCycle.interval });
                    razorpayPlanId = razorpayPlan.id;
                    await plan.update({ razorpay_plan_id: razorpayPlanId });
                }

                const subscription = await razorpayUtil.createSubscription({
                    planId: razorpayPlanId,
                    totalCount: razorpayCycle.totalCount,
                    notes: { customer_phone, plan_id: String(plan.id) }
                });

                await Subscription.create({
                    customer_phone,
                    customer_email,
                    plan_id: plan.id,
                    status: 'active',
                    expires_at: new Date(Date.now() + plan.number_of_days * 86400000),
                    autopay_enabled: true,
                    mandate_status: 'created',
                    razorpay_subscription_id: subscription.id,
                    last_payment_id: payment.id
                });

                console.log(`Subscription created: txnid=${txnid}, plan=${plan.id}, razorpaySubscriptionId=${subscription.id}, hasClickId=${Boolean(sanitizedClickId)}`);

                return res.status(201).json({
                    paymentId: payment.id,
                    txnid,
                    amount,
                    razorpayKeyId: key,
                    subscriptionId: subscription.id,
                    status: 'pending',
                    metaEventId
                });
            } catch (err) {
                console.error(`Razorpay subscription creation failed for txnid=${txnid}:`, err.message);
                await payment.update({ status: 'failed', error_message: `Razorpay subscription creation failed: ${err.message}` });
                // 401 from Razorpay means the configured key/secret itself is
                // invalid — surface that distinctly rather than a blanket 502.
                if (err.statusCode === 401) {
                    return res.status(401).json({ message: 'Razorpay authentication failed — check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET' });
                }
                return res.status(502).json({ message: 'Failed to start subscription with Razorpay' });
            }
        }

        let order;
        try {
            order = await razorpayUtil.createOrder({ amount, receipt: txnid, notes: { plan_id: String(plan.id), customer_phone } });
        } catch (err) {
            console.error(`Razorpay order creation failed for txnid=${txnid}:`, err.message);
            await payment.update({ status: 'failed', error_message: `Razorpay order creation failed: ${err.message}` });
            if (err.statusCode === 401) {
                return res.status(401).json({ message: 'Razorpay authentication failed — check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET' });
            }
            return res.status(502).json({ message: 'Failed to initiate payment with Razorpay' });
        }

        await payment.update({ razorpay_order_id: order.id });

        console.log(`Payment created: txnid=${txnid}, plan=${plan.id}, amount=${amount}, hasClickId=${Boolean(sanitizedClickId)}`);

        return res.status(201).json({
            paymentId: payment.id,
            txnid,
            amount,
            razorpayKeyId: key,
            orderId: order.id,
            status: 'pending',
            metaEventId
        });
    } catch (err) {
        console.error('Error creating payment:', err);
        return res.status(500).json({ message: 'Server error creating payment' });
    }
};

// Called by the frontend right after Razorpay Checkout's client-side
// `handler` callback fires. Verifies the HMAC signature Razorpay signs that
// callback with, then re-confirms the payment directly against Razorpay's
// API before writing a final status — the signature alone proves the
// callback wasn't tampered with in transit, not that the charge actually
// captured, so this never trusts it as the final word on its own.
exports.verifyPayment = async (req, res) => {
    try {
        const { txnid, razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, razorpay_signature } = req.body;

        if (!txnid || !razorpay_payment_id || !razorpay_signature || (!razorpay_order_id && !razorpay_subscription_id)) {
            return res.status(400).json({ message: 'Missing required verification fields' });
        }

        const payment = await Payment.findOne({ where: { txnid } });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        let signatureValid;
        if (razorpay_subscription_id) {
            signatureValid = razorpayUtil.verifySubscriptionSignature({
                subscriptionId: razorpay_subscription_id,
                paymentId: razorpay_payment_id,
                signature: razorpay_signature
            });
        } else {
            signatureValid = razorpayUtil.verifyPaymentSignature({
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                signature: razorpay_signature
            });
        }

        if (!signatureValid) {
            console.warn(`Razorpay signature verification failed for txnid=${txnid}`);
            return res.status(400).json({ message: 'Payment signature verification failed' });
        }

        const reconciled = razorpay_subscription_id
            ? await reconcileSubscriptionAuth(txnid, razorpay_subscription_id, razorpay_payment_id)
            : await reconcileOrderPayment(txnid, razorpay_payment_id);

        if (!reconciled) {
            return res.status(500).json({ message: 'Server error verifying payment' });
        }

        return res.json({ txnid, status: reconciled.status, metaEventId: reconciled.meta_event_id });
    } catch (err) {
        console.error('Error verifying payment:', err);
        return res.status(500).json({ message: 'Server error verifying payment' });
    }
};

// Re-checks a payment's status against Razorpay (throttled) and returns the
// backend-confirmed status. Never trusts anything other than the DB / Razorpay.
exports.getPaymentStatus = async (req, res) => {
    try {
        const { txnid } = req.params;
        let payment = await Payment.findOne({ where: { txnid } });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        if (!FINAL_STATUSES.includes(payment.status)) {
            const lastVerified = payment.last_verified_at ? new Date(payment.last_verified_at).getTime() : 0;
            if (Date.now() - lastVerified > VERIFY_THROTTLE_MS) {
                const reconciled = await reconcilePendingPayment(payment);
                if (reconciled) payment = reconciled;
            }
        }

        return res.json({
            txnid: payment.txnid,
            status: payment.status,
            amount: payment.amount,
            planId: payment.plan_id,
            paymentMethod: payment.payment_method,
            updatedAt: payment.updated_at,
            // Lets the frontend recover the id for a payment resumed on a
            // fresh page load, so its Pixel CompleteRegistration call can
            // still dedupe against the server-side CAPI mirror sent below.
            metaEventId: payment.meta_event_id
        });
    } catch (err) {
        console.error('Error fetching payment status:', err);
        return res.status(500).json({ message: 'Server error fetching payment status' });
    }
};

// Lets the frontend recognize a returning customer at login time (see
// LoginPage.jsx) without any real backend session — consumer auth is still
// just a phone-number demo (§8), so this is keyed on customer_phone alone,
// same convention as Payment/Subscription themselves. Looks for a
// Subscription whose mandate actually completed its first charge
// (mandate_status: 'active' — 'created'/'failed' mean checkout was never
// finished) and hasn't lapsed yet (expires_at in the future).
exports.getSubscriptionStatus = async (req, res) => {
    try {
        const { phone } = req.params;
        if (!PHONE_RE.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }

        const subscription = await Subscription.findOne({
            where: {
                customer_phone: phone,
                mandate_status: 'active',
                expires_at: { [Op.gt]: new Date() }
            },
            order: [['expires_at', 'DESC']]
        });

        if (!subscription) {
            return res.json({ active: false });
        }

        const plan = await SubscriptionPlan.findByPk(subscription.plan_id);
        return res.json({
            active: true,
            planId: subscription.plan_id,
            planName: plan ? plan.name : null,
            expiresAt: subscription.expires_at
        });
    } catch (err) {
        console.error('Error checking subscription status:', err);
        return res.status(500).json({ message: 'Error checking subscription status' });
    }
};

// Razorpay's dashboard-configured webhook — server-to-server only, no
// browser involved. Every branch here is reached only after the raw-body
// HMAC signature is verified in routes/payment.routes.js's middleware.
exports.handleWebhook = async (req, res) => {
    try {
        const event = req.body?.event;
        const payload = req.body?.payload;

        switch (event) {
            case 'payment.captured':
            case 'payment.failed': {
                const paymentEntity = payload?.payment?.entity;
                const orderId = paymentEntity?.order_id;
                if (orderId) {
                    const payment = await Payment.findOne({ where: { razorpay_order_id: orderId } });
                    if (payment) {
                        await reconcileOrderPayment(payment.txnid, paymentEntity.id);
                    }
                }
                break;
            }
            case 'subscription.charged': {
                await handleSubscriptionCharged({
                    subscriptionEntity: payload?.subscription?.entity,
                    paymentEntity: payload?.payment?.entity
                });
                break;
            }
            case 'subscription.completed':
            case 'subscription.halted':
            case 'subscription.cancelled': {
                await handleSubscriptionStatusChange(payload?.subscription?.entity);
                break;
            }
            default:
                console.log(`Unhandled Razorpay webhook event: ${event}`);
        }

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Error processing Razorpay webhook:', err);
        // Non-2xx so Razorpay's retry mechanism can recover from transient failures
        return res.status(500).json({ status: 'error' });
    }
};
