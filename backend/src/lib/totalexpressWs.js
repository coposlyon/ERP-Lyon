// ============================================================
// TOTAL EXPRESS — O WEBSERVICE (EDI ICS V24): COLETA E RASTREIO.
//
// A cotação mora em lib/totalexpress.js e não fala com ninguém: é a
// tabela negociada. Este arquivo é a outra metade, a que conversa com a
// Total Express, e o manual só oferece duas coisas:
//
//   RegistraColeta   manda as encomendas que vão sair — SEMPRE EM LOTE.
//                    O manual proíbe pedido a pedido ("pode causar
//                    impacto no processo operacional"), e o uso indevido
//                    suspende o serviço sem aviso.
//   ObterTracking    devolve os status novos. Sem data, traz só os lotes
//                    ainda não consumidos — e os consome.
//
// SOAP 1.1, rpc/encoded, com usuário e senha por HTTP Basic. Sem
// biblioteca SOAP: são dois envelopes fixos, e uma dependência a mais
// para montar dois XML seria mais código para manter do que isto.
//
// A CONTA TAMBÉM LIBERA POR IP. Com usuário e senha certos, a Total
// Express ainda responde "Acesso Negado! Seu IP foi arquivado" se a
// chamada sair de um endereço que ela não cadastrou. Por isso existe
// `ipDeSaida()`: é o número que se manda para eles liberarem.
//
// Tudo o que é montagem e leitura de XML é função pura, testada em
// test/totalexpressWs.test.js. Só `chamar`, `testarAcesso` e
// `ipDeSaida` saem para a rede.
// ============================================================

const URL_PADRAO = 'https://edi.totalexpress.com.br/webservice24.php';
const NS_TIPOS = 'http://edi.totalexpress.com.br/soap/webservice_v24.total';

// O manual descarta transmissões acima de 500 KB. Uma encomenda com NF-e
// dá perto de 2 KB de XML; 40 por transmissão fica muito longe do teto
// e ainda é "lote", como a Total Express exige.
const LOTE_MAXIMO = 40;
const TIMEOUT_MS = 120000;   // Anexo 3 do manual: 120 s

const SERVICOS = {
  1: 'Expresso', 2: 'Especial', 3: 'Standard com transferência rodoviária',
  4: 'Entrega Fácil', 5: 'Premium', 6: 'Standard', 7: 'Super Expresso',
};

const MENSAGEM_PROC = {
  0: 'Cliente não autorizado a realizar o procedimento.',
  1: 'Processado com sucesso.',
  2: 'Sistema da Total Express indisponível no momento. Tente mais tarde.',
  3: 'Erro na validação XSD: a estrutura enviada foi recusada.',
  4: 'Erro sistêmico da Total Express. Tente mais tarde.',
  5: 'Parte das encomendas foi recusada por erro nos dados.',
};

const MENSAGEM_ERRO_VOLUME = {
  1: 'Tipo de serviço não contratado',
  2: 'Dados obrigatórios ausentes ou incorretos',
  3: 'Volume duplicado (já transmitido)',
  4: 'Erro sistêmico da Total Express ao processar o volume',
};

// ── utilidades ───────────────────────────────────────────────
const soDigitos = v => String(v ?? '').replace(/\D/g, '');
const corta = (v, n) => String(v ?? '').trim().slice(0, n);
const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const numero = v => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v));

