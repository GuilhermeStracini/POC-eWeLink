const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Ewelink = require('ewelink-api');
const { loadService, makeThing, stubLibrary, okLogin, thingListResponse, captureConsole } = require('./helpers');

describe('EwelinkService', () => {
  let restore = () => {};
  let errorLog;
  let warnLog;

  beforeEach(() => {
    errorLog = captureConsole('error');
    warnLog = captureConsole('warn');
  });

  afterEach(() => {
    restore();
    restore = () => {};
    errorLog.restore();
    warnLog.restore();
  });

  test('getDevices unwraps the v2 thing list into normalised devices', async () => {
    const { EwelinkService } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => okLogin(),
      request: () => thingListResponse(makeThing(), makeThing({ deviceid: '10012fffff', name: 'Hall', online: false, params: { switch: 'off' } })),
    });

    const devices = await new EwelinkService().getDevices();

    assert.deepEqual(devices, [
      { id: '10012abcde', name: 'Kitchen light', type: 'BASICR2', online: true, state: 'ON', uiid: 1, firmwareVersion: '3.7.6' },
      { id: '10012fffff', name: 'Hall', type: 'BASICR2', online: false, state: 'OFF', uiid: 1, firmwareVersion: undefined },
    ]);
  });

  test('getDevices returns an empty list for an account without devices', async () => {
    const { EwelinkService } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => okLogin(),
      request: () => ({ error: 0, data: { thingList: [], total: 0 } }),
    });

    assert.deepEqual(await new EwelinkService().getDevices(), []);
  });

  test('a cloud error on the device list surfaces as a request error with its code and message', async () => {
    const { EwelinkService, EwelinkRequestError } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => okLogin(),
      request: () => ({ error: 0, data: {} }),
    });

    await assert.rejects(new EwelinkService().getDevices(), (error) => {
      assert.ok(error instanceof EwelinkRequestError);
      assert.equal(error.code, 404);
      assert.equal(error.message, 'eWeLink error 404: No devices found');
      return true;
    });
  });

  test('getDevice normalises a single device', async () => {
    const { EwelinkService } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => okLogin(),
      request: ({ method }) => (method === 'post' ? thingListResponse(makeThing({ params: { switch: 'off' } })) : thingListResponse()),
    });

    const device = await new EwelinkService().getDevice('10012abcde');

    assert.equal(device.id, '10012abcde');
    assert.equal(device.state, 'OFF');
  });

  test('setPower sends the switch command and returns the refreshed device', async () => {
    const { EwelinkService } = loadService();
    const thing = makeThing();
    const commands = [];
    restore = stubLibrary(Ewelink, {
      login: () => okLogin(),
      request: ({ uri, body }) => {
        if (uri === '/device/thing/status') {
          commands.push(body);
          thing.params.switch = body.params.switch;
          return { error: 0, data: {} };
        }
        return thingListResponse(thing);
      },
    });

    const device = await new EwelinkService().turnOff('10012abcde');

    assert.deepEqual(commands, [{ type: 1, id: '10012abcde', params: { switch: 'off' } }]);
    assert.equal(device.state, 'OFF');
  });

  test('login follows the wrong-region answer and retries in the reported region', async () => {
    const { EwelinkService } = loadService({ EWELINK_REGION: 'eu', EWELINK_USERNAME: 'user@example.com', EWELINK_PASSWORD: 'secret' });
    const regions = [];
    restore = stubLibrary(Ewelink, {
      login: (client) => {
        regions.push(client.region);
        return client.region === 'us' ? okLogin('us') : { error: 10004, msg: 'region error', data: { region: 'us' } };
      },
      request: () => thingListResponse(makeThing()),
    });

    const service = new EwelinkService();
    assert.equal(await service.authenticate(), true);

    assert.deepEqual(regions, ['eu', 'us']);
    assert.equal(service.region, 'us');
    assert.match(warnLog.calls.join('\n'), /belongs to region "us", not "eu"/);
    assert.equal((await service.getDevices()).length, 1);
    assert.deepEqual(regions, ['eu', 'us'], 'the token from the retried login is reused');
  });

  test('concurrent callers share one in-flight login', async () => {
    const { EwelinkService } = loadService();
    let logins = 0;
    restore = stubLibrary(Ewelink, {
      login: async () => { logins += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return okLogin(); },
      request: () => thingListResponse(makeThing()),
    });

    const service = new EwelinkService();
    const [ok, devices, again] = await Promise.all([service.authenticate(), service.getDevices(), service.authenticate()]);

    assert.equal(ok, true);
    assert.equal(again, true);
    assert.equal(devices.length, 1);
    assert.equal(logins, 1);
  });

  test('authentication failures are logged with the eWeLink reason but reported generically', async () => {
    const { EwelinkService, EwelinkAuthenticationError } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => ({ error: 10003, msg: 'user account user@example.com does not exist', data: {} }),
      request: () => thingListResponse(),
    });

    await assert.rejects(new EwelinkService().authenticate(), (error) => {
      assert.ok(error instanceof EwelinkAuthenticationError);
      assert.equal(error.message, 'Unable to authenticate with eWeLink');
      return true;
    });
    assert.match(errorLog.calls.join('\n'), /eWeLink error 10003: user account user@example.com does not exist/);
  });

  test('a login that returns no token is rejected', async () => {
    const { EwelinkService, EwelinkAuthenticationError } = loadService();
    restore = stubLibrary(Ewelink, {
      login: () => ({ error: 0, data: { user: {} } }),
      request: () => thingListResponse(),
    });

    await assert.rejects(new EwelinkService().authenticate(), EwelinkAuthenticationError);
    assert.match(errorLog.calls.join('\n'), /did not return usable credentials/);
  });

  test('a failed login is retried on the next call instead of being cached', async () => {
    const { EwelinkService } = loadService();
    let attempts = 0;
    restore = stubLibrary(Ewelink, {
      login: () => { attempts += 1; return attempts === 1 ? { error: 10001, msg: 'wrong password', data: {} } : okLogin(); },
      request: () => thingListResponse(makeThing()),
    });

    const service = new EwelinkService();
    await assert.rejects(service.authenticate());
    assert.equal(await service.authenticate(), true);
    assert.equal(attempts, 2);
  });

  test('a rejected token forces a fresh login on the next request', async () => {
    const { EwelinkService, EwelinkRequestError } = loadService();
    let logins = 0;
    let rejectNext = true;
    restore = stubLibrary(Ewelink, {
      login: () => { logins += 1; return okLogin(); },
      request: () => {
        if (rejectNext) { rejectNext = false; return { error: 401, msg: 'cannot found access token info' }; }
        return thingListResponse(makeThing());
      },
    });

    const service = new EwelinkService();
    await assert.rejects(service.getDevices(), (error) => error instanceof EwelinkRequestError && error.code === 401);
    assert.equal((await service.getDevices()).length, 1);
    assert.equal(logins, 2);
  });

  test('missing configuration is reported before any network call', async () => {
    const { EwelinkService, EwelinkConfigurationError } = loadService({ EWELINK_REGION: '', EWELINK_USERNAME: '', EWELINK_PASSWORD: '' });
    let networkCalls = 0;
    restore = stubLibrary(Ewelink, {
      login: () => { networkCalls += 1; return okLogin(); },
      request: () => { networkCalls += 1; return thingListResponse(); },
    });

    const service = new EwelinkService();
    await assert.rejects(service.authenticate(), EwelinkConfigurationError);
    await assert.rejects(service.getDevices(), EwelinkConfigurationError);
    assert.equal(networkCalls, 0);
    assert.equal(errorLog.calls.length, 0, 'a configuration error is not an authentication failure');
  });
});
