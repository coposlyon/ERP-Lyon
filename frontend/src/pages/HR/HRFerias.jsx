import { useHR } from './HRContext';
import { TabFerias } from './HR';

export default function HRFerias() {
  const { employee } = useHR();
  return <TabFerias employee={employee} />;
}
