const crypto = require('crypto');

// Razorpay's REST API — plain HTTPS + HTTP Basic Auth (key_id:key_secret), no
// SDK, matching this codebase's existing preference for hand-rolling small
// gateway integrations (see csv.util.js's comment on the same convention).
// See https://razorpay.com/docs/api/.
const API_BASE = 'https://api.razorpay.com/v1';

const authHeader = () => {
    const key = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
};

const request = async (method, path, body) => {
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`Razorpay response was not valid JSON (${path}): ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
        const message = data?.error?.description || `HTTP ${response.status}`;
        const err = new Error(`Razorpay ${method} ${path} failed: ${message}`);
        // Lets callers (payment.controller.js) distinguish a bad/misconfigured
        // API key (401 from Razorpay itself) from any other failure, so the
        // client gets a meaningful status code instead of a blanket 502.
        err.statusCode = response.status;
        throw err;
    }

    return data;
};

// Amounts are always in paise (smallest currency unit) per Razorpay's API —
// callers pass a rupee amount (matches this app's existing DECIMAL(10,2)
// convention on SubscriptionPlan.original_price/Payment.amount).
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// Razorpay's own floor for an Order's amount — an order below this is
// rejected by their API before it ever reaches a real Checkout modal.
const MIN_AMOUNT_PAISE = 100;

// One-time purchase: creates a Razorpay Order, opened client-side via
// Checkout.js with this order_id. `receipt` is our own app-generated txnid,
// just for cross-referencing in the Razorpay dashboard.
const createOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) =>
    request('POST', '/orders', { amount: toPaise(amount), currency, receipt, notes });

// Creates a Razorpay Plan (the recurring-billing template a Subscription is
// created against) — lazily called once per SubscriptionPlan and its id
// cached on SubscriptionPlan.razorpay_plan_id (see payment.controller.js),
// since Razorpay has no "get or create" endpoint of its own.
const createPlan = async ({ amount, period = 'monthly', interval = 1, name }) =>
    request('POST', '/plans', {
        period,
        interval,
        item: { name, amount: toPaise(amount), currency: 'INR' }
    });

// total_count is required by Razorpay's API even for an open-ended
// subscription — 120 monthly cycles (10 years) is effectively "no fixed end"
// without hardcoding a specific expiry date.
const DEFAULT_TOTAL_COUNT = 120;

const createSubscription = async ({ planId, totalCount = DEFAULT_TOTAL_COUNT, customerNotify = 1, notes = {} }) =>
    request('POST', '/subscriptions', {
        plan_id: planId,
        total_count: totalCount,
        customer_notify: customerNotify,
        notes
    });

// cancelAtCycleEnd lets the current paid period finish instead of an
// immediate cutoff — Razorpay's own opt-in for a graceful cancel.
const cancelSubscription = async (subscriptionId, cancelAtCycleEnd = false) =>
    request('POST', `/subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 });

const fetchPayment = async (paymentId) => request('GET', `/payments/${paymentId}`);

// Fallback lookup for when a payment's status is polled (GET /status/:txnid)
// before its razorpay_payment_id is known yet (neither the client's /verify
// call nor a webhook has arrived) — Razorpay's Orders API lets us discover
// any payment(s) attempted against an order by its order_id, our one stable
// handle from the moment the order was created.
const fetchOrderPayments = async (orderId) => request('GET', `/orders/${orderId}/payments`);

// Subscription charges are billed through Razorpay invoices — each invoice
// carries both its subscription_id and the payment_id that paid it, which is
// how a subscription's first charge is recovered when the browser's /verify
// call never arrived (see reconcileSubscriptionFirstCharge).
const fetchInvoice = async (invoiceId) => request('GET', `/invoices/${invoiceId}`);
const fetchSubscriptionInvoices = async (subscriptionId) =>
    request('GET', `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`);

const sha256Hex = (str, secret) => crypto.createHmac('sha256', secret).update(str).digest('hex');

// Verifies the signature Razorpay Checkout's client-side `handler` callback
// hands the frontend after a one-time order payment:
// hmac_sha256(order_id + "|" + payment_id, key_secret)
// Per https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#step-6-verify-payment-signature
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
    const expected = sha256Hex(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET);
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// Verifies the signature for a subscription's first (authorizing) payment:
// hmac_sha256(payment_id + "|" + subscription_id, key_secret)
// Per https://razorpay.com/docs/payments/subscriptions/verify-signature/
const verifySubscriptionSignature = ({ subscriptionId, paymentId, signature }) => {
    const expected = sha256Hex(`${paymentId}|${subscriptionId}`, process.env.RAZORPAY_KEY_SECRET);
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// Verifies a webhook payload's X-Razorpay-Signature header:
// hmac_sha256(raw request body, webhook secret)
// Per https://razorpay.com/docs/webhooks/validate-test/
const verifyWebhookSignature = ({ rawBody, signature }) => {
    const expected = sha256Hex(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET);
    if (!signature || expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// Maps Razorpay's payment/subscription statuses to this app's internal
// payment status (pending | success | failed | cancelled).
const mapRazorpayStatus = (status) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'captured' || normalized === 'active' || normalized === 'charged' || normalized === 'authorized') return 'success';
    if (normalized === 'failed' || normalized === 'halted') return 'failed';
    if (normalized === 'cancelled' || normalized === 'expired') return 'cancelled';
    return 'pending';
};

module.exports = {
    toPaise,
    MIN_AMOUNT_PAISE,
    createOrder,
    createPlan,
    createSubscription,
    cancelSubscription,
    fetchPayment,
    fetchOrderPayments,
    fetchInvoice,
    fetchSubscriptionInvoices,
    verifyPaymentSignature,
    verifySubscriptionSignature,
    verifyWebhookSignature,
    mapRazorpayStatus
};
