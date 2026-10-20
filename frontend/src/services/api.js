async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

export const api = {
  getHealth: () => request('/api/health'),
  getDevices: () => request('/api/devices'),
  getDevice: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}`),
  turnDeviceOn: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}/on`, { method: 'POST' }),
  turnDeviceOff: (deviceId) => request(`/api/devices/${encodeURIComponent(deviceId)}/off`, { method: 'POST' }),
};
