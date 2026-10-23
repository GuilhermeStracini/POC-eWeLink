const crypto = require('node:crypto');
const Ewelink = require('ewelink-api');
const { config, hasEwelinkConfiguration, usesOAuth } = require('./config');
const { createLoginUrl, exchangeCode, refreshTokens } = require('./oauth');
const { loadTokens, saveTokens, clearTokens } = require('./tokenStore');

// eWeLink accounts are bound to the region they were created in. A login sent to the
// wrong region is answered with this code and the right region in `data.region`.
const WRONG_REGION_ERROR = 10004;
// Returned by the cloud when the access token is missing or revoked (401) or expired (402).
const TOKEN_ERRORS = new Set([401, 402]);
// The developer app's role does not include the requested API (e.g. the OTA query).
const PATH_NOT_ALLOWED_ERROR = 407;
// The region ends up in the API hostname, so only the known ones are accepted.
const REGIONS = new Set(['cn', 'as', 'us', 'eu']);
const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

class EwelinkConfigurationError extends Error {}
class EwelinkAuthenticationError extends Error {}
// OAuth mode without a usable token: someone has to authorize the app in a browser.
class EwelinkAuthorizationRequiredError extends EwelinkAuthenticationError {}
class EwelinkAuthorizationStateError extends Error {}
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

// The OTA query wants the hardware model (e.g. PSF-BD1-GL), not the product name.
// v2 things keep it in extra.model; older payloads nest it one level deeper.
function firmwareQuery(device) {
  const model = device?.extra?.model ?? device?.extra?.extra?.model;
  const version = device?.params?.fwVersion;
  return model && version ? { deviceid: device.deviceid, model, version } : null;
}

// otaInfoList only carries a version for devices that have a newer firmware.
function withFirmwareUpdates(devices, otaInfoList) {
  const latest = new Map((Array.isArray(otaInfoList) ? otaInfoList : []).map((info) => [info.deviceid, info.version]));
  return devices.map((device) => {
    const version = latest.get(device.id);
    if (!version || version === device.firmwareVersion) return { ...device, updateAvailable: false };
    return { ...device, updateAvailable: true, latestFirmwareVersion: version };
  });
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
    this.refreshInFlight = null;
    this.tokens = usesOAuth() ? loadTokens(config.ewelink.tokenFile) : null;
    this.pendingAuthorizations = new Map();
  }

  ensureConfigured() {
    if (!hasEwelinkConfiguration()) {
      throw new EwelinkConfigurationError('eWeLink configuration is incomplete');
    }
  }

  getClient() {
    this.ensureConfigured();
    if (!this.client) {
      if (usesOAuth()) {
        if (!this.tokens) throw new EwelinkAuthorizationRequiredError('eWeLink authorization required');
        this.client = new Ewelink({
          at: this.tokens.at,
          region: this.tokens.region,
          APP_ID: config.ewelink.appId,
          APP_SECRET: config.ewelink.appSecret,
        });
      } else {
        this.client = new Ewelink({
          email: config.ewelink.username,
          password: config.ewelink.password,
          region: this.region,
        });
      }
    }
    return this.client;
  }

  setTokens(tokens) {
    this.tokens = tokens;
    this.client = null;
    if (tokens) saveTokens(config.ewelink.tokenFile, tokens);
    else clearTokens(config.ewelink.tokenFile);
  }

  // Starts the OAuth flow: the browser is sent to this URL and comes back to the callback.
  createAuthorizationUrl() {
    this.ensureConfigured();
    if (!usesOAuth()) {
      throw new EwelinkConfigurationError('OAuth needs EWELINK_APP_ID and EWELINK_APP_SECRET');
    }
    const now = Date.now();
    for (const [state, expiresAt] of this.pendingAuthorizations) {
      if (expiresAt < now) this.pendingAuthorizations.delete(state);
    }
    const state = crypto.randomUUID();
    this.pendingAuthorizations.set(state, now + AUTHORIZATION_TTL_MS);
    const { appId, appSecret, oauthRedirectUrl } = config.ewelink;
    return createLoginUrl({ appId, appSecret, redirectUrl: oauthRedirectUrl, state });
  }

  async completeAuthorization({ code, region, state }) {
    const expiresAt = this.pendingAuthorizations.get(state);
    this.pendingAuthorizations.delete(state);
    if (!code || !REGIONS.has(region) || !expiresAt || expiresAt < Date.now()) {
      throw new EwelinkAuthorizationStateError('Invalid or expired authorization request');
    }
    const { appId, appSecret, oauthRedirectUrl } = config.ewelink;
    try {
      this.setTokens(await exchangeCode({ appId, appSecret, region, code, redirectUrl: oauthRedirectUrl }));
    } catch (error) {
      console.error('eWeLink authorization failed:', error.message);
      throw new EwelinkAuthenticationError('Unable to authenticate with eWeLink');
    }
  }

  // Like logins, concurrent requests that hit an expired token share one refresh.
  refresh() {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshNow().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  async refreshNow() {
    const { appId, appSecret } = config.ewelink;
    try {
      this.setTokens(await refreshTokens({ appId, appSecret, region: this.tokens.region, rt: this.tokens.rt }));
    } catch (error) {
      // Network failures keep the tokens; an eWeLink refusal means the refresh token is dead.
      if (!error.code) throw error;
      console.error('eWeLink token refresh failed:', error.message);
      this.setTokens(null);
      throw new EwelinkAuthorizationRequiredError('eWeLink authorization required');
    }
  }

  // The dashboard calls /api/health and /api/devices at the same time: share one login
  // between concurrent callers instead of hitting the eWeLink login endpoint twice.
  authenticate() {
    if (usesOAuth()) {
      return new Promise((resolve) => {
        this.getClient();
        resolve(true);
      });
    }
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
    let result = await operation(await this.getAuthenticatedClient());
    if (TOKEN_ERRORS.has(result?.error)) {
      // Never reuse a dead token: OAuth refreshes it and retries once, password mode
      // logs in again on the next request.
      this.client = null;
      if (usesOAuth()) {
        await this.refresh();
        result = await operation(await this.getAuthenticatedClient());
      }
    }
    return throwForLibraryError(result);
  }

  async getDevices() {
    const result = await this.request((client) => client.getDevices());
    const raw = (Array.isArray(result) ? result : []).map(unwrapThing);
    return withFirmwareUpdates(raw.map(normaliseDevice), await this.queryFirmwareUpdates(raw));
  }

  // Best effort: a failed OTA lookup must not take the device list down with it.
  async queryFirmwareUpdates(devices) {
    const deviceInfoList = devices.map(firmwareQuery).filter(Boolean);
    if (this.firmwareCheckDenied || deviceInfoList.length === 0) return [];
    try {
      const result = await this.request((client) => client.makeRequest({
        method: 'post',
        uri: '/device/ota/query',
        body: { deviceInfoList },
      }));
      return result?.data?.otaInfoList ?? [];
    } catch (error) {
      if (error.code === PATH_NOT_ALLOWED_ERROR) {
        // The app's API permissions will not change while we run: stop asking.
        this.firmwareCheckDenied = true;
        console.warn('eWeLink app is not allowed to query firmware updates; skipping the check until restart');
      } else {
        console.error('eWeLink firmware update check failed:', error.message);
      }
      return [];
    }
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

module.exports = {
  EwelinkService,
  EwelinkConfigurationError,
  EwelinkAuthenticationError,
  EwelinkAuthorizationRequiredError,
  EwelinkAuthorizationStateError,
  EwelinkRequestError,
};
