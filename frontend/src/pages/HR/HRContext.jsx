import { createContext, useContext, useState } from 'react';

const HRCtx = createContext({ employee: null, setEmployee: () => {} });

export function HRProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  return (
    <HRCtx.Provider value={{ employee, setEmployee }}>
      {children}
    </HRCtx.Provider>
  );
}

export const useHR = () => useContext(HRCtx);
