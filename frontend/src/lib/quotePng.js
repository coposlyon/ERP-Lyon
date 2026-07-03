// Geração da FOTO (PNG) padronizada do orçamento — template Lyon Copos.
// Desenha direto num <canvas>: a imagem sai sempre igual, sem depender de libs.

const BRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dBR = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };

// Texto padrão gravado em ORCAMENTOS.notes — legível para humanos e
// re-parseável (parseQuoteNotes) para regenerar o PNG pelo histórico.
export function buildQuoteNotes(x) {
  const parts = [];
  if (x.freight) parts.push(`Frete: ${Number(x.freight).toFixed(2)}`);
  if (x.carrierName) parts.push(`Transportadora: ${x.carrierName}`);
  if (x.quoteNumber) parts.push(`Cotação nº: ${x.quoteNumber}`);
  if (x.quoteDate) parts.push(`Data cotação: ${x.quoteDate}`);
  if (x.quoteValidityDays) parts.push(`Validade cotação: ${x.quoteValidityDays} dias`);
  if (x.deliveryDays) parts.push(`Prazo entrega: ${x.deliveryDays} dias úteis`);
  if (x.productionTime) parts.push(`Produção: ${x.productionTime}`);
  if (x.pixPrice) parts.push(`PIX/dinheiro: ${Number(x.pixPrice).toFixed(2)}`);
  if (x.validityDays) parts.push(`Validade orçamento: ${x.validityDays} dias`);
  return parts.join(' | ');
}

export function parseQuoteNotes(notes) {
  const g = re => { const m = String(notes || '').match(re); return m ? m[1].trim() : ''; };
  const num = s => { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? 0 : n; };
  return {
    freight: num(g(/Frete:\s*([\d.,]+)/i)),
    carrierName: g(/Transportadora:\s*([^|]+)/i),
    quoteNumber: g(/Cota[çc][ãa]o n[ºo°]:\s*([^|]+)/i),
    quoteDate: g(/Data cota[çc][ãa]o:\s*([\d-]+)/i),
    quoteValidityDays: parseInt(g(/Validade cota[çc][ãa]o:\s*(\d+)/i), 10) || 0,
    deliveryDays: parseInt(g(/Prazo entrega:\s*(\d+)/i), 10) || 0,
    productionTime: g(/Produ[çc][ãa]o:\s*([^|]+)/i),
    pixPrice: num(g(/PIX\/dinheiro:\s*([\d.,]+)/i)),
    validityDays: parseInt(g(/Validade or[çc]amento:\s*(\d+)/i), 10) || 0,
  };
}

