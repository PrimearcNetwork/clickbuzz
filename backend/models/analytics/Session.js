const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db.config');

// One row per session (client-generated UUID, new session starts after 30
// minutes of inactivity — see src/analytics/tracker.js). Device/location
// columns are denormalized snapshots of the Visitor at the time this session
// started, so table/filter/export queries never need to join analytics_visitors.
const Session = sequelize.define('Session', {
    session_id: {
        type: DataTypes.STRING(36),
        primaryKey: true
    },
    visitor_id: {
        type: DataTypes.STRING(36),
        allowNull: false
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    ended_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    duration_seconds: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    entry_page: { type: DataTypes.STRING(512), allowNull: true },
    exit_page: { type: DataTypes.STRING(512), allowNull: true },
    pages_viewed: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    is_bounce: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    converted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    // True once any pageview in this session happened while the visitor had
    // a login session (src/analytics/tracker.js sends `loggedIn`).
    is_logged_in: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    traffic_source: { type: DataTypes.STRING, allowNull: true },
    referrer_url: { type: DataTypes.TEXT, allowNull: true },
    referrer_domain: { type: DataTypes.STRING, allowNull: true },
    utm_source: { type: DataTypes.STRING, allowNull: true },
    utm_medium: { type: DataTypes.STRING, allowNull: true },
    utm_campaign: { type: DataTypes.STRING, allowNull: true },
    utm_term: { type: DataTypes.STRING, allowNull: true },
    utm_content: { type: DataTypes.STRING, allowNull: true },
    device_type: { type: DataTypes.STRING, allowNull: true },
    browser: { type: DataTypes.STRING, allowNull: true },
    os: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING, allowNull: true },
    region: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true }
}, {
    tableName: 'analytics_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Session;