const escapar = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const desescapar = v => String(v ?? '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Um campo SOAP-encoded. Vazio não vai: campo opcional em branco reprova no XSD. */
function campo(nome, tipo, valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return '';
  return `<${nome} xsi:type="xsd:${tipo}">${escapar(valor)}</${nome}>`;
}

function envelope(metodo, corpo) {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"'
    + ` xmlns:ns1="urn:${metodo}" xmlns:xsd="http://www.w3.org/2001/XMLSchema"`
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    + ` xmlns:ns2="${NS_TIPOS}"`
    + ' xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"'
    + ' SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + `<SOAP-ENV:Body><ns1:${metodo}>${corpo}</ns1:${metodo}></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}

// ── a encomenda ─────────────────────────────────────────────

/** Telefone do cadastro em DDD + número, sem o 55 do país. */
function telefoneDe(cliente) {
  let d = soDigitos(cliente?.mobile || cliente?.phone);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return { ddd: null, numero: null };
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

/**
 * De pedido + nota + cliente para a encomenda do manual.
 *
 * Devolve `{ ok: false, problemas }` em vez de mandar campo vazio: um
 * volume com dado faltando volta como "CodigoErro 2" e ocupa uma
 * transmissão à toa. Melhor a tela dizer o que falta antes de enviar.
 *
 * @param pedido  código do pedido (vai no campo Pedido e no rastreio)
 * @param venda   { number, subtotal, discount, total }
 * @param cliente { name, cpf_cnpj, phone, mobile, email, address{street,number,complement,neighborhood,city,state,zip} }
 * @param nota    { numero, serie, chave, total, data_emissao | authorized_at | created_at, status }
 * @param medida  { peso_real, caixas }  (lib/embalagem.js)
 * @param cfg     { servico, natureza }
 */
function montarEncomenda({ pedido, venda = {}, cliente = {}, nota, medida = {}, cfg = {} }) {
  const problemas = [];
  const end = cliente?.address && typeof cliente.address === 'object' ? cliente.address : {};
  const doc = soDigitos(cliente?.cpf_cnpj);
  const cep = soDigitos(end.zip);

  if (!corta(cliente?.name, 40)) problemas.push('Cliente sem nome.');
  if (doc.length !== 11 && doc.length !== 14) problemas.push('Cliente sem CPF/CNPJ válido no cadastro.');
  if (!corta(end.street, 80)) problemas.push('Endereço de entrega sem rua.');
  if (!corta(end.neighborhood, 40)) problemas.push('Endereço de entrega sem bairro.');
  if (!corta(end.city, 40)) problemas.push('Endereço de entrega sem cidade.');
  if (corta(end.state, 2).length !== 2) problemas.push('Endereço de entrega sem estado (UF).');
  if (cep.length !== 8) problemas.push('Endereço de entrega sem CEP válido.');

  const chave = soDigitos(nota?.chave);
  if (!nota) {
    problemas.push('Pedido sem NF-e autorizada. A Total Express não aceita a encomenda sem a nota.');
  } else {
    if (nota.status && nota.status !== 'autorizado') problemas.push(`A NF-e está "${nota.status}", e não autorizada.`);
    if (!soDigitos(nota.numero)) problemas.push('A NF-e não tem número.');
    if (chave.length !== 44) problemas.push('A NF-e não tem a chave de acesso de 44 dígitos.');
  }
  if (!corta(pedido, 20)) problemas.push('Pedido sem código.');

  if (problemas.length) return { ok: false, problemas };

  const dataNota = String(nota.data_emissao || nota.authorized_at || nota.created_at || '').slice(0, 10);
  const valorTotal = round2(Number(nota.total) || Number(venda.total) || 0);
  const valorProdutos = round2(
    (Number(venda.subtotal) || 0) - (Number(venda.discount) || 0) || valorTotal,
  );
  const fone = telefoneDe(cliente);
  const peso = Number(medida.peso_real) > 0 ? round2(medida.peso_real) : null;

  return {
    ok: true,
    encomenda: {
      TipoServico: Number(cfg.servico) || 1,
      TipoEntrega: 0,
      Peso: peso,
      Volumes: Math.max(1, Math.min(99, Number(medida.caixas) || 1)),
      CondFrete: 'CIF',
      Pedido: corta(pedido, 20),
      IdCliente: corta(venda.number, 20),
      Natureza: corta(cfg.natureza || 'COPOS PERSONALIZADOS', 25),
      TipoVolumes: 'CX',
      IsencaoIcms: 0,
      DestNome: corta(cliente.name, 40),
      DestCpfCnpj: doc,
      DestEnd: corta(end.street, 80),
      DestEndNum: corta(end.number, 10) || 'S/N',
      DestCompl: corta(end.complement, 60),
      DestBairro: corta(end.neighborhood, 40),
      DestCidade: corta(end.city, 40),
      DestEstado: corta(end.state, 2).toUpperCase(),
      DestCep: cep,
      DestEmail: corta(cliente.email, 60),
      DestDdd: fone.ddd,
      DestTelefone1: fone.numero,
      NFe: {
        NfeNumero: soDigitos(nota.numero),
        NfeSerie: soDigitos(nota.serie) || '1',
        NfeData: /^\d{4}-\d{2}-\d{2}$/.test(dataNota) ? dataNota : null,
        NfeValTotal: valorTotal.toFixed(2),
        NfeValProd: valorProdutos.toFixed(2),
        NfeChave: chave,
      },
    },
  };
}

/** A encomenda em XML, na ordem do Anexo 2 do manual. */
function xmlEncomenda(e) {
  const nfe = e.NFe;
  return '<item xsi:type="ns2:Encomenda">'
    + campo('TipoServico', 'nonNegativeInteger', e.TipoServico)
    + campo('TipoEntrega', 'nonNegativeInteger', e.TipoEntrega)
    + campo('Peso', 'decimal', e.Peso != null ? Number(e.Peso).toFixed(2) : null)
    + campo('Volumes', 'nonNegativeInteger', e.Volumes)
    + campo('CondFrete', 'string', e.CondFrete)
    + campo('Pedido', 'string', e.Pedido)
    + campo('IdCliente', 'string', e.IdCliente)
    + campo('Natureza', 'string', e.Natureza)
    + campo('TipoVolumes', 'string', e.TipoVolumes)
    + campo('IsencaoIcms', 'nonNegativeInteger', e.IsencaoIcms)
    + campo('DestNome', 'string', e.DestNome)
    + campo('DestCpfCnpj', 'string', e.DestCpfCnpj)
    + campo('DestEnd', 'string', e.DestEnd)
    + campo('DestEndNum', 'string', e.DestEndNum)
    + campo('DestCompl', 'string', e.DestCompl)
    + campo('DestBairro', 'string', e.DestBairro)
    + campo('DestCidade', 'string', e.DestCidade)
    + campo('DestEstado', 'string', e.DestEstado)
    + campo('DestCep', 'nonNegativeInteger', e.DestCep)
    + campo('DestEmail', 'string', e.DestEmail)
    + campo('DestDdd', 'nonNegativeInteger', e.DestDdd)
    + campo('DestTelefone1', 'nonNegativeInteger', e.DestTelefone1)
    + (nfe
      ? '<DocFiscalNFe SOAP-ENC:arrayType="ns2:NFe[1]" xsi:type="ns2:DocFiscalNFe"><item xsi:type="ns2:NFe">'
        + campo('NfeNumero', 'nonNegativeInteger', nfe.NfeNumero)
        + campo('NfeSerie', 'nonNegativeInteger', nfe.NfeSerie)
        + campo('NfeData', 'date', nfe.NfeData)
        + campo('NfeValTotal', 'decimal', nfe.NfeValTotal)
        + campo('NfeValProd', 'decimal', nfe.NfeValProd)
        + campo('NfeChave', 'string', nfe.NfeChave)
        + '</item></DocFiscalNFe>'
      : '')
    + '</item>';
}

function xmlRegistraColeta({ codRemessa, encomendas }) {
  const lista = Array.isArray(encomendas) ? encomendas : [];
  return envelope('RegistraColeta',
    '<RegistraColetaRequest xsi:type="ns2:RegistraColetaRequest">'
    + campo('CodRemessa', 'string', corta(codRemessa, 20))
    + `<Encomendas SOAP-ENC:arrayType="ns2:Encomenda[${lista.length}]" xsi:type="ns2:Encomendas">`
    + lista.map(xmlEncomenda).join('')
    + '</Encomendas></RegistraColetaRequest>');
}

function xmlObterTracking({ dataConsulta } = {}) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(dataConsulta || '')) ? dataConsulta : null;
  return envelope('ObterTracking',
    '<ObterTrackingRequest xsi:type="ns2:ObterTrackingRequest">'
    + campo('DataConsulta', 'date', data)
    + '</ObterTrackingRequest>');
}

// ── leitura do XML ──────────────────────────────────────────
//
// Um leitor mínimo de árvore: elementos, texto e CDATA. Prefixo de
// namespace é descartado (ns1:Pedido e Pedido são o mesmo campo), e
// atributo não interessa — o SOAP-encoded só usa atributo para dizer o
// tipo, que já sabemos.

const semPrefixo = n => String(n).replace(/^[^:]*:/, '');

function parseXml(xml) {
  const raiz = { nome: '#doc', filhos: [], texto: '' };
  const pilha = [raiz];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s>/!?]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const topo = pilha[pilha.length - 1];
    if (m[1] !== undefined) topo.texto += m[1];
    else if (m[2]) { if (pilha.length > 1) pilha.pop(); }
    else if (m[3]) {
      const no = { nome: semPrefixo(m[3]), filhos: [], texto: '' };
      topo.filhos.push(no);
      if (!m[5]) pilha.push(no);
    } else if (m[6]) topo.texto += desescapar(m[6]);
  }
  return raiz;
}

