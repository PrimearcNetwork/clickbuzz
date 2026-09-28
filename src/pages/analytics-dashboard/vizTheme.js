// Chart color tokens for the analytics dashboard — dark-mode-only values
// from the dataviz skill's validated reference palette (references/palette.md),
// matching this project's existing "dark theme only, no toggle" convention
// (CLAUDE.md §14). Kept in one file so every chart component draws from the
// same source instead of hardcoding hex values inline.
//
// Every breakdown/ranked list in this dashboard is a single-series magnitude
// encoding (one dimension's count, e.g. "sessions by country") — per the
// skill's color formula that's ONE hue throughout (SEQUENTIAL), not a
// categorical palette; there's nothing to disambiguate by color when there's
// only one series. The 8-slot categorical order is kept here only for the
// rare case a chart needs true multi-series identity.

export const CHART_SURFACE = '#12161f'; // close to this project's own --color-bg-card (#090d16), not identical, so dashboard charts read as their own surface layer
export const CHART_INK_PRIMARY = '#ffffff';
export const CHART_INK_SECONDARY = '#c3c2b7';
export const CHART_INK_MUTED = '#898781';
export const CHART_GRIDLINE = '#2c2c2a';
export const CHART_BASELINE = '#383835';

export const SEQUENTIAL_HUE = '#3987e5'; // single hue for magnitude (ranked lists, single-metric trend line)
export const SEQUENTIAL_HUE_SOFT = 'rgba(57, 135, 229, 0.18)'; // area-fill tint of the same hue

export const CATEGORICAL_PALETTE = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767'  // red
];

// Reserved status palette (dataviz skill references/palette.md) — used only
// for payment state, always paired with an icon + text label, never for a
// data series.
export const STATUS_GOOD = '#0ca30c';     // successful
export const STATUS_WARNING = '#fab219';  // pending
export const STATUS_SERIOUS = '#ec835a';  // cancelled
export const STATUS_CRITICAL = '#d03b3b'; // failed

// Four-series order for the visitor trend chart (first four categorical
// slots, validated on CHART_SURFACE in dark mode: all six checks pass).
export const VISITOR_SERIES_COLORS = CATEGORICAL_PALETTE.slice(0, 4);
