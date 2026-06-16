// Status do Pedido de Venda — sequência fixa (não pode pular etapas).
export const SALE_STATUSES = [
  { key: 'iniciando_pedido',      label: 'INICIANDO PEDIDO',                  cls: 'badge-gray' },
  { key: 'aguardando_financeiro', label: 'AGUARDANDO FINANCEIRO',             cls: 'badge-yellow' },
  { key: 'aguardando_estoque',    label: 'AGUARDANDO CONFIRMAÇÃO DO ESTOQUE', cls: 'badge-yellow' },
  { key: 'aguardando_arte',       label: 'AGUARDANDO ANEXO DA ARTE',          cls: 'badge-blue' },
  { key: 'aguardando_vegetal',    label: 'AGUARDANDO IMPRESSÃO DE VEGETAL',   cls: 'badge-blue' },
  { key: 'aguardando_revelacao',  label: 'AGUARDANDO REVELAÇÃO',              cls: 'badge-purple' },
  { key: 'aguardando_coleta',     label: 'AGUARDANDO COLETA',                 cls: 'badge-purple' },
  { key: 'em_transito',           label: 'EM TRÂNSITO',                       cls: 'badge-blue' },
  { key: 'entregue',              label: 'ENTREGUE',                          cls: 'badge-green' },
];

export const SALE_STATUS_ORDER = SALE_STATUSES.map(s => s.key);
export const saleStatusIndex = k => SALE_STATUS_ORDER.indexOf(k);

// rótulos antigos (vendas criadas antes do novo fluxo) para não quebrar a exibição
const LEGACY = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};
export const saleStatusLabel = k => {
  const f = SALE_STATUSES.find(s => s.key === k);
  return f ? f.label : (LEGACY[k] || k || '—');
};
export const saleStatusClass = k => {
  const f = SALE_STATUSES.find(s => s.key === k);
  if (f) return f.cls;
  return k === 'cancelled' ? 'badge-red' : k === 'delivered' ? 'badge-green' : 'badge-gray';
};
