const Ewelink = require('ewelink-api');
const { config, hasEwelinkConfiguration } = require('./config');

class EwelinkConfigurationError extends Error {}
class EwelinkAuthenticationError extends Error {}

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

function throwForLibraryError(result) {
  if (result?.error) {
    throw new EwelinkAuthenticationError('eWeLink request was rejected');
  }
  return result;
}

class EwelinkService {
  constructor() {
    this.client = null;
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
        region: config.ewelink.region,
      });
    }
    return this.client;
  }

  async authenticate() {
    try {
      // getCredentials is the package's authentication operation. Do not return it.
      const credentials = await this.getClient().getCredentials();
      throwForLibraryError(credentials);
      if (!credentials?.data?.at || !credentials?.data?.user?.apikey) {
        throw new EwelinkAuthenticationError('eWeLink did not return usable credentials');
      }
      return true;
    } catch (error) {
      if (error instanceof EwelinkConfigurationError) throw error;
      this.client = null;
      throw new EwelinkAuthenticationError('Unable to authenticate with eWeLink');
    }
  }

  async getDevices() {
    const devices = throwForLibraryError(await this.getClient().getDevices());
    return (Array.isArray(devices) ? devices : []).map(normaliseDevice);
  }

  async getDevice(deviceId) {
    const device = throwForLibraryError(await this.getClient().getDevice(deviceId));
    return normaliseDevice(device);
  }

  async setPower(deviceId, state) {
    throwForLibraryError(await this.getClient().setDevicePowerState(deviceId, state));
    return this.getDevice(deviceId);
  }

  turnOn(deviceId) { return this.setPower(deviceId, 'on'); }
  turnOff(deviceId) { return this.setPower(deviceId, 'off'); }
}

module.exports = { EwelinkService, EwelinkConfigurationError, EwelinkAuthenticationError };
