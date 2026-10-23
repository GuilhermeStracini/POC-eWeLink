async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  // authorizeUrl is set when the backend has to be authorized with eWeLink before it can answer.
  if (!response.ok) throw Object.assign(new Error(body.error || 'Something went wrong. Please try again.'), { authorizeUrl: body.authorizeUrl });
  return body;
}

export const api = {
  getHealth: () => request('/api/health'),
  getDevices: () => request('/api/devices'),
  getDevice: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}`),
  turnDeviceOn: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}/on`, { method: 'POST' }),
  turnDeviceOff: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}/off`, { method: 'POST' }),
};
