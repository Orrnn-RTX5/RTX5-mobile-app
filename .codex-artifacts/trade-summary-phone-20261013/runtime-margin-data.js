(function () {
  var result = { live: [], trading: [], cached: [] };
  function metrics(s) {
    return s && { margin:s.margin, usedMargin:s.usedMargin, marginLevel:s.marginLevel, margin_level:s.margin_level, equity:s.equity, freeMargin:s.freeMargin, margin_free:s.margin_free, staleMetrics:s.staleMetrics, metricFlags:s.metricFlags, staleMetricFlags:s.staleMetricFlags };
  }
  globalThis.__r.getModules().forEach(function (m) {
    if (!m.isInitialized) return;
    var e = m.publicModule && m.publicModule.exports;
    if (!e) return;
    if (e.useLiveAccountState && e.useLiveAccountState.getState) result.live.push(metrics(e.useLiveAccountState.getState()));
    if (e.useTradingState && e.useTradingState.getState) result.trading.push(metrics(e.useTradingState.getState().account));
    var client = e.appQueryClient || e.queryClient;
    if (client && client.getQueryCache) {
      client.getQueryCache().getAll().forEach(function (q) {
        if (q.queryKey && q.queryKey[0] === 'accountSummary') result.cached.push({status:q.state.status, updatedAt:q.state.dataUpdatedAt, metrics:metrics(q.state.data)});
      });
    }
  });
  return JSON.stringify(result);
})()
