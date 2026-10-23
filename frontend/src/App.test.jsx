import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { api } from './services/api';

vi.mock('./services/api', () => ({
  api: {
    getHealth: vi.fn(),
    getDevices: vi.fn(),
    getDevice: vi.fn(),
    turnDeviceOn: vi.fn(),
    turnDeviceOff: vi.fn(),
  },
}));

const kitchen = { id: '10012abcde', name: 'Kitchen light', type: 'BASICR2', online: true, state: 'ON' };
const hall = { id: '10012fffff', name: 'Hall', type: 'BASICR2', online: false, state: 'OFF' };

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getHealth.mockResolvedValue({ status: 'ok', ewelink: 'connected' });
    api.getDevices.mockResolvedValue({ devices: [kitchen, hall] });
  });

  afterEach(cleanup);

  it('loads the connection status and the device list', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Kitchen light' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hall' })).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('2 found')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('switches a device and shows the state the backend returns', async () => {
    api.turnDeviceOff.mockResolvedValue({ success: true, device: { ...kitchen, state: 'OFF' } });
    render(<App />);
    await screen.findByRole('heading', { name: 'Kitchen light' });

    fireEvent.click(screen.getByRole('switch', { name: 'Turn Kitchen light off' }));

    expect(api.turnDeviceOff).toHaveBeenCalledWith('10012abcde');
    expect(await screen.findByRole('switch', { name: 'Turn Kitchen light on' })).toBeTruthy();
  });

  it('reports a failed switch without dropping the device', async () => {
    api.turnDeviceOn.mockRejectedValue(new Error('Device is offline'));
    api.getDevices.mockResolvedValue({ devices: [{ ...kitchen, state: 'OFF' }] });
    render(<App />);
    await screen.findByRole('heading', { name: 'Kitchen light' });

    fireEvent.click(screen.getByRole('switch', { name: 'Turn Kitchen light on' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to switch Kitchen light');
    expect(screen.getByRole('heading', { name: 'Kitchen light' })).toBeTruthy();
  });

  it('explains an authentication problem instead of showing the raw error', async () => {
    api.getHealth.mockRejectedValue(new Error('Unable to authenticate with eWeLink'));
    api.getDevices.mockRejectedValue(new Error('Unable to authenticate with eWeLink'));
    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toContain('Check your eWeLink configuration and connection');
    expect(screen.getByText('Connection unavailable')).toBeTruthy();
    expect(screen.getByText('No devices found')).toBeTruthy();
  });

  it('offers to connect eWeLink when the backend still needs authorization', async () => {
    const required = Object.assign(new Error('eWeLink authorization required'), { authorizeUrl: '/api/oauth/login' });
    api.getHealth.mockRejectedValue(required);
    api.getDevices.mockRejectedValue(required);
    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toContain('Connect your eWeLink account');
    expect(screen.getByRole('link', { name: 'Connect eWeLink' }).getAttribute('href')).toBe('/api/oauth/login');
  });

  it('refreshes the list on demand', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Kitchen light' });
    api.getDevices.mockResolvedValue({ devices: [hall] });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Kitchen light' })).toBeNull());
    expect(screen.getByText('1 found')).toBeTruthy();
    expect(api.getDevices).toHaveBeenCalledTimes(2);
  });
});
