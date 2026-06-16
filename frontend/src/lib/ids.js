// Formata um ID/código com no mínimo 4 dígitos (0001, 0042, 1234).
// Códigos não-numéricos (SKUs com letras) são mantidos como estão.
export function id4(v) {
  if (v == null || v === '') return '—';
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s;
}
