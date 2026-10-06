// Compatibility entrypoint: current presentation suite also checks full search,
// scoped pagination and totals. Avoid maintaining a stale row-per-location test.
require('./warehouse-presentation-targeted.cjs');
