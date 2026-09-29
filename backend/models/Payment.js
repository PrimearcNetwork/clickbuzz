const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db.config');

const Payment = sequelize.define('Payment', {
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    txnid: {
        type: DataTypes.STRING,
        allowNull: false,
        // Fixed name so sync({ alter: true }) matches the existing DB index
        // by name on every boot instead of adding a new duplicate one each
        // time — see backend/models/User.js for the full explanation.
        unique: 'payments_txnid_unique'
    },
    plan_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true
    },
    // Set only on recurring Razorpay Subscription charges (payment_method
    // 'RAZORPAY_AUTOPAY', created from the `subscription.charged` webhook —
    // see paymentReconcile.service.js) — links back to the Subscription
    // being billed. The original one-time/registration payment leaves this
    // null; it's instead pointed to via subscriptions.last_payment_id. See
    // migration 20260808140000-add-subscription-id-to-payments.js.
    subscription_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true
    },
    customer_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    customer_email: {
        type: DataTypes.STRING,
        allowNull: false
    },
    customer_phone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    // 'RAZORPAY' (one-time order) | 'RAZORPAY_AUTOPAY' (recurring Subscription
    // charge, see the subscription_id comment below) — Razorpay's own
    // payment.method (card/upi/netbanking/...) is captured separately, in
    // razorpay_method below, once the charge actually completes.
    payment_method: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'RAZORPAY'
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending' // pending | success | failed | cancelled
    },
    razorpay_order_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    razorpay_payment_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    razorpay_signature: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // Razorpay's own payment.method (card/upi/netbanking/wallet/emandate...).
    razorpay_method: {
        type: DataTypes.STRING,
        allowNull: true
    },
    razorpay_bank_ref: {
        type: DataTypes.STRING,
        allowNull: true
    },
    razorpay_response: {
        type: DataTypes.TEXT('long'),
        allowNull: true
    },
    error_message: {
        type: DataTypes.STRING,
        allowNull: true
    },
    last_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Meta Conversions API (CAPI) support — captured from the browser at
    // checkout time (POST /api/payments/create) since applyPaymentResult()
    // (paymentReconcile.service.js) has no request context when a payment
    // later becomes 'success' (see migration
    // 20260808120000-add-meta-capi-columns-to-payments.js).
    fbc: {
        type: DataTypes.STRING,
        allowNull: true
    },
    fbp: {
        type: DataTypes.STRING,
        allowNull: true
    },
    client_ip: {
        type: DataTypes.STRING,
        allowNull: true
    },
    client_user_agent: {
        type: DataTypes.STRING(512),
        allowNull: true
    },
    meta_event_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    capi_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Affiliate/marketing partner attribution (TrafficMedia24, see CLAUDE.md
    // §25) — captured from the browser at checkout (POST /api/payments/create)
    // same as fbc/fbp above, since it can only ever come from the visitor's
    // own landing URL. Null for any payment from a non-affiliate visitor.
    // See migration 20260922100000-add-click-id-to-payments.js.
    click_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // Set only once the S2S conversion postback to the affiliate partner
    // actually succeeds (see paymentReconcile.service.js) — left null on
    // failure so a future reconciliation pass can find and retry it via
    // `WHERE status = 'success' AND click_id IS NOT NULL AND
    // affiliate_postback_sent_at IS NULL`.
    affiliate_postback_sent_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // First-party analytics link (CLAUDE.md §23): the analytics session and
    // visitor this checkout started from — used for UTM attribution and to
    // mark that session as converted once the payment succeeds.
    analytics_session_id: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    analytics_visitor_id: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    // Checkout made from an owner/team device (src/analytics/internalTraffic.js)
    // — kept out of the Analytics dashboard.
    is_internal: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    tableName: 'payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Payment;
