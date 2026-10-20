const Ewelink = require('ewelink-api');
const { config, hasEwelinkConfiguration } = require('./config');

// eWeLink accounts are bound to the region they were created in. A login sent to the
// wrong region is answered with this code and the right region in `data.region`.
const WRONG_REGION_ERROR = 10004;
// Returned by the cloud when the access token is missing, expired or revoked.
const INVALID_TOKEN_ERROR = 401;

class EwelinkConfigurationError extends Error {}
class EwelinkAuthenticationError extends Error {}
class EwelinkRequestError extends Error {
  constructor(code, message) {
    super(`eWeLink error ${code}: ${message || 'no message'}`);
    this.code = code;
  }
}

function normalisePowerState(device) {
  const value = device?.params?.switch ?? device?.switch ?? device?.params?.state;
  return String(value).toLowerCase() === 'on' ? 'ON' : 'OFF';
}

function normaliseDevice(device) {
  if (!device) return null;
  return {
    id: device.deviceid || device.id,
    name: device.name || 'Unnamed device',
    type: device.productModel || device.extra?.extra?.uiid || device.extra?.uiid || device.uiid || 'Unknown model',
    online: Boolean(device.online),
    state: normalisePowerState(device),
    // These non-sensitive fields can help identify unusual devices in this PoC.
    uiid: device.uiid ?? device.extra?.uiid,
    firmwareVersion: device.params?.fwVersion,
  };
}

// The eWeLink v2 "thing" list wraps each device as { itemType, itemData, index }.
// ewelink-api's getDevices() returns that list as-is, while getDevice() already unwraps it.
function unwrapThing(item) {
  return item?.itemData ?? item;
}

function throwForLibraryError(result) {
  if (result?.error) {
    throw new EwelinkRequestError(result.error, result.msg);
  }
  return result;
}

class EwelinkService {
  constructor() {
    this.client = null;
    this.region = config.ewelink.region;
    this.loginInFlight = null;
  }

  ensureConfigured() {
    if (!hasEwelinkConfiguration()) {
      throw new EwelinkConfigurationError('eWeLink configuration is incomplete');
    }
  }

  getClient() {
    this.ensureConfigured();
    if (!this.client) {
      this.client = new Ewelink({
        email: config.ewelink.username,
        password: config.ewelink.password,
        region: this.region,
      });
    }
    return this.client;
  }

  // The dashboard calls /api/health and /api/devices at the same time: share one login
  // between concurrent callers instead of hitting the eWeLink login endpoint twice.
  authenticate() {
    if (!this.loginInFlight) {
      this.loginInFlight = this.login().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  async login() {
    try {
      // getCredentials is the package's authentication operation. Do not return it.
      let credentials = await this.getClient().getCredentials();

      const expectedRegion = credentials?.data?.region;
      if (credentials?.error === WRONG_REGION_ERROR && expectedRegion && expectedRegion !== this.region) {
        console.warn(`eWeLink account belongs to region "${expectedRegion}", not "${this.region}"; retrying there`);
        this.region = expectedRegion;
        this.client = null;
        credentials = await this.getClient().getCredentials();
      }

      throwForLibraryError(credentials);
      if (!credentials?.data?.at || !credentials?.data?.user?.apikey) {
        throw new EwelinkAuthenticationError('eWeLink did not return usable credentials');
      }
      return true;
    } catch (error) {
      this.client = null;
      if (error instanceof EwelinkConfigurationError) throw error;
      // Keep the real reason (wrong password, unknown account, region...) in the server log only.
      console.error('eWeLink authentication failed:', error.message);
      throw new EwelinkAuthenticationError('Unable to authenticate with eWeLink');
    }
  }

  async getAuthenticatedClient() {
    if (!this.getClient().at) {
      await this.authenticate();
    }
    return this.client;
  }

  async request(operation) {
    const result = await operation(await this.getAuthenticatedClient());
    if (result?.error === INVALID_TOKEN_ERROR) {
      // Force a fresh login on the next request instead of reusing a dead token.
      this.client = null;
    }
    return throwForLibraryError(result);
  }

  async getDevices() {
    const things = await this.request((client) => client.getDevices());
    return (Array.isArray(things) ? things : []).map((item) => normaliseDevice(unwrapThing(item)));
  }

  async getDevice(deviceId) {
    const device = await this.request((client) => client.getDevice(deviceId));
    return normaliseDevice(unwrapThing(device));
  }

  async setPower(deviceId, state) {
    await this.request((client) => client.setDevicePowerState(deviceId, state));
    return this.getDevice(deviceId);
  }

  turnOn(deviceId) { return this.setPower(deviceId, 'on'); }
  turnOff(deviceId) { return this.setPower(deviceId, 'off'); }
}

module.exports = { EwelinkService, EwelinkConfigurationError, EwelinkAuthenticationError, EwelinkRequestError };
