const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Ewelink = require('ewelink-api');
const { loadService, makeThing, stubLibrary, thingListResponse, captureConsole } = require('./helpers');

const APP_ID = 'test-app-id';
const APP_SECRET = 'test-app-secret';
const REDIRECT_URL = 'http://localhost:3000/api/oauth/callback';

// Scripts the eWeLink OAuth endpoints, which src/oauth.js reaches through global fetch.
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
    calls.push(call);
    return Response.json(await handler(call));
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe('eWeLink OAuth', () => {
  let tokenFile;
  let restore = () => {};
  let restoreFetch = () => {};
  let errorLog;

  const loadOAuthService = () => loadService({
    EWELINK_APP_ID: APP_ID,
    EWELINK_APP_SECRET: APP_SECRET,
    EWELINK_OAUTH_REDIRECT_URL: REDIRECT_URL,
    EWELINK_TOKEN_FILE: tokenFile,
  });
  const writeTokens = (tokens) => fs.writeFileSync(tokenFile, JSON.stringify(tokens));
  const readTokens = () => JSON.parse(fs.readFileSync(tokenFile, 'utf8'));

  beforeEach(() => {
    tokenFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ewelink-')), 'token.json');
    errorLog = captureConsole('error');
  });

  afterEach(() => {
    restore();
    restoreFetch();
    restore = () => {};
    restoreFetch = () => {};
    errorLog.restore();
    fs.rmSync(path.dirname(tokenFile), { recursive: true, force: true });
  });

  test('without a stored token, every call asks for authorization and nothing reaches eWeLink', async () => {
    const { EwelinkService, EwelinkAuthorizationRequiredError } = loadOAuthService();
    let networkCalls = 0;
    restore = stubLibrary(Ewelink, {
      login: () => { networkCalls += 1; },
      request: () => { networkCalls += 1; },
    });

    const service = new EwelinkService();
    await assert.rejects(service.authenticate(), EwelinkAuthorizationRequiredError);
    await assert.rejects(service.getDevices(), EwelinkAuthorizationRequiredError);
    assert.equal(networkCalls, 0);
  });

  test('the login URL is signed with the app secret and carries a one-time state', () => {
    const { EwelinkService } = loadOAuthService();
    const { sign } = require('../src/oauth');

    const url = new URL(new EwelinkService().createAuthorizationUrl());

    assert.equal(url.origin + url.pathname, 'https://c2ccdn.coolkit.cc/oauth/index.html');
    assert.equal(url.searchParams.get('clientId'), APP_ID);
    assert.equal(url.searchParams.get('redirectUrl'), REDIRECT_URL);
    assert.equal(url.searchParams.get('authorization'), sign(APP_SECRET, `${APP_ID}_${url.searchParams.get('seq')}`));
    assert.ok(url.searchParams.get('state'));
  });

  test('completing authorization exchanges the code, stores the tokens and uses them for device calls', async () => {
    const { EwelinkService } = loadOAuthService();
    const { sign } = require('../src/oauth');
    const fetchStub = stubFetch(() => ({ error: 0, data: { accessToken: 'at-1', refreshToken: 'rt-1', region: 'eu' } }));
    restoreFetch = fetchStub.restore;
    const clients = [];
    restore = stubLibrary(Ewelink, {
      login: () => { throw new Error('password login must not be used'); },
      request: (_options, client) => { clients.push(client); return thingListResponse(makeThing()); },
    });

    const service = new EwelinkService();
    const state = new URL(service.createAuthorizationUrl()).searchParams.get('state');
    await service.completeAuthorization({ code: 'code-1', region: 'eu', state });

    const [call] = fetchStub.calls;
    assert.equal(call.url, 'https://eu-apia.coolkit.cc/v2/user/oauth/token');
    assert.deepEqual(call.body, { code: 'code-1', redirectUrl: REDIRECT_URL, grantType: 'authorization_code' });
    assert.equal(call.headers['X-CK-Appid'], APP_ID);
    assert.equal(call.headers.Authorization, `Sign ${sign(APP_SECRET, JSON.stringify(call.body))}`);
    assert.deepEqual(readTokens(), { at: 'at-1', rt: 'rt-1', region: 'eu' });

    assert.equal(await service.authenticate(), true);
    assert.equal((await service.getDevices()).length, 1);
    assert.equal(clients[0].at, 'at-1');
    assert.equal(clients[0].region, 'eu');
    assert.equal(clients[0].APP_ID, APP_ID);
  });

  test('a stored token is picked up after a restart', async () => {
    writeTokens({ at: 'at-1', rt: 'rt-1', region: 'us' });
    const { EwelinkService } = loadOAuthService();
    restore = stubLibrary(Ewelink, { login: () => {}, request: () => thingListResponse(makeThing()) });

    assert.equal((await new EwelinkService().getDevices()).length, 1);
  });

  test('unknown, reused or tampered authorization callbacks are refused', async () => {
    const { EwelinkService, EwelinkAuthorizationStateError } = loadOAuthService();
    const fetchStub = stubFetch(() => ({ error: 0, data: { accessToken: 'at-1', refreshToken: 'rt-1' } }));
    restoreFetch = fetchStub.restore;
    const service = new EwelinkService();
    const state = new URL(service.createAuthorizationUrl()).searchParams.get('state');

    await assert.rejects(service.completeAuthorization({ code: 'c', region: 'eu', state: 'forged' }), EwelinkAuthorizationStateError);
    // The state is single-use, even when the first attempt was rejected for another reason.
    const other = new URL(service.createAuthorizationUrl()).searchParams.get('state');
    await assert.rejects(service.completeAuthorization({ code: 'c', region: 'evil.example.com/x', state: other }), EwelinkAuthorizationStateError);
    await assert.rejects(service.completeAuthorization({ code: 'c', region: 'eu', state: other }), EwelinkAuthorizationStateError);

    await service.completeAuthorization({ code: 'c', region: 'eu', state });
    await assert.rejects(service.completeAuthorization({ code: 'c', region: 'eu', state }), EwelinkAuthorizationStateError);
    assert.equal(fetchStub.calls.length, 1);
  });

  test('a refused code exchange is logged with the reason and reported generically', async () => {
    const { EwelinkService, EwelinkAuthenticationError } = loadOAuthService();
    restoreFetch = stubFetch(() => ({ error: 406, msg: 'incorrect redirectUrl' })).restore;
    const service = new EwelinkService();
    const state = new URL(service.createAuthorizationUrl()).searchParams.get('state');

    await assert.rejects(service.completeAuthorization({ code: 'c', region: 'eu', state }), EwelinkAuthenticationError);
    assert.match(errorLog.calls.join('\n'), /eWeLink error 406: incorrect redirectUrl/);
    assert.equal(fs.existsSync(tokenFile), false);
  });

  test('an expired access token is refreshed once and the request retried', async () => {
    writeTokens({ at: 'at-old', rt: 'rt-old', region: 'eu' });
    const { EwelinkService } = loadOAuthService();
    const fetchStub = stubFetch(() => ({ error: 0, data: { at: 'at-new', rt: 'rt-new' } }));
    restoreFetch = fetchStub.restore;
    const tokensSeen = [];
    restore = stubLibrary(Ewelink, {
      login: () => {},
      request: (_options, client) => {
        tokensSeen.push(client.at);
        return client.at === 'at-old' ? { error: 402, msg: 'access token expired' } : thingListResponse(makeThing());
      },
    });

    const service = new EwelinkService();
    const [first, second] = await Promise.all([service.getDevices(), service.getDevices()]);

    assert.equal(first.length + second.length, 2);
    assert.equal(fetchStub.calls.length, 1, 'concurrent requests share one refresh');
    assert.equal(fetchStub.calls[0].url, 'https://eu-apia.coolkit.cc/v2/user/refresh');
    assert.deepEqual(fetchStub.calls[0].body, { rt: 'rt-old' });
    assert.deepEqual(readTokens(), { at: 'at-new', rt: 'rt-new', region: 'eu' });
    assert.deepEqual(tokensSeen, ['at-old', 'at-old', 'at-new', 'at-new']);
  });

  test('a refused refresh drops the tokens so the app can be authorized again', async () => {
    writeTokens({ at: 'at-old', rt: 'rt-old', region: 'eu' });
    const { EwelinkService, EwelinkAuthorizationRequiredError } = loadOAuthService();
    restoreFetch = stubFetch(() => ({ error: 401, msg: 'refresh token expired' })).restore;
    restore = stubLibrary(Ewelink, { login: () => {}, request: () => ({ error: 401, msg: 'token invalid' }) });

    const service = new EwelinkService();
    await assert.rejects(service.getDevices(), EwelinkAuthorizationRequiredError);
    assert.equal(fs.existsSync(tokenFile), false);
    await assert.rejects(service.authenticate(), EwelinkAuthorizationRequiredError);
  });

  test('a network failure during refresh keeps the tokens', async () => {
    writeTokens({ at: 'at-old', rt: 'rt-old', region: 'eu' });
    const { EwelinkService } = loadOAuthService();
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    restoreFetch = () => { globalThis.fetch = original; };
    restore = stubLibrary(Ewelink, { login: () => {}, request: () => ({ error: 401, msg: 'token invalid' }) });

    await assert.rejects(new EwelinkService().getDevices(), /fetch failed/);
    assert.deepEqual(readTokens(), { at: 'at-old', rt: 'rt-old', region: 'eu' });
  });

  test('the OAuth flow is unavailable in password mode', () => {
    const { EwelinkService, EwelinkConfigurationError } = loadService();
    assert.throws(() => new EwelinkService().createAuthorizationUrl(), EwelinkConfigurationError);
  });
});
