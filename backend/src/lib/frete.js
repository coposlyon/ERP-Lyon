// Cálculo de frete via Melhor Envio. Gated por MELHORENVIO_TOKEN — sem o token
// o recurso retorna "não configurado" e nada quebra.
const BASE = process.env.MELHORENVIO_BASE || 'https://melhorenvio.com.br';
const onlyDigits = s => String(s || '').replace(/\D/g, '');

// Monta um item p/ a API (dimensões em cm, peso em kg) com os mínimos dos Correios.
// Colunas do produto: height/length/width em mm, weight em g.
function packItem(p, qty) {
  const cm = mm => (mm ? Number(mm) / 10 : 0);
  let width  = Math.max(cm(p.width)  || 11, 11);
  let height = Math.max(cm(p.height) || 10, 2);
  let length = Math.max(cm(p.length) || 16, 16);
  let weight = Math.max((Number(p.weight) || 0) / 1000 || 0.2, 0.05);
  return {
    id: String(p.id),
    width: Math.round(width), height: Math.round(height), length: Math.round(length),
    weight: Number(weight.toFixed(2)),
    insurance_value: Number(p.sale_price) || 0,
    quantity: Math.max(1, parseInt(qty) || 1),
  };
}

async function calcularFrete({ fromCep, toCep, products }) {
  const token = process.env.MELHORENVIO_TOKEN;
  if (!token) return { ok: false, error: 'Frete não configurado (defina MELHORENVIO_TOKEN).' };
  const from = onlyDigits(fromCep), to = onlyDigits(toCep);
  if (from.length !== 8) return { ok: false, error: 'CEP de origem inválido — configure STORE_ORIGIN_CEP.' };
  if (to.length !== 8) return { ok: false, error: 'CEP de destino inválido.' };
  if (!Array.isArray(products) || !products.length) return { ok: false, error: 'Sem itens para calcular o frete.' };
  try {
    const r = await fetch(`${BASE}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Lyon Copos ERP (contato@lyoncopos.online)',
      },
      body: JSON.stringify({ from: { postal_code: from }, to: { postal_code: to }, products }),
    });
    const data = await r.json();
    if (!Array.isArray(data)) return { ok: false, error: data?.message || 'Erro no cálculo de frete' };
    const options = data
      .filter(s => !s.error && s.price)
      .map(s => ({
        id: s.id,
        company: s.company?.name || '',
        service: s.name,
        price: Number(s.price),
        days: s.delivery_time || s.delivery_range?.max || null,
      }))
      .sort((a, b) => a.price - b.price);
    return { ok: true, options };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { calcularFrete, packItem };
