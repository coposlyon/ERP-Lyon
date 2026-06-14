const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });

function arr(x) { return Array.isArray(x) ? x : x != null ? [x] : []; }
function digits(s) { return String(s || '').replace(/\D/g, ''); }

// Lê uma NF-e (XML) e devolve emitente + itens + totais.
function parseNFe(xml) {
  const obj = parser.parse(xml);
  const inf = obj?.nfeProc?.NFe?.infNFe || obj?.NFe?.infNFe || obj?.infNFe;
  if (!inf) throw new Error('XML não parece ser uma NF-e válida');

  const emit = inf.emit || {};
  const ender = emit.enderEmit || {};
  const supplier = {
    cnpj: digits(emit.CNPJ || emit.CPF),
    name: emit.xNome || emit.xFant || 'Fornecedor',
    ie:   emit.IE || null,
    phone: ender.fone ? String(ender.fone) : null,
    address: {
      street: ender.xLgr || '', number: ender.nro || '', neighborhood: ender.xBairro || '',
      city: ender.xMun || '', state: ender.UF || '', zip: digits(ender.CEP),
    },
  };

  const items = arr(inf.det).map((det, i) => {
    const p = det.prod || {};
    return {
      n: det['@_nItem'] || i + 1,
      code: String(p.cProd || ''),
      ean:  p.cEAN && p.cEAN !== 'SEM GTIN' ? String(p.cEAN) : null,
      name: p.xProd || '',
      ncm:  p.NCM ? String(p.NCM) : null,
      cfop: p.CFOP ? String(p.CFOP) : null,
      unit: p.uCom || 'UN',
      quantity:   Number(p.qCom) || 0,
      unit_price: Number(p.vUnCom) || 0,
      total:      Number(p.vProd) || 0,
    };
  });

  const tot = inf.total?.ICMSTot || {};
  return {
    number: inf.ide?.nNF ? String(inf.ide.nNF) : null,
    key: digits((obj?.nfeProc?.protNFe?.infProt?.chNFe) || inf['@_Id']),
    supplier,
    items,
    total: Number(tot.vNF) || items.reduce((s, it) => s + it.total, 0),
    discount: Number(tot.vDesc) || 0,
  };
}

module.exports = { parseNFe, digits };
