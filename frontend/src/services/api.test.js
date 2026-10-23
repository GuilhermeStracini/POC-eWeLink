import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('api client', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads health and devices from the backend', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' })).mockResolvedValueOnce(jsonResponse({ devices: [{ id: '1' }] }));

    expect(await api.getHealth()).toEqual({ status: 'ok' });
    expect(await api.getDevices()).toEqual({ devices: [{ id: '1' }] });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/health', '/api/devices']);
  });

  it('posts switch commands with an encoded device id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await api.turnDeviceOn('abc/1');
    await api.turnDeviceOff('abc/1');
    await api.getDevice('abc/1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/devices/abc%2F1/on', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/devices/abc%2F1/off', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/devices/abc%2F1', undefined);
  });

  it("throws the backend's error message on a failed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Device is offline' }, 409));

    await expect(api.turnDeviceOn('1')).rejects.toThrow('Device is offline');
  });

  it('passes on the authorization URL when the backend asks for one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'eWeLink authorization required', authorizeUrl: '/api/oauth/login' }, 503));

    await expect(api.getDevices()).rejects.toMatchObject({ message: 'eWeLink authorization required', authorizeUrl: '/api/oauth/login' });
  });

  it('falls back to a generic message when the error body is empty or not JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad json'); } });
    await expect(api.getDevices()).rejects.toThrow('Something went wrong. Please try again.');

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));
    await expect(api.getDevices()).rejects.toThrow('Something went wrong. Please try again.');
  });
});
