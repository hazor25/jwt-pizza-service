const config = require('./config.js');
const SENSITIVE_KEYS = ['password', 'token', 'apikey', 'authorization', 'jwt', 'secret'];
const { AsyncLocalStorage } = require('async_hooks');

class Logger {
  context = new AsyncLocalStorage();

  currentUserId() {
    const store = this.context.getStore();
    return store ? store.userId : null;
  }

  httpLogger = (req, res, next) => {
    const originalSend = res.send;
    res.send = (resBody) => {
      this.log(this.statusToLogLevel(res.statusCode), 'http', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        hasAuthHeader: !!req.headers.authorization,
        userId: req.user ? req.user.id : null,
        reqBody: req.body,
        resBody,
      });
      res.send = originalSend;
      return res.send(resBody);
    };
    this.context.run({ userId: req.user ? req.user.id : null }, next);
  };

  dbLogger(sql, params) {
    const { query, safeParams } = this.sanitizeSql(sql, params);
    this.log('info', 'db', { query, params: safeParams, userId: this.currentUserId() });
  }

  sanitizeSql(sql, params) {
    const sensitive = (name) => SENSITIVE_KEYS.includes(String(name).toLowerCase());

    const query = sql.replace(/(password|token)\s*=\s*'[^']*'/gi, "$1='*****'");

    if (!Array.isArray(params)) return { query, safeParams: params };

    let names = [];
    const insert = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]*)\)/i);
    if (insert) {
      names = insert[1].split(',').map((c) => c.trim());
    } else {
      names = [...sql.matchAll(/(\w+)\s*(?:=|LIKE)\s*\?/gi)].map((m) => m[1]);
    }
    const safeParams = params.map((p, i) => (sensitive(names[i]) ? '*****' : p));
    return { query, safeParams };
  }

  factoryLogger(reqBody, resBody) {
    this.log('info', 'factory', { userId: this.currentUserId(), reqBody, resBody });
  }

  unhandledErrorLogger(err) {
    this.log('error', 'exception', { message: err.message, stack: err.stack });
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level, type };
    const values = [this.nowString(), this.sanitize(logData)];
    this.sendLogToGrafana({ streams: [{ stream: labels, values: [values] }] });
  }

  nowString() {
    return (BigInt(Date.now()) * 1000000n).toString();
  }

  
  sanitize(data) {
    const mask = (value) => {
      if (typeof value === 'string') {
        try {
          return mask(JSON.parse(value));
        } catch {
          return value.replace(/\\?"password\\?":\s*\\?"[^"\\]*\\?"/gi, '"password":"*****"');
        }
      }
      if (Array.isArray(value)) return value.map(mask);
      if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
          out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '*****' : mask(v);
        }
        return out;
      }
      return value;
    };
    return JSON.stringify(mask(data));
  }

  sendLogToGrafana(event) {
    fetch(config.logging.endpointUrl, {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
      },
    })
      .then((res) => {
        if (!res.ok) console.log('Failed to send log to Grafana');
      })
      .catch((err) => console.log('Error sending log to Grafana', err.message));
  }
}

module.exports = new Logger();