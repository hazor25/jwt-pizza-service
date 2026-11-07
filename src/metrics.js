const config = require('./config.js');
const os = require('os');
 
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
 
class Metrics {
  constructor() {
    // Cumulative counters (Grafana computes per-minute with rate/increase)
    this.requests = { total: 0, GET: 0, POST: 0, PUT: 0, DELETE: 0 };
    this.auth = { success: 0, failure: 0 };
    this.pizza = { sold: 0, failures: 0, revenue: 0 };
 
    // Latency accumulators, reset every reporting period (reported as average ms)
    this.endpointLatency = { totalMs: 0, count: 0 };
    this.pizzaLatency = { totalMs: 0, count: 0 };
 
    // token -> last seen timestamp
    this.activeUsers = new Map();
  }
 
  
  requestTracker = (req, res, next) => {
    const start = Date.now();
    const method = req.method;
 
    this.requests.total++;
    if (this.requests[method] !== undefined) this.requests[method]++;
 
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) this.activeUsers.set(token, Date.now());
 
    res.on('finish', () => {
      this.endpointLatency.totalMs += Date.now() - start;
      this.endpointLatency.count++;
    });
 
    next();
  };
 
  authAttempt(success) {
    if (success) this.auth.success++;
    else this.auth.failure++;
  }
 
  userLoggedOut(token) {
    this.activeUsers.delete(token);
  }
 
  pizzaPurchase(success, latencyMs, revenue, pizzaCount = 1) {
    if (success) {
      this.pizza.sold += pizzaCount;
      this.pizza.revenue += revenue;
    } else {
      this.pizza.failures++;
    }
    this.pizzaLatency.totalMs += latencyMs;
    this.pizzaLatency.count++;
  }
 
 
  start(periodMs = 10000) {
    const timer = setInterval(() => {
      try {
        this.sendToGrafana(this.buildMetrics());
      } catch (error) {
        console.log('Error sending metrics', error);
      }
    }, periodMs);
    timer.unref();
  }
 
  getCpuUsagePercentage() {
    return Number(((os.loadavg()[0] / os.cpus().length) * 100).toFixed(2));
  }
 
  getMemoryUsagePercentage() {
    const total = os.totalmem();
    return Number((((total - os.freemem()) / total) * 100).toFixed(2));
  }
 
  getActiveUserCount() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    for (const [token, seen] of this.activeUsers) {
      if (seen < cutoff) this.activeUsers.delete(token);
    }
    return this.activeUsers.size;
  }
 
  buildMetrics() {
    const avg = (l) => (l.count ? l.totalMs / l.count : 0);
    const list = [];
 
    list.push(this.sum('http_requests', '1', this.requests.total, { method: 'all' }));
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
      list.push(this.sum('http_requests', '1', this.requests[m], { method: m }));
    }
 
    list.push(this.gauge('active_users', '1', this.getActiveUserCount()));
    list.push(this.sum('auth_attempts', '1', this.auth.success, { result: 'success' }));
    list.push(this.sum('auth_attempts', '1', this.auth.failure, { result: 'failure' }));
 
   
    list.push(this.gauge('cpu_usage', '%', this.getCpuUsagePercentage()));
    list.push(this.gauge('memory_usage', '%', this.getMemoryUsagePercentage()));
 
   
    list.push(this.sum('pizzas_sold', '1', this.pizza.sold));
    list.push(this.sum('pizza_failures', '1', this.pizza.failures));
    list.push(this.sum('pizza_revenue', '1', this.pizza.revenue));
 
   
    list.push(this.gauge('endpoint_latency', 'ms', avg(this.endpointLatency)));
    list.push(this.gauge('pizza_latency', 'ms', avg(this.pizzaLatency)));
    this.endpointLatency = { totalMs: 0, count: 0 };
    this.pizzaLatency = { totalMs: 0, count: 0 };
 
    return list;
  }
 
  
  attrs(extra = {}) {
    const all = { source: config.metrics.source, ...extra };
    return Object.entries(all).map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
  }
 
  point(value, extra) {
    const p = {
      timeUnixNano: (BigInt(Date.now()) * 1000000n).toString(),
      attributes: this.attrs(extra),
    };
    if (Number.isInteger(value)) p.asInt = value;
    else p.asDouble = value;
    return p;
  }
 
  sum(name, unit, value, extra) {
    return {
      name,
      unit,
      sum: {
        dataPoints: [this.point(value, extra)],
        aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
        isMonotonic: true,
      },
    };
  }
 
  gauge(name, unit, value, extra) {
    return { name, unit, gauge: { dataPoints: [this.point(value, extra)] } };
  }
 
  sendToGrafana(metricList) {
    const body = JSON.stringify({
      resourceMetrics: [{ scopeMetrics: [{ metrics: metricList }] }],
    });
    const auth = Buffer.from(`${config.metrics.accountId}:${config.metrics.apiKey}`).toString('base64');
 
    fetch(config.metrics.endpointUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    })
      .then((response) => {
        if (!response.ok) {
          response.text().then((t) => console.error(`Failed to push metrics: ${response.status} ${t}`));
        }
      })
      .catch((error) => console.error('Error pushing metrics:', error));
  }
}
 
const metrics = new Metrics();
module.exports = metrics;