import { useHR } from './HRContext';
import { TabDocumentos } from './HR';

export default function HRDocumentos() {
  const { employee } = useHR();
  return <TabDocumentos employee={employee} />;
}
