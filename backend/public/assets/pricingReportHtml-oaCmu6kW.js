import{a as i,f as r,b as a}from"./pricingCalc-CdNueGn8.js";import{f as u}from"./format-DE3CduTx.js";import{p as b}from"./pt-BR-Cyf2Iald.js";const _=`
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
`;function g(o,t){const s=u(new Date,"dd/MM/yyyy 'às' HH:mm",{locale:b});return`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${o}</title><style>${_}</style></head><body>
  <button class="no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  ${t}
  <footer>LYON COPOS · Gerado pelo Dator ERP em ${s}</footer>
  </body></html>`}function v(o){const t=window.open("","_blank");return t?(t.document.write(o),t.document.close(),!0):!1}function P(o,t,s){const d=o.blocks||{},p=d.materia_prima||{},e=d.personalizacao||{},n=d.embalagem||{},l=d.frete||{},c=(d.tintas||[]).filter(m=>Number(String(m.amount).replace(",","."))>0),$=u(new Date,"dd/MM/yyyy",{locale:b}),y=`
  <header>
    <div>
      <h1>Formação de Preço — ${o.name||"Produto"}</h1>
      <p class="sub">${[o.category,o.capacity,o.color_model,o.print_type,o.print_colors?`${o.print_colors} cor(es)`:null].filter(Boolean).join(" · ")}</p>
    </div>
    <div style="text-align:right">
      <b style="font-size:15px;color:#4f46e5">LYON COPOS</b>
      <p class="sub">Data: ${$}</p>
      <p class="sub">Qtd. para cálculo: ${i(t.qty)} un.</p>
    </div>
  </header>

  ${o.description?`<p style="color:#4b5563">${o.description}</p>`:""}

  <h2>Custos e Rateios (por unidade)</h2>
  <table>
    <tr><th>Componente</th><th>Base</th><th class="r">Valor unitário</th></tr>
    <tr><td>Matéria-prima ${p.supplier_name?`(${p.supplier_name})`:""}</td>
        <td>${p.label||"Custo direto"} — ${r(t.mat_unit)}/un</td>
        <td class="r">${a(t.mat_unit)}</td></tr>
    <tr><td>Personalização (${e.type||"tela"})</td>
        <td>${r(e.screen_cost)} ÷ ${i(e.screen_uses||t.qty)} usos</td>
        <td class="r">${a(t.pers_unit)}</td></tr>
    <tr><td>Tintas ${c.length?`(${c.map(m=>m.label).join(", ")})`:""}</td>
        <td>${r(t.tinta_total)} ÷ ${i(t.qty)} un</td>
        <td class="r">${a(t.tinta_unit)}</td></tr>
    <tr><td>Embalagem ${n.box_name?`(${n.box_name})`:""}</td>
        <td>${r(n.box_price)} ÷ ${i(n.units_per_box||0)} un/caixa</td>
        <td class="r">${a(t.emb_unit)}</td></tr>
    <tr><td>Frete de compra ${l.supplier_name?`(${l.supplier_name})`:""}</td>
        <td>${r(l.freight_value)} ÷ ${i(l.quantity_bought||t.qty)} un</td>
        <td class="r">${a(t.frete_unit)}</td></tr>
    <tr><td>Rateio de custos fixos</td>
        <td>${r(s==null?void 0:s.total)} /mês ÷ ${i(s==null?void 0:s.monthly_units)} un/mês</td>
        <td class="r">${a(t.overhead_unit)}</td></tr>
    <tr class="total-row"><td colspan="2">Subtotal de custos</td><td class="r">${a(t.subtotal)}</td></tr>
    <tr><td>Impostos (${o.tax_regime||""} — ${t.tax_pct}%)</td><td></td>
        <td class="r">${a(t.tax_unit)}</td></tr>
    <tr class="total-row"><td colspan="2">CUSTO TOTAL UNITÁRIO</td><td class="r">${a(t.cost_unit)}</td></tr>
  </table>

  <h2>Preço de Venda Sugerido</h2>
  <div class="prices">
    <div><p class="sub">Mínimo (margem ${o.margin_min_pct}%)</p><p class="v" style="color:#b45309">${r(t.price_min)}</p></div>
    <div style="border-color:#10b981"><p class="sub">Ideal (margem ${o.margin_ideal_pct}%)</p><p class="v" style="color:#047857">${r(t.price_ideal)}</p></div>
    <div><p class="sub">Premium (margem ${o.margin_premium_pct}%)</p><p class="v" style="color:#7c3aed">${r(t.price_premium)}</p></div>
  </div>
  <div class="big">
    <p class="sub">PREÇO DE VENDA SUGERIDO (IDEAL)</p>
    <p class="v">${r(t.price_ideal)}</p>
  </div>

  <h2>Projeção para ${i(t.qty)} unidades (preço ideal)</h2>
  <table>
    <tr><th>Faturamento</th><th>Custo total</th><th>Impostos</th><th>Lucro bruto</th><th>Lucro líquido estimado</th></tr>
    <tr>
      <td>${r(t.price_ideal*t.qty)}</td>
      <td>${r(t.cost_unit*t.qty)}</td>
      <td>${r(t.tax_unit*t.qty)}</td>
      <td>${r((t.price_ideal-t.cost_unit)*t.qty)}</td>
      <td><b>${r((t.price_ideal-t.cost_unit)*t.qty-t.tax_unit*t.qty)}</b></td>
    </tr>
  </table>`;return g(`Formação de Preço — ${o.name||"Produto"}`,y)}function w(o,t){const s=u(new Date,"dd/MM/yyyy",{locale:b}),d=o.map((e,n)=>`
    <tr>
      <td>${n+1}º</td>
      <td><b>${e.name}</b>${e.category?` <span style="color:#9ca3af">· ${e.category}</span>`:""}</td>
      <td class="r">${a(e.cost_unit)}</td>
      <td class="r">${r(e.price_used)}${e.price_source==="cadastro"?"":" *"}</td>
      <td class="r">${r(e.lucro_unit)}</td>
      <td class="r"><b style="color:${e.margem_pct>=30?"#047857":e.margem_pct>=15?"#b45309":"#dc2626"}">${(e.margem_pct??0).toFixed(1)}%</b></td>
    </tr>`).join(""),p=`
  <header>
    <div>
      <h1>Ranking de Produtos — Custo × Lucro × Margem</h1>
      <p class="sub">Rateio: ${r(t==null?void 0:t.total)}/mês ÷ ${i(t==null?void 0:t.monthly_units)} un/mês = ${a(t==null?void 0:t.overhead_unit)}/un</p>
    </div>
    <div style="text-align:right">
      <b style="font-size:15px;color:#4f46e5">LYON COPOS</b>
      <p class="sub">Data: ${s}</p>
    </div>
  </header>
  <table>
    <tr><th>#</th><th>Produto</th><th class="r">Custo unit.</th><th class="r">Preço</th><th class="r">Lucro/un</th><th class="r">Margem</th></tr>
    ${d}
  </table>
  <p class="sub" style="margin-top:8px">* preço ideal calculado (produto sem preço de venda no cadastro).</p>`;return g("Ranking de Produtos — Precificação",p)}export{w as a,P as b,v as o};
