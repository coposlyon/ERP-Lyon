// Relatórios imprimíveis (PDF via imprimir do navegador) do módulo de
// Precificação — mesmo padrão HTML da Solicitação de Compra.
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const CSS = `
  @page { margin: 12mm; size: A4 portrait; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 24px; }
  .no-print { position: fixed; top: 14px; right: 14px; z-index: 999; background: #4f46e5; color: #fff;
    border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 20px; color: #1e1b4b; }
  .sub { color: #6b7280; font-size: 11px; margin-top: 2px; }
  h2 { font-size: 13px; color: #4f46e5; text-transform: uppercase; letter-spacing: .04em;
    margin: 18px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eef2ff; color: #312e81; text-align: left; padding: 6px 8px; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  .r { text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px; }
  .grid div b { color: #374151; }
  .total-row td { font-weight: 700; background: #f9fafb; }
  .big { background: #ecfdf5; border: 2px solid #10b981; border-radius: 10px; padding: 12px 16px;
    text-align: center; margin-top: 10px; }
  .big .v { font-size: 26px; font-weight: 800; color: #047857; }
  .prices { display: flex; gap: 10px; margin-top: 10px; }
  .prices div { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; text-align: center; }
  .prices .v { font-size: 16px; font-weight: 700; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; }
`;

