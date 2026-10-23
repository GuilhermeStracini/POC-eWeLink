import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DeviceCard from './DeviceCard';

const device = { id: '10012abcde', name: 'Kitchen light', type: 'BASICR2', online: true, state: 'ON' };

describe('DeviceCard', () => {
  afterEach(cleanup);

  it('shows the device details and power state', () => {
    render(<DeviceCard device={device} switching={false} onToggle={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Kitchen light' })).toBeTruthy();
    expect(screen.getByText('BASICR2')).toBeTruthy();
    expect(screen.getByText('10012abcde')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('ON')).toBeTruthy();

    const toggle = screen.getByRole('switch', { name: 'Turn Kitchen light off' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.disabled).toBe(false);
  });

  it('calls onToggle with the device when the switch is pressed', () => {
    const onToggle = vi.fn();
    render(<DeviceCard device={{ ...device, state: 'OFF' }} switching={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Turn Kitchen light on' }));

    expect(onToggle).toHaveBeenCalledWith({ ...device, state: 'OFF' });
    expect(screen.getByText('OFF')).toBeTruthy();
  });

  it('shows the firmware version and flags an available update', () => {
    const { rerender } = render(<DeviceCard device={{ ...device, firmwareVersion: '3.7.6', updateAvailable: false }} switching={false} onToggle={() => {}} />);

    expect(screen.getByText('Firmware 3.7.6')).toBeTruthy();
    expect(screen.queryByText(/Update available/)).toBeNull();

    rerender(<DeviceCard device={{ ...device, firmwareVersion: '3.7.6', updateAvailable: true, latestFirmwareVersion: '3.8.0' }} switching={false} onToggle={() => {}} />);

    expect(screen.getByText('Update available: 3.8.0')).toBeTruthy();
  });

  it('disables the switch while switching and for offline devices', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<DeviceCard device={device} switching onToggle={onToggle} />);

    expect(screen.getByText('Switching…')).toBeTruthy();
    expect(screen.getByRole('switch').disabled).toBe(true);

    rerender(<DeviceCard device={{ ...device, online: false, state: 'OFF' }} switching={false} onToggle={onToggle} />);

    expect(screen.getByText('Offline')).toBeTruthy();
    const toggle = screen.getByRole('switch');
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
