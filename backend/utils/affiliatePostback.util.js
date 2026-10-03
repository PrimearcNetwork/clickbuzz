// Server-to-server conversion postback for the TrafficMedia24 affiliate
// integration (see CLAUDE.md §26, backend/services/paymentReconcile.service.js).
// The partner's documented callback shape is:
//   <AFFILIATE_POSTBACK_URL>?click=@clickid&id=<AFFILIATE_POSTBACK_ID>
// (real values live only in the server's backend/.env), where @clickid is the exact click_id this app captured from the visitor's
// landing URL (src/analytics/affiliateClickId.js) and stored on the Payment
// row. This is a GET, no auth — nothing beyond what the partner's own
// callback URL documents was invented here (see AFFILIATE_POSTBACK_ID note
// below and CLAUDE.md §26's "open questions" list).

// Same charset the frontend validates against (src/analytics/affiliateClickId.js)
// — re-checked here as defense in depth since this value ends up in an
// outbound URL to a third party.
const CLICK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isValidClickId = (value) => typeof value === 'string' && CLICK_ID_RE.test(value);

// Per-plan partner: a plan's billing cycle (e.g. WEEKLY) can have its own
// postback, configured as AFFILIATE_POSTBACK_URL_WEEKLY + AFFILIATE_POSTBACK_ID_WEEKLY
// (the weekly ₹99 plan reports to media9). A cycle without its own URL uses
// the default AFFILIATE_POSTBACK_URL / AFFILIATE_POSTBACK_ID (TrafficMedia24).
const resolvePostbackConfig = (billingCycle) => {
    const cycle = (billingCycle || '').toUpperCase();
    const cycleUrl = cycle ? process.env[`AFFILIATE_POSTBACK_URL_${cycle}`] : null;
    if (cycleUrl) {
        return { baseUrl: cycleUrl, postbackId: process.env[`AFFILIATE_POSTBACK_ID_${cycle}`] };
    }
    return { baseUrl: process.env.AFFILIATE_POSTBACK_URL, postbackId: process.env.AFFILIATE_POSTBACK_ID };
};

// Builds the exact postback URL via URL/URLSearchParams (never raw string
// concatenation) so click_id is always correctly percent-encoded.
const buildPostbackUrl = (clickId, billingCycle) => {
    const { baseUrl, postbackId } = resolvePostbackConfig(billingCycle);
    if (!baseUrl) return null;

    const url = new URL(baseUrl);
    url.searchParams.set('click', clickId);
    // `id` is a fixed partner-side campaign/integration id per the callback
    // the partner gave us — kept configurable (not hardcoded) in case
    // they ever issue a different one, but nothing here assumes it varies
    // per click/payment; that has not been confirmed.
    if (postbackId) url.searchParams.set('id', postbackId);

    return url.toString();
};

// Fires the affiliate conversion postback. Never throws — a failed/
// misconfigured postback must never break or roll back an otherwise
// successful customer payment (paymentReconcile.service.js calls this
// fire-and-forget after the payment is already committed as 'success').
// Returns { ok, status?, body?, url? } for the caller to log and persist.
const sendAffiliatePostback = async ({ clickId, txnid, billingCycle }) => {
    if (!isValidClickId(clickId)) {
        // Should never happen — payment.controller.js already validates
        // before persisting click_id — but never send an unvalidated value
        // to a third-party URL regardless of how it got here.
        console.warn(`Affiliate postback skipped for txnid=${txnid}: invalid click_id`);
        return { ok: false };
    }

    const postbackUrl = buildPostbackUrl(clickId, billingCycle);
    if (!postbackUrl) {
        console.warn('Affiliate postback skipped: AFFILIATE_POSTBACK_URL is not configured');
        return { ok: false };
    }

    try {
        // GET only — that's what the partner's own callback URL indicates;
        // no evidence of a required method/response contract beyond that
        // (see CLAUDE.md §26's "open questions" list).
        // Bounded so a hung partner endpoint can't leave this open forever
        // (it's fire-and-forget, so it never blocks the payment itself).
        const response = await fetch(postbackUrl, { method: 'GET', signal: AbortSignal.timeout(10000) });
        const text = await response.text().catch(() => '');

        if (!response.ok) {
            console.error(`Affiliate postback failed for txnid=${txnid}: HTTP ${response.status}`);
            return { ok: false, status: response.status, body: text, url: postbackUrl };
        }

        console.log(`Affiliate postback sent for txnid=${txnid} (${new URL(postbackUrl).host}): HTTP ${response.status}`);
        return { ok: true, status: response.status, body: text, url: postbackUrl };
    } catch (err) {
        console.error(`Affiliate postback threw for txnid=${txnid}:`, err.message);
        return { ok: false };
    }
};

module.exports = {
    isValidClickId,
    buildPostbackUrl,
    sendAffiliatePostback
};
