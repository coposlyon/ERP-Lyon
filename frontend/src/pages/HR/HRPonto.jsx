import { useHR } from './HRContext';
import { TabPonto } from './HR';

export default function HRPonto() {
  const { employee } = useHR();
  return <TabPonto employee={employee} />;
}
