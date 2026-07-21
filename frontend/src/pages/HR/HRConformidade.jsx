import { useHR } from './HRContext';
import { TabConformidade } from './HR';

export default function HRConformidade() {
  const { employee } = useHR();
  return <TabConformidade employee={employee} />;
}