/** O primeiro descendente com este nome (busca em profundidade). */
function busca(no, nome) {
  if (!no) return null;
  for (const f of no.filhos) {
    if (f.nome === nome) return f;
    const achado = busca(f, nome);
    if (achado) return achado;
  }
  return null;
}
const filhoDireto = (no, nome) => (no ? no.filhos.find(f => f.nome === nome) || null : null);
const textoDe = no => (no ? no.texto.trim() : '');
const texto = (no, nome) => textoDe(busca(no, nome));
const textoDireto = (no, nome) => textoDe(filhoDireto(no, nome));

/** Fault SOAP — é por ele que chega o "Acesso Negado! Seu IP...". */
function faultDe(raizOuXml) {
  const raiz = typeof raizOuXml === 'string' ? parseXml(raizOuXml) : raizOuXml;
  const f = busca(raiz, 'Fault');
  if (!f) return null;
  return texto(f, 'faultstring') || texto(f, 'faultcode') || 'Falha SOAP sem descrição.';
}

/** O IP que a Total Express bloqueou, quando a falha for essa. */
function ipBloqueadoDe(mensagem) {
  const m = String(mensagem || '').match(/IP[^0-9]*(\d{1,3}(?:\.\d{1,3}){3})/i);
  return m ? m[1] : null;
}

