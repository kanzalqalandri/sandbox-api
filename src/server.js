'use strict';

// A deliberately tiny stand-in for tenant-api. No dependencies, so the image
// builds without a registry round-trip and CI stays fast.
//
// Two things here exist to make the platform testable rather than to model a
// real API:
//   FAIL_READINESS=true   -> readiness returns 503, so the CD health gate fails
//                            and auto-rollback can be exercised on demand.
//   STARTUP_DELAY_MS=n    -> delays readiness, to exercise the gate's timeout.

const http = require('node:http');

const PORT = Number(process.env.PORT || 5000);
const URL_PREFIX = process.env.URL_PREFIX || '/api';

const identity = {
  component: 'sandbox-api',
  version: process.env.APP_VERSION || 'dev',
  instance: process.env.INSTANCE || 'unknown',
  cluster: process.env.CLUSTER || 'unknown',
  environment: process.env.ENVIRONMENT || 'unknown',
  stack: process.env.STACK || 'unknown',
};

// Secrets arrive as env vars projected from an ExternalSecret. Report only
// whether each one is present — never the value, not even in a sandbox.
const SECRET_ENVS = ['DEMO_API_KEY', 'DEMO_DB_URI'];
const secretStatus = () =>
  Object.fromEntries(SECRET_ENVS.map((k) => [k, process.env[k] ? 'set' : 'missing']));

const failReadiness = process.env.FAIL_READINESS === 'true';
const startupDelayMs = Number(process.env.STARTUP_DELAY_MS || 0);
const startedAt = Date.now();
const warmedUp = () => Date.now() - startedAt >= startupDelayMs;

const send = (res, status, body) => {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  // Tolerate being mounted under a path prefix by the ingress.
  const path = new URL(req.url, 'http://localhost').pathname.replace(
    new RegExp(`^${URL_PREFIX}`),
    ''
  ) || '/';

  switch (path) {
    case '/health-check/liveness':
      return send(res, 200, { status: 'ok' });

    case '/health-check/readiness':
      if (failReadiness) return send(res, 503, { status: 'failing', reason: 'FAIL_READINESS' });
      if (!warmedUp()) return send(res, 503, { status: 'starting' });
      return send(res, 200, { status: 'ok' });

    case '/version':
      return send(res, 200, identity);

    case '/':
      return send(res, 200, { ...identity, secrets: secretStatus() });

    default:
      return send(res, 404, { error: 'not found', path });
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'listening', port: PORT, ...identity }));
});

// Graceful shutdown, so rolling updates and rollbacks don't drop in-flight
// requests — which is what makes the health gate's verdict meaningful.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(JSON.stringify({ msg: 'shutting down', signal }));
    server.close(() => process.exit(0));
  });
}