function shell(title, body) {
  const genTime = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${title}</title><style>${CSS}</style></head><body>
  <button class="no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  ${body}
  <footer>LYON COPOS · Gerado pelo Dator ERP em ${genTime}</footer>
  </body></html>`;
}

export function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

// ── Relatório da ficha de Formação de Preço ────────────────
export function buildSheetReportHtml(sheet, calc, fixed) {
  const b = sheet.blocks || {};
  const mp = b.materia_prima || {}, pers = b.personalizacao || {},
        emb = b.embalagem || {}, fr = b.frete || {};
  const tintas = (b.tintas || []).filter(t => Number(String(t.amount).replace(',', '.')) > 0);
  const dateStr = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });

  const body = `
  <header>
    <div>
      <h1>Formação de Preço — ${sheet.name || 'Produto'}</h1>
      <p class="sub">${[sheet.category, sheet.capacity, sheet.color_model, sheet.print_type,
        sheet.print_colors ? `${sheet.print_colors} cor(es)` : null].filter(Boolean).join(' · ')}</p>
    </div>
    <div style="text-align:right">
      <b style="font-size:15px;color:#4f46e5">LYON COPOS</b>
      <p class="sub">Data: ${dateStr}</p>
      <p class="sub">Qtd. para cálculo: ${fmtQty(calc.qty)} un.</p>
    </div>
  </header>

  ${sheet.description ? `<p style="color:#4b5563">${sheet.description}</p>` : ''}

  <h2>Custos e Rateios (por unidade)</h2>
  <table>
    <tr><th>Componente</th><th>Base</th><th class="r">Valor unitário</th></tr>
    <tr><td>Matéria-prima ${mp.supplier_name ? `(${mp.supplier_name})` : ''}</td>
        <td>${mp.label || 'Custo direto'} — ${fmtBRL(calc.mat_unit)}/un</td>
        <td class="r">${fmtBRL4(calc.mat_unit)}</td></tr>
    <tr><td>Personalização (${pers.type || 'tela'})</td>
        <td>${fmtBRL(pers.screen_cost)} ÷ ${fmtQty(pers.screen_uses || calc.qty)} usos</td>
        <td class="r">${fmtBRL4(calc.pers_unit)}</td></tr>
    <tr><td>Tintas ${tintas.length ? `(${tintas.map(t => t.label).join(', ')})` : ''}</td>
        <td>${fmtBRL(calc.tinta_total)} ÷ ${fmtQty(calc.qty)} un</td>
        <td class="r">${fmtBRL4(calc.tinta_unit)}</td></tr>
    <tr><td>Embalagem ${emb.box_name ? `(${emb.box_name})` : ''}</td>
        <td>${fmtBRL(emb.box_price)} ÷ ${fmtQty(emb.units_per_box || 0)} un/caixa</td>
        <td class="r">${fmtBRL4(calc.emb_unit)}</td></tr>
    <tr><td>Frete de compra ${fr.supplier_name ? `(${fr.supplier_name})` : ''}</td>
        <td>${fmtBRL(fr.freight_value)} ÷ ${fmtQty(fr.quantity_bought || calc.qty)} un</td>
        <td class="r">${fmtBRL4(calc.frete_unit)}</td></tr>
    <tr><td>Rateio de custos fixos</td>
        <td>${fmtBRL(fixed?.total)} /mês ÷ ${fmtQty(fixed?.monthly_units)} un/mês</td>
        <td class="r">${fmtBRL4(calc.overhead_unit)}</td></tr>
    <tr class="total-row"><td colspan="2">Subtotal de custos</td><td class="r">${fmtBRL4(calc.subtotal)}</td></tr>
    <tr><td>Impostos (${sheet.tax_regime || ''} — ${calc.tax_pct}%)</td><td></td>
        <td class="r">${fmtBRL4(calc.tax_unit)}</td></tr>
    <tr class="total-row"><td colspan="2">CUSTO TOTAL UNITÁRIO</td><td class="r">${fmtBRL4(calc.cost_unit)}</td></tr>
  </table>

  <h2>Preço de Venda Sugerido</h2>
  <div class="prices">
    <div><p class="sub">Mínimo (margem ${sheet.margin_min_pct}%)</p><p class="v" style="color:#b45309">${fmtBRL(calc.price_min)}</p></div>
    <div style="border-color:#10b981"><p class="sub">Ideal (margem ${sheet.margin_ideal_pct}%)</p><p class="v" style="color:#047857">${fmtBRL(calc.price_ideal)}</p></div>
    <div><p class="sub">Premium (margem ${sheet.margin_premium_pct}%)</p><p class="v" style="color:#7c3aed">${fmtBRL(calc.price_premium)}</p></div>
  </div>
  <div class="big">
    <p class="sub">PREÇO DE VENDA SUGERIDO (IDEAL)</p>
    <p class="v">${fmtBRL(calc.price_ideal)}</p>
  </div>

  <h2>Projeção para ${fmtQty(calc.qty)} unidades (preço ideal)</h2>
  <table>
    <tr><th>Faturamento</th><th>Custo total</th><th>Impostos</th><th>Lucro bruto</th><th>Lucro líquido estimado</th></tr>
    <tr>
      <td>${fmtBRL(calc.price_ideal * calc.qty)}</td>
      <td>${fmtBRL(calc.cost_unit * calc.qty)}</td>
      <td>${fmtBRL(calc.tax_unit * calc.qty)}</td>
      <td>${fmtBRL((calc.price_ideal - calc.cost_unit) * calc.qty)}</td>
      <td><b>${fmtBRL((calc.price_ideal - calc.cost_unit) * calc.qty - calc.tax_unit * calc.qty)}</b></td>
    </tr>
  </table>`;

  return shell(`Formação de Preço — ${sheet.name || 'Produto'}`, body);
}

// ── Relatório de ranking (custo × lucro × margem) ──────────
export function buildRankingReportHtml(rows, fixed) {
  const dateStr = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });
  const lines = rows.map((r, i) => `
    <tr>
      <td>${i + 1}º</td>
      <td><b>${r.name}</b>${r.category ? ` <span style="color:#9ca3af">· ${r.category}</span>` : ''}</td>
      <td class="r">${fmtBRL4(r.cost_unit)}</td>
      <td class="r">${fmtBRL(r.price_used)}${r.price_source === 'cadastro' ? '' : ' *'}</td>
      <td class="r">${fmtBRL(r.lucro_unit)}</td>
      <td class="r"><b style="color:${r.margem_pct >= 30 ? '#047857' : r.margem_pct >= 15 ? '#b45309' : '#dc2626'}">${(r.margem_pct ?? 0).toFixed(1)}%</b></td>
    </tr>`).join('');

  const body = `
  <header>
    <div>
      <h1>Ranking de Produtos — Custo × Lucro × Margem</h1>
      <p class="sub">Rateio: ${fmtBRL(fixed?.total)}/mês ÷ ${fmtQty(fixed?.monthly_units)} un/mês = ${fmtBRL4(fixed?.overhead_unit)}/un</p>
    </div>
    <div style="text-align:right">
      <b style="font-size:15px;color:#4f46e5">LYON COPOS</b>
      <p class="sub">Data: ${dateStr}</p>
    </div>
  </header>
  <table>
    <tr><th>#</th><th>Produto</th><th class="r">Custo unit.</th><th class="r">Preço</th><th class="r">Lucro/un</th><th class="r">Margem</th></tr>
    ${lines}
  </table>
  <p class="sub" style="margin-top:8px">* preço ideal calculado (produto sem preço de venda no cadastro).</p>`;

  return shell('Ranking de Produtos — Precificação', body);
}
