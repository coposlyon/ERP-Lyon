import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtCnpj(v) {
  if (!v) return '';
  return String(v).replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Constrói o HTML da Solicitação de Compra e RETORNA a string.
 * @param {string} [protocol] — número de controle de 5 dígitos (opcional)
 */
export function buildReplenishmentHtml(tenant, supplier, products, protocol) {
  const dateStr = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });
  const genTime = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  const addr = tenant.address || {};
  const addrLine = [
    addr.street && addr.number ? `${addr.street}, ${addr.number}` : addr.street,
    addr.neighborhood,
    addr.city && addr.state ? `${addr.city} - ${addr.state}` : (addr.city || addr.state),
    addr.zip ? `CEP: ${addr.zip}` : null,
  ].filter(Boolean).join(' · ');

  const totalQty  = products.reduce((s, p) => s + Math.abs(Number(p.current_stock)), 0);
  const totalCost = products.reduce((s, p) => s + Math.abs(Number(p.current_stock)) * (Number(p.cost_price) || 0), 0);

  const rows = products.map((p, i) => {
    const deficit = Math.abs(Number(p.current_stock));
    const custo   = Number(p.cost_price) || 0;
    const bg      = i % 2 === 1 ? 'background:#fffbeb' : '';
    return `
      <tr style="${bg}">
        <td style="text-align:center">${i + 1}</td>
        <td>${p.code || '—'}</td>
        <td>${p.name}</td>
        <td style="text-align:right;font-weight:700">${deficit.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${fmtBRL(custo)}</td>
        <td style="text-align:right;font-weight:700">${fmtBRL(deficit * custo)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Solicitação de Compra — ${tenant.name || ''}</title>
  <style>
    @page { margin: 12mm; size: A4 portrait; }
    @media print { .no-print { display: none !important; } body { padding: 0; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 20px; }

    .no-print {
      position: fixed; top: 14px; right: 14px; z-index: 999;
      background: #f59e0b; color: #fff; border: none; border-radius: 8px;
      padding: 10px 22px; font-size: 14px; font-weight: bold;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.2);
    }
    .no-print:hover { background: #d97706; }

    .top-bar { height: 6px; background: #f59e0b; margin-bottom: 14px; border-radius: 2px; }

    .header { display: flex; justify-content: space-between; align-items: flex-start;
               padding-bottom: 10px; border-bottom: 2.5px solid #f59e0b; margin-bottom: 10px; }
    .co-name { font-size: 18px; font-weight: 900; letter-spacing: .5px; color: #111; }
    .co-info  { font-size: 8.5px; color: #555; line-height: 1.8; margin-top: 5px; }
    .hdr-right { text-align: right; }
    .hdr-label { font-size: 9px; font-weight: bold; color: #999; letter-spacing: .5px; text-transform: uppercase; }
    .hdr-val   { font-size: 9px; color: #444; line-height: 1.9; margin-top: 4px; }

    .title-block { text-align: center; padding: 14px 0 16px; }
    .title-main  { font-size: 17px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .title-sub   { font-size: 10px; color: #666; margin-top: 4px; }
    .title-date  { font-size: 10px; color: #888; margin-top: 2px; }

    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th {
      background: #f59e0b; color: #111; padding: 7px 5px;
      font-size: 8.5px; font-weight: 700; text-align: center;
      border: 1px solid #d97706; text-transform: uppercase; letter-spacing: .3px;
    }
    tbody td { padding: 6px 5px; border: 1px solid #e5e7eb; vertical-align: middle; }
    tfoot td {
      background: #f59e0b; color: #111; padding: 7px 5px;
      font-size: 9px; font-weight: 700; border: 1px solid #d97706;
    }

    .bottom-bar  { height: 6px; background: #f59e0b; margin-top: 24px; border-radius: 2px; }
    .footer-text { text-align: center; font-size: 7.5px; color: #bbb; margin-top: 6px; }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">🖨️ Salvar / Imprimir PDF</button>

  <div class="top-bar"></div>

  <div class="header">
    <div>
      <div class="co-name">${(tenant.name || 'EMPRESA').toUpperCase()}</div>
      <div class="co-info">
        ${addrLine ? addrLine + '<br>' : ''}
        ${tenant.cnpj ? 'CNPJ: ' + fmtCnpj(tenant.cnpj) + '<br>' : ''}
        ${[tenant.phone, tenant.email].filter(Boolean).join('   |   ')}
      </div>
    </div>
    <div class="hdr-right">
      <div class="hdr-label">Solicitação de Compra</div>
      <div class="hdr-val">
        Data: ${dateStr}<br>
        ${protocol ? `<strong style="color:#d97706;letter-spacing:.5px">CONTROLE: ${protocol}</strong><br>` : ''}
        Para: <strong>${supplier.name}</strong>
        ${supplier.phone ? '<br>Tel: ' + supplier.phone : ''}
      </div>
    </div>
  </div>

  <div class="title-block">
    <div class="title-main">Solicitação de Compra</div>
    <div class="title-sub">${(tenant.name || '').toUpperCase()}</div>
    <div class="title-date">${dateStr}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">ITEM</th>
        <th style="width:64px">CÓDIGO</th>
        <th>DESCRIÇÃO / PRODUTO</th>
        <th style="width:80px">QTD A REPOR</th>
        <th style="width:80px">CUSTO UNIT.</th>
        <th style="width:90px">TOTAL CUSTO</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:left;font-size:10px">TOTAL GERAL</td>
        <td style="text-align:right">${totalQty.toLocaleString('pt-BR')}</td>
        <td></td>
        <td style="text-align:right">${fmtBRL(totalCost)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="bottom-bar"></div>
  <div class="footer-text">Gerado automaticamente em ${genTime} — ${tenant.name || ''}</div>

  <script>
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  </script>
</body>
</html>`;
}

/**
 * Abre nova janela com o PDF de impressão E retorna o HTML gerado.
 * @param {string} [protocol] — número de controle (aparece no cabeçalho)
 */
export function generateReplenishmentPdf(tenant, supplier, products, protocol) {
  const html = buildReplenishmentHtml(tenant, supplier, products, protocol);

  const win = window.open('', '_blank', 'width=960,height=780');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    // Fallback se popup bloqueado: download como .html
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Solicitacao_${supplier.name.replace(/[^a-z0-9]/gi, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return html; // retorna para o chamador poder fazer upload no backend
}
