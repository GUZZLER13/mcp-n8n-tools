// Isolated on-demand cache. It never schedules periodic work or touches the
// gateway hot path. Stale data is explicitly labelled, never silently fresh.
export function createInventoryCache(load, {
  ttlMs=15*60*1000, retryMs=60*1000, now=()=>Date.now()
}={}) {
  if (typeof load!=='function' || ttlMs<1000 || retryMs<1000) throw Error('INVALID_CACHE_OPTIONS');
  let snapshot=null, expiresAt=0, retryAfter=0, pending=null;
  let attempts=0;
  function startRefresh() {
    if (pending) return pending;
    retryAfter=now()+retryMs; attempts++;
    const run=Promise.resolve().then(load).then(data=>{
      if (!data || !Array.isArray(data.domains) || !Array.isArray(data.routes))
        throw Error('INVALID_INVENTORY');
      snapshot=data; expiresAt=now()+ttlMs;
      return data;
    });
    pending=run.finally(()=>{pending=null;});
    // Always mark failure handled even for fire-and-forget background refresh.
    pending.catch(()=>{});
    return pending;
  }
  async function get() {
    if (snapshot) {
      if (now()>=expiresAt && now()>=retryAfter && !pending) {
        // Asynchronous stale-while-revalidate; never wait while cached.
        startRefresh();
      }
      return {inventory:snapshot, freshness:now()<expiresAt?'fresh':'stale', cached:true};
    }
    if (pending) {
      return {inventory:await pending,freshness:'fresh',cached:false};
    }
    if (now()<retryAfter) throw Error('KNOWLEDGE_RETRY_BACKOFF');
    return {inventory:await startRefresh(),freshness:'fresh',cached:false};
  }
  return {get, stats:()=>({attempts,hasSnapshot:!!snapshot,refreshing:!!pending})};
}
