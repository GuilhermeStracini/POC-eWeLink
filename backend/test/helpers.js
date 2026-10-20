const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const ENV_KEYS = ['EWELINK_REGION', 'EWELINK_USERNAME', 'EWELINK_PASSWORD', 'PORT'];

// config.js reads process.env when it is first required, so every test that
// needs a different configuration loads a fresh copy of the service modules.
function loadService(env = { EWELINK_REGION: 'eu', EWELINK_USERNAME: 'user@example.com', EWELINK_PASSWORD: 'secret' }) {
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  for (const file of ['config.js', 'ewelink.js', 'app.js', 'routes/devices.js']) {
    delete require.cache[require.resolve(path.join(SRC, file))];
  }
  return require(path.join(SRC, 'ewelink.js'));
}

// A realistic eWeLink v2 "thing", as returned inside thingList[].itemData.
function makeThing(overrides = {}) {
  return {
    deviceid: '10012abcde',
    name: 'Kitchen light',
    online: true,
    extra: { uiid: 1 },
    productModel: 'BASICR2',
    params: { switch: 'on', fwVersion: '3.7.6' },
    ...overrides,
  };
}

// Replaces the network layer of ewelink-api with scripted responses.
// `login` is called for every /user/login attempt, `request` for everything else.
function stubLibrary(Ewelink, { login, request }) {
  const original = {
    getCredentials: Ewelink.prototype.getCredentials,
    makeRequest: Ewelink.prototype.makeRequest,
  };
  Ewelink.prototype.getCredentials = async function getCredentials() {
    const response = await login(this);
    this.at = response?.data?.at ?? '';
    this.apiKey = response?.data?.user?.apikey ?? '';
    return response;
  };
  Ewelink.prototype.makeRequest = async function makeRequest(options) {
    if (!this.at) await this.getCredentials();
    return request(options, this);
  };
  return () => {
    Ewelink.prototype.getCredentials = original.getCredentials;
    Ewelink.prototype.makeRequest = original.makeRequest;
  };
}

const okLogin = (region = 'eu') => ({ error: 0, data: { at: 'deadbeef', user: { apikey: 'api-key' }, region } });
const thingListResponse = (...things) => ({
  error: 0,
  data: { thingList: things.map((itemData, index) => ({ itemType: 1, itemData, index })), total: things.length },
});

// Keeps the test output clean while still letting a test assert on what was logged.
function captureConsole(method) {
  const calls = [];
  const original = console[method];
  console[method] = (...args) => calls.push(args.join(' '));
  return { calls, restore: () => { console[method] = original; } };
}

module.exports = { loadService, makeThing, stubLibrary, okLogin, thingListResponse, captureConsole };