function parseRegistraColeta(xml) {
  const raiz = parseXml(xml);
  const fault = faultDe(raiz);
  if (fault) return { ok: false, fault, mensagem: fault, ip_bloqueado: ipBloqueadoDe(fault), erros: [] };

  const codigo = numero(texto(raiz, 'CodigoProc'));
  const errosNo = busca(raiz, 'ErrosIndividuais');
  const erros = (errosNo ? errosNo.filhos : []).map(it => {
    const cod = numero(texto(it, 'CodigoErro'));
    return {
      pedido: texto(it, 'Pedido') || null,
      id_cliente: texto(it, 'IdCliente') || null,
      codigo: cod,
      descricao: texto(it, 'DescricaoErro') || MENSAGEM_ERRO_VOLUME[cod] || 'Volume recusado',
    };
  });

  return {
    ok: codigo === 1 || codigo === 5,
    codigo_proc: codigo,
    mensagem: MENSAGEM_PROC[codigo] || `Resposta inesperada (CodigoProc ${codigo ?? 'ausente'}).`,
    processados: numero(texto(raiz, 'ItensProcessados')) ?? 0,
    rejeitados: numero(texto(raiz, 'ItensRejeitados')) ?? 0,
    protocolo: texto(raiz, 'NumProtocolo') || null,
    romaneio: texto(raiz, 'CodRomaneio') || null,
    erros,
  };
}

