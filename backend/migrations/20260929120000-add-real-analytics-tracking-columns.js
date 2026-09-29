'use strict';

// Columns that let the Analytics dashboard show real numbers for metrics it
// previously had no data for (see CLAUDE.md §23):
//   analytics_sessions.is_logged_in    — true once any pageview in the session
//                                         happened with a login session
//   payments.analytics_session_id       — the analytics session the checkout
//   payments.analytics_visitor_id         started from (UTM attribution,
//                                         "conversions")
//   payments.is_internal                — checkout made from an owner/team
//                                         device (excluded from analytics)
// plus two indexes for the new dashboard queries. Idempotent (checks each
// column/index before adding/removing it) and touches no existing data.

async function hasIndex(queryInterface, table, name) {
    const indexes = await queryInterface.showIndex(table);
    return indexes.some((index) => index.name === name);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const sessions = await queryInterface.describeTable('analytics_sessions');
        if (!sessions.is_logged_in) {
            await queryInterface.addColumn('analytics_sessions', 'is_logged_in', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            });
        }

        const payments = await queryInterface.describeTable('payments');
        if (!payments.analytics_session_id) {
            await queryInterface.addColumn('payments', 'analytics_session_id', {
                type: Sequelize.STRING(64),
                allowNull: true,
            });
        }
        if (!payments.analytics_visitor_id) {
            await queryInterface.addColumn('payments', 'analytics_visitor_id', {
                type: Sequelize.STRING(64),
                allowNull: true,
            });
        }
        if (!payments.is_internal) {
            await queryInterface.addColumn('payments', 'is_internal', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            });
        }

        if (!(await hasIndex(queryInterface, 'payments', 'payments_analytics_session_id'))) {
            await queryInterface.addIndex('payments', ['analytics_session_id'], { name: 'payments_analytics_session_id' });
        }
        if (!(await hasIndex(queryInterface, 'analytics_visitor_events', 'analytics_visitor_events_name_created_at'))) {
            await queryInterface.addIndex('analytics_visitor_events', ['event_name', 'created_at'], {
                name: 'analytics_visitor_events_name_created_at',
            });
        }
    },

    async down(queryInterface) {
        if (await hasIndex(queryInterface, 'analytics_visitor_events', 'analytics_visitor_events_name_created_at')) {
            await queryInterface.removeIndex('analytics_visitor_events', 'analytics_visitor_events_name_created_at');
        }
        if (await hasIndex(queryInterface, 'payments', 'payments_analytics_session_id')) {
            await queryInterface.removeIndex('payments', 'payments_analytics_session_id');
        }

        const payments = await queryInterface.describeTable('payments');
        if (payments.is_internal) await queryInterface.removeColumn('payments', 'is_internal');
        if (payments.analytics_visitor_id) await queryInterface.removeColumn('payments', 'analytics_visitor_id');
        if (payments.analytics_session_id) await queryInterface.removeColumn('payments', 'analytics_session_id');

        const sessions = await queryInterface.describeTable('analytics_sessions');
        if (sessions.is_logged_in) await queryInterface.removeColumn('analytics_sessions', 'is_logged_in');
    },
};
