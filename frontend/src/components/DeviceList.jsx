import DeviceCard from './DeviceCard';

export default function DeviceList({ devices, switchingId, onToggle }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{devices.map(device => <DeviceCard key={device.id} device={device} switching={switchingId === device.id} onToggle={onToggle} />)}</div>;
}