function parseObterTracking(xml) {
  const raiz = parseXml(xml);
  const fault = faultDe(raiz);
  if (fault) return { ok: false, fault, mensagem: fault, ip_bloqueado: ipBloqueadoDe(fault), lotes: [] };

  const codigo = numero(texto(raiz, 'CodigoProc'));
  const lotesNo = busca(raiz, 'ArrayLoteRetorno');
  const lotes = (lotesNo ? lotesNo.filhos : []).map(l => ({
    cod_retorno: numero(textoDireto(l, 'CodRetorno')),
    data_geracao: textoDireto(l, 'DataGeracao') || null,
    encomendas: (filhoDireto(l, 'ArrayEncomendaRetorno')?.filhos || []).map(e => ({
      awb: textoDireto(e, 'AWB') || null,
      pedido: textoDireto(e, 'Pedido') || null,
      nota_fiscal: textoDireto(e, 'NotaFiscal') || null,
      serie: textoDireto(e, 'NotaFiscalSerie') || null,
      id_cliente: textoDireto(e, 'IdCliente') || null,
      codigo_objeto: textoDireto(e, 'CodigoObjeto') || null,
      status: (filhoDireto(e, 'ArrayStatusTotal')?.filhos || []).map(s => ({
        codigo: numero(textoDireto(s, 'CodStatus')),
        descricao: textoDireto(s, 'DescStatus') || null,
        data: textoDireto(s, 'DataStatus') || null,
      })),
      correios: (filhoDireto(e, 'ArrayStatusEct')?.filhos || []).map(s => ({
        tipo: textoDireto(s, 'EctTipo') || null,
        status: textoDireto(s, 'EctStatus') || null,
        data: textoDireto(s, 'EctData') || null,
        hora: textoDireto(s, 'EctHora') || null,
        descricao: textoDireto(s, 'EctDescricao') || null,
        local: textoDireto(s, 'EctLocal') || null,
        cidade: textoDireto(s, 'EctCidade') || null,
        uf: textoDireto(s, 'EctUf') || null,
      })),
    })),
  }));

  return {
    ok: codigo === 1,
    codigo_proc: codigo,
    mensagem: MENSAGEM_PROC[codigo] || `Resposta inesperada (CodigoProc ${codigo ?? 'ausente'}).`,
    lotes,
  };
}

// ── o que cada status do Anexo 1 faz com o pedido ───────────
//
// Só três status mudam a etapa do pedido no ERP. O resto é ocorrência
// (endereço não localizado, ausente, avaria...) e fica registrado no
// histórico para a logística agir — mudar a etapa por eles seria dizer
// que a entrega andou quando ela travou.
const EM_TRANSITO = new Set([38, 91, 101, 102, 103, 104, 106, 107]);
const INFORMATIVOS = new Set([0, 29, 68, 70, 80, 98]);

function efeitoDoStatus(codigo) {
  const c = Number(codigo);
  if (c === 1) return 'entregue';
  if (c === 83 || c === 84) return 'coletado';
  if (EM_TRANSITO.has(c)) return 'transito';
  if (INFORMATIVOS.has(c)) return 'informativo';
  return 'ocorrencia';
}

/** O link público de rastreio (Anexo 4). */
function linkRastreio({ reid, pedido, notaFiscal }) {
  if (!reid || !pedido) return null;
  const q = new URLSearchParams({ reid: String(reid), pedido: String(pedido), nfiscal: String(notaFiscal || '') });
  return `http://tracking.totalexpress.com.br/poupup_track.php?${q}`;
}

// ── rede ────────────────────────────────────────────────────

function autorizacao(usuario, senha) {
  return 'Basic ' + Buffer.from(`${usuario}:${senha}`, 'utf8').toString('base64');
}

async function lerCorpo(resp) {
  const buf = Buffer.from(await resp.arrayBuffer());
  const latin = /iso-8859-1|latin1/i.test(resp.headers.get('content-type') || '');
  return buf.toString(latin ? 'latin1' : 'utf8');
}

