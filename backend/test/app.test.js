const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadService, captureConsole } = require('./helpers');

const {
  EwelinkConfigurationError,
  EwelinkAuthenticationError,
  EwelinkAuthorizationRequiredError,
  EwelinkAuthorizationStateError,
  EwelinkRequestError,
} = loadService();
const { createApp } = require('../src/app');

const kitchen = { id: '10012abcde', name: 'Kitchen light', type: 'BASICR2', online: true, state: 'ON' };
const hall = { id: '10012fffff', name: 'Hall', type: 'BASICR2', online: false, state: 'OFF' };

// A scripted stand-in for EwelinkService: each test sets the behaviour it needs.
const service = {
  reset() {
    this.authenticate = async () => true;
    this.getDevices = async () => [kitchen, hall];
    this.getDevice = async (id) => [kitchen, hall].find((device) => device.id === id) ?? null;
    this.calls = [];
    this.turnOn = async (id) => { this.calls.push(['on', id]); return { ...kitchen, state: 'ON' }; };
    this.turnOff = async (id) => { this.calls.push(['off', id]); return { ...kitchen, state: 'OFF' }; };
    this.createAuthorizationUrl = () => 'https://c2ccdn.coolkit.cc/oauth/index.html?state=abc';
    this.completeAuthorization = async (params) => { this.calls.push(['authorize', params]); };
  },
};

describe('HTTP API', () => {
  let server;
  let baseUrl;
  let errorLog;

  before(async () => {
    service.reset();
    server = createApp(service, { frontendUrl: 'http://localhost:5173' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    service.reset();
    errorLog?.restore();
    errorLog = captureConsole('error');
  });

  const call = async (path, options) => {
    const response = await fetch(baseUrl + path, options);
    return { status: response.status, body: await response.json() };
  };

  test('GET /api/health reports a working eWeLink connection', async () => {
    assert.deepEqual(await call('/api/health'), { status: 200, body: { status: 'ok', ewelink: 'connected' } });
  });

  test('GET /api/health is 503 when configuration is missing and 502 when login fails', async () => {
    service.authenticate = async () => { throw new EwelinkConfigurationError('incomplete'); };
    assert.equal((await call('/api/health')).status, 503);

    service.authenticate = async () => { throw new EwelinkAuthenticationError('nope'); };
    const failed = await call('/api/health');
    assert.equal(failed.status, 502);
    assert.deepEqual(failed.body, { status: 'unavailable', error: 'Unable to authenticate with eWeLink' });
  });

  test('GET /api/devices lists devices', async () => {
    assert.deepEqual(await call('/api/devices'), { status: 200, body: { devices: [kitchen, hall] } });
  });

  test('GET /api/devices/:id returns one device or 404', async () => {
    assert.deepEqual(await call('/api/devices/10012abcde'), { status: 200, body: { device: kitchen } });
    assert.deepEqual(await call('/api/devices/10012000000'), { status: 404, body: { error: 'Device not found' } });
  });

  test('device ids are validated before reaching eWeLink', async () => {
    service.getDevice = async () => { throw new Error('should not be called'); };
    assert.deepEqual(await call('/api/devices/no'), { status: 400, body: { error: 'Invalid device ID' } });
    assert.equal((await call('/api/devices/bad%20id/on', { method: 'POST' })).status, 400);
  });

  test('POST /api/devices/:id/on and /off switch an online device', async () => {
    assert.deepEqual(await call('/api/devices/10012abcde/off', { method: 'POST' }), {
      status: 200,
      body: { success: true, device: { ...kitchen, state: 'OFF' } },
    });
    assert.deepEqual(await call('/api/devices/10012abcde/on', { method: 'POST' }), {
      status: 200,
      body: { success: true, device: { ...kitchen, state: 'ON' } },
    });
    assert.deepEqual(service.calls, [['off', '10012abcde'], ['on', '10012abcde']]);
  });

  test('switching refuses offline and unknown devices', async () => {
    assert.deepEqual(await call('/api/devices/10012fffff/on', { method: 'POST' }), { status: 409, body: { error: 'Device is offline' } });
    assert.deepEqual(await call('/api/devices/10012000000/on', { method: 'POST' }), { status: 404, body: { error: 'Device not found' } });
    assert.deepEqual(service.calls, []);
  });

  test('authentication problems inside a device call are 503, other eWeLink failures 502', async () => {
    service.getDevices = async () => { throw new EwelinkAuthenticationError('nope'); };
    assert.deepEqual(await call('/api/devices'), { status: 503, body: { error: 'Unable to authenticate with eWeLink' } });

    service.getDevices = async () => { throw new EwelinkRequestError(503, 'Service Temporarily Unavailable'); };
    assert.deepEqual(await call('/api/devices'), { status: 502, body: { error: 'eWeLink request failed' } });
    assert.match(errorLog.calls.join('\n'), /eWeLink error 503: Service Temporarily Unavailable/);
  });

  test('an unauthorized OAuth app is reported with the URL that starts authorization', async () => {
    const required = { error: 'eWeLink authorization required', authorizeUrl: '/api/oauth/login' };
    service.authenticate = async () => { throw new EwelinkAuthorizationRequiredError('required'); };
    service.getDevices = service.authenticate;

    assert.deepEqual(await call('/api/health'), { status: 503, body: { status: 'unavailable', ...required } });
    assert.deepEqual(await call('/api/devices'), { status: 503, body: required });
  });

  test('GET /api/oauth/login redirects to the eWeLink authorization page', async () => {
    const response = await fetch(`${baseUrl}/api/oauth/login`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://c2ccdn.coolkit.cc/oauth/index.html?state=abc');

    service.createAuthorizationUrl = () => { throw new EwelinkConfigurationError('no app'); };
    assert.equal((await call('/api/oauth/login')).status, 503);
  });

  test('GET /api/oauth/callback completes authorization and returns to the dashboard', async () => {
    const response = await fetch(`${baseUrl}/api/oauth/callback?code=c1&region=eu&state=abc`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'http://localhost:5173');
    assert.deepEqual(service.calls, [['authorize', { code: 'c1', region: 'eu', state: 'abc' }]]);
  });

  test('GET /api/oauth/callback rejects a bad state with 400 and a failed exchange with 503', async () => {
    service.completeAuthorization = async () => { throw new EwelinkAuthorizationStateError('Invalid or expired authorization request'); };
    assert.deepEqual(await call('/api/oauth/callback?code=c&region=eu&state=x'), {
      status: 400,
      body: { error: 'Invalid or expired authorization request' },
    });

    service.completeAuthorization = async () => { throw new EwelinkAuthenticationError('nope'); };
    assert.equal((await call('/api/oauth/callback?code=c&region=eu&state=x')).status, 503);
  });

  test('GET /openapi.json serves the API description', async () => {
    const { status, body } = await call('/openapi.json');
    assert.equal(status, 200);
    assert.ok(body.paths['/api/devices']);
  });
});