function wrapText(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// q = { number, createdAt, customerName, items:[{name,quantity,unit_price}], discount,
//       freight, carrierName, quoteNumber, quoteDate, quoteValidityDays,
//       deliveryDays, productionTime, pixPrice, validityDays }
export function generateQuotePng(q) {
  const W = 1080, PAD = 64;
  const maxW = W - PAD * 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const F = {
    h2:    'bold 30px Arial',
    bold:  'bold 27px Arial',
    text:  '27px Arial',
    small: '23px Arial',
  };

  const subtotal = (q.items || []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const goods = Math.max(0, subtotal - (Number(q.discount) || 0));
  const freight = Number(q.freight) || 0;
  const totalWithFreight = goods + freight;

  // Linhas do corpo (mesma ordem do texto que a empresa usa no WhatsApp)
  const L = [];
  const add = (text, font = F.text, color = '#1f2937', gap = 10) => L.push({ text, font, color, gap });
  const space = (h = 18) => L.push({ text: '', font: F.text, color: '#000', gap: h });

  add('Conforme solicitado, segue o orçamento dos produtos:', F.text, '#374151');
  space();
  add(`⚠️ Prazo de produção: ${q.productionTime || '3 a 7 dias úteis'} após a aprovação da arte.`, F.bold, '#b45309');
  add('Se precisar de urgência, podemos reduzir o prazo, mas haverá acréscimo no valor.', F.small, '#6b7280');
  space();
  for (const it of (q.items || [])) {
    add(`✅ Produto: ${it.name}`, F.bold);
    add(`✅ Quantidade: ${it.quantity}`);
    add(`✅ Valor unitário: ${BRL(it.unit_price)}`);
    space(14);
  }
  if (Number(q.discount) > 0) add(`Desconto: −${BRL(q.discount)}`, F.text, '#059669');
  add(`💰 Valor total dos produtos: ${BRL(goods)}`, F.h2, '#111827');
  space();
  add('Esse valor é para uma arte padrão aplicada em todos os produtos (pode ser uma arte na frente e outra no verso), em uma única cor.', F.small, '#6b7280');
  add('Se quiser cores diferentes para os produtos, precisamos verificar antes.', F.small, '#6b7280');
  space();
  if (freight > 0 || q.carrierName || q.quoteNumber) {
    if (freight > 0)          add(`💵 Frete: ${BRL(freight)}`, F.bold);
    if (q.deliveryDays)       add(`⏱️ Prazo de entrega: ${q.deliveryDays} dias úteis`);
    if (q.carrierName)        add(`🚚 Transportadora: ${q.carrierName}`);
    if (q.quoteNumber)        add(`✅ Nº da cotação: ${q.quoteNumber}`);
    if (q.quoteDate)          add(`📆 Data da cotação: ${dBR(q.quoteDate)}`);
    if (q.quoteValidityDays)  add(`⏳ Validade da cotação: ${q.quoteValidityDays} dias corridos`);
    space();
  }
  add(`💰 Valor total com frete: ${BRL(totalWithFreight)} (ou 12x com juros no cartão)`, F.h2, '#111827');
  if (Number(q.pixPrice) > 0) add(`💰 Valor com desconto (PIX ou dinheiro): ${BRL(q.pixPrice)}`, F.h2, '#047857');
  space();
  add('🚨 Formas de pagamento:', F.bold);
  add('• Depósito bancário');
  add('• Transferência (TED/DOC/PIX)');
  add('• Boleto bancário (taxa de emissão R$ 6,00, vencimento no próximo dia útil)');
  add('• Cartão de crédito ou débito (parcelamento em até 12x com juros via Nubank)');
  space();
  add('🚨 Quantidade mínima: 10 unidades', F.bold);
  space();
  add('🏦 Dados bancários — Nu Pagamentos S.A. (Instituição 0260)', F.bold);
  add('Agência: 0001  ·  Conta corrente: 688750784-5');
  add('CNPJ: 57.860.708/0001-30');
  add('Correntista: LYON COPOS (LAION CESAR FARINHA)');
  space(8);
  add('🔑 CHAVE PIX (CNPJ): 57.860.708/0001-30', F.bold, '#7c3aed');
  space();
  add(`⚠️ Orçamento válido por ${q.validityDays || 3} dias corridos; após esse prazo, precisaremos refazer.`, F.small, '#b45309');
  add('Assim que confirmar o interesse, enviaremos o formulário para a criação da arte e as demais informações do processo.', F.small, '#6b7280');

  // 1ª passada: mede as alturas (com quebra de linha)
  let bodyH = 0;
  for (const l of L) {
    ctx.font = l.font;
    const lines = l.text ? wrapText(ctx, l.text, maxW) : [];
    const lineH = parseInt((l.font.match(/(\d+)px/) || [0, 27])[1], 10) * 1.4;
    l._lines = lines; l._lineH = lineH;
    bodyH += lines.length * lineH + l.gap;
  }

  const HEADER = 150, FOOTER = 72;
  canvas.width = W;
  canvas.height = Math.ceil(HEADER + 50 + bodyH + 30 + FOOTER);

  // fundo
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // cabeçalho
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, W, HEADER);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px Arial';
  ctx.fillText('LYON COPOS', PAD, 64);
  ctx.font = 'bold 30px Arial';
  ctx.fillText(`ORÇAMENTO Nº ${String(q.number ?? '').toString().padStart(4, '0')}`, PAD, 110);
  ctx.font = '24px Arial';
  const right = (t, y) => { const w = ctx.measureText(t).width; ctx.fillText(t, W - PAD - w, y); };
  if (q.createdAt) right(`Data: ${dBR(q.createdAt)}`, 64);
  if (q.customerName) right(`Cliente: ${String(q.customerName).slice(0, 40)}`, 110);

  // corpo
  let y = HEADER + 50;
  for (const l of L) {
    if (!l._lines.length) { y += l.gap; continue; }
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    for (const line of l._lines) {
      y += l._lineH;
      ctx.fillText(line, PAD, y - l._lineH * 0.25);
    }
    y += l.gap;
  }

  // rodapé
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, canvas.height - FOOTER, W, FOOTER);
  ctx.fillStyle = '#6b7280';
  ctx.font = '20px Arial';
  ctx.fillText('LYON COPOS · CNPJ 57.860.708/0001-30 · Fico à disposição para qualquer dúvida! 🙌', PAD, canvas.height - 28);

  return canvas.toDataURL('image/png');
}

export function downloadPng(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
