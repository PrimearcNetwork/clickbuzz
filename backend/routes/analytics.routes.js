const express = require('express');
const router = express.Router();

const trackingController = require('../controllers/analytics/tracking.controller');
const dashboardController = require('../controllers/analytics/dashboard.controller');
const visitorsController = require('../controllers/analytics/visitors.controller');
const exportController = require('../controllers/analytics/export.controller');

// Ingestion — called from every public page (src/analytics/tracker.js).
router.post('/collect', trackingController.collect);

// Dashboard — cards, live "active now" count, trend series, dimension
// breakdowns, UTM campaign performance.
router.get('/dashboard/summary', dashboardController.getSummary);
router.get('/dashboard/active', dashboardController.getActiveVisitors);
router.get('/dashboard/trend', dashboardController.getTrend);
router.get('/dashboard/breakdown', dashboardController.getBreakdown);
router.get('/dashboard/utm-campaigns', dashboardController.getUtmCampaigns);
router.get('/dashboard/payments', dashboardController.getPayments);
router.get('/dashboard/engagement', dashboardController.getEngagement);

// Visitor table + detail.
router.get('/visitors/filters', visitorsController.getFilterOptions);
router.get('/visitors/:visitorId/detail', visitorsController.getVisitorDetail);
router.get('/visitors', visitorsController.getSessions);

// CSV export.
router.get('/export/csv', exportController.exportCsv);

module.exports = router;