async function comPrazo(fn, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

/** Uma chamada SOAP. Devolve o XML cru; quem chama interpreta. */
async function chamar({ url, usuario, senha, metodo, corpo, timeoutMs = TIMEOUT_MS }) {
  return comPrazo(async signal => {
    const resp = await fetch(url || URL_PADRAO, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"urn:${metodo}#${metodo}"`,
        Authorization: autorizacao(usuario, senha),
      },
      body: corpo,
    });
    return { http: resp.status, xml: await lerCorpo(resp) };
  }, timeoutMs);
}

async function registraColeta(cred, { codRemessa, encomendas }) {
  const { http, xml } = await chamar({
    url: cred.url, usuario: cred.usuario, senha: cred.senha,
    metodo: 'RegistraColeta', corpo: xmlRegistraColeta({ codRemessa, encomendas }),
  });
  const r = parseRegistraColeta(xml);
  if (!r.fault && r.codigo_proc === null && http >= 400) {
    return { ...r, ok: false, mensagem: http === 401 ? 'Usuário ou senha recusados pela Total Express.' : `A Total Express respondeu HTTP ${http}.` };
  }
  return { ...r, http };
}

async function obterTracking(cred, { dataConsulta } = {}) {
  const { http, xml } = await chamar({
    url: cred.url, usuario: cred.usuario, senha: cred.senha,
    metodo: 'ObterTracking', corpo: xmlObterTracking({ dataConsulta }),
  });
  const r = parseObterTracking(xml);
  if (!r.fault && r.codigo_proc === null && http >= 400) {
    return { ...r, ok: false, mensagem: http === 401 ? 'Usuário ou senha recusados pela Total Express.' : `A Total Express respondeu HTTP ${http}.` };
  }
  return { ...r, http };
}

/**
 * Usuário, senha e IP estão aceitos? Pede o WSDL, que não grava nada.
 */
async function testarAcesso(cred) {
  try {
    const { http, xml } = await comPrazo(async signal => {
      const resp = await fetch(`${cred.url || URL_PADRAO}?wsdl`, {
        signal, headers: { Authorization: autorizacao(cred.usuario, cred.senha) },
      });
      return { http: resp.status, xml: await lerCorpo(resp) };
    }, 20000);

    const fault = faultDe(xml);
    if (fault) return { ok: false, http, mensagem: fault, ip_bloqueado: ipBloqueadoDe(fault) };
    if (http === 401) return { ok: false, http, mensagem: 'Usuário ou senha recusados pela Total Express.' };
    if (http >= 400) return { ok: false, http, mensagem: `A Total Express respondeu HTTP ${http}.` };

    const operacoes = [...new Set([...xml.matchAll(/<(?:\w+:)?operation\s+name="([^"]+)"/g)].map(m => m[1]))];
    return { ok: operacoes.length > 0, http, operacoes,
      mensagem: operacoes.length ? 'Acesso liberado.' : 'O endereço respondeu, mas sem o WSDL esperado.' };
  } catch (err) {
    return { ok: false, mensagem: err.name === 'AbortError' ? 'A Total Express não respondeu a tempo.' : err.message };
  }
}

/** O IP público de saída deste servidor — o que a Total Express precisa liberar. */
async function ipDeSaida() {
  try {
    return await comPrazo(async signal => {
      const r = await fetch('https://api.ipify.org?format=json', { signal });
      const j = await r.json();
      return j?.ip || null;
    }, 10000);
  } catch { return null; }
}

module.exports = {
  URL_PADRAO, LOTE_MAXIMO, SERVICOS, MENSAGEM_PROC,
  montarEncomenda, telefoneDe, xmlRegistraColeta, xmlObterTracking,
  parseXml, faultDe, ipBloqueadoDe, parseRegistraColeta, parseObterTracking,
  efeitoDoStatus, linkRastreio,
  registraColeta, obterTracking, testarAcesso, ipDeSaida,
};
