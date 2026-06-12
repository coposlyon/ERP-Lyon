import { useHR } from './HRContext';
import { TabFolha } from './HR';

export default function HRFolha() {
  const { employee } = useHR();
  return <TabFolha employee={employee} />;
}
