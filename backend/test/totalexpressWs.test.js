const { test } = require('node:test');
const assert = require('node:assert');
const W = require('../src/lib/totalexpressWs');

const CLIENTE = {
  name: 'Maria & Filhos Ltda',
  cpf_cnpj: '12.345.678/0001-90',
  mobile: '+55 (43) 99876-5432',
  email: 'maria@exemplo.com',
  address: { street: 'Rua das Flores', number: '120', complement: 'Sala 2', neighborhood: 'Centro', city: 'Londrina', state: 'pr', zip: '86010-000' },
};
const NOTA = { numero: '456', serie: '1', chave: '41260923078111000116550010000004561000004567', total: 1250.5, status: 'autorizado', authorized_at: '2026-09-13T14:00:00Z' };
const VENDA = { number: 123, subtotal: 1300, discount: 49.5, total: 1250.5 };

// ── Montagem da encomenda ─────────────────────────────────
test('encomenda — pedido completo vira encomenda do manual', () => {
  const r = W.montarEncomenda({ pedido: 'PV-000123', venda: VENDA, cliente: CLIENTE, nota: NOTA, medida: { peso_real: 12.345, caixas: 3 }, cfg: { servico: 1 } });
  assert.strictEqual(r.ok, true);
  const e = r.encomenda;
  assert.strictEqual(e.TipoServico, 1);
  assert.strictEqual(e.CondFrete, 'CIF');
  assert.strictEqual(e.Volumes, 3);
  assert.strictEqual(e.Peso, 12.35);
  assert.strictEqual(e.DestCpfCnpj, '12345678000190');
  assert.strictEqual(e.DestEstado, 'PR');
  assert.strictEqual(e.DestCep, '86010000');
  assert.strictEqual(e.DestDdd, '43');
  assert.strictEqual(e.DestTelefone1, '998765432');
  assert.strictEqual(e.NFe.NfeData, '2026-09-13');
  assert.strictEqual(e.NFe.NfeValTotal, '1250.50');
  assert.strictEqual(e.NFe.NfeValProd, '1250.50');
});

test('encomenda — sem NF-e autorizada não vai, e diz por quê', () => {
  const r = W.montarEncomenda({ pedido: 'PV-000123', venda: VENDA, cliente: CLIENTE, nota: null });
  assert.strictEqual(r.ok, false);
  assert.match(r.problemas.join(' '), /NF-e autorizada/);
});

test('encomenda — cadastro incompleto lista tudo o que falta', () => {
  const r = W.montarEncomenda({ pedido: 'PV-1', venda: VENDA, cliente: { name: 'X', address: {} }, nota: { ...NOTA, chave: '123' } });
  assert.strictEqual(r.ok, false);
  const t = r.problemas.join(' | ');
  assert.match(t, /CPF\/CNPJ/);
  assert.match(t, /rua/);
  assert.match(t, /CEP/);
  assert.match(t, /chave de acesso/);
});

test('encomenda — sem número no endereço vai S/N, e textos são cortados no tamanho do manual', () => {
  const cliente = { ...CLIENTE, name: 'N'.repeat(60), address: { ...CLIENTE.address, number: '' } };
  const r = W.montarEncomenda({ pedido: 'PV-000123', venda: VENDA, cliente, nota: NOTA });
  assert.strictEqual(r.encomenda.DestEndNum, 'S/N');
  assert.strictEqual(r.encomenda.DestNome.length, 40);
});

// ── XML de envio ─────────────────────────────────────────
test('xml RegistraColeta — envelope, lote e caracteres escapados', () => {
  const { encomenda } = W.montarEncomenda({ pedido: 'PV-000123', venda: VENDA, cliente: CLIENTE, nota: NOTA, medida: { caixas: 1 } });
  const xml = W.xmlRegistraColeta({ codRemessa: 'LY20260914101010', encomendas: [encomenda, encomenda] });
  assert.match(xml, /<ns1:RegistraColeta>/);
  assert.match(xml, /arrayType="ns2:Encomenda\[2\]"/);
  assert.match(xml, /<CodRemessa xsi:type="xsd:string">LY20260914101010<\/CodRemessa>/);
  assert.match(xml, /<DestNome xsi:type="xsd:string">Maria &amp; Filhos Ltda<\/DestNome>/);
  assert.match(xml, /<NfeChave xsi:type="xsd:string">41260923078111000116550010000004561000004567<\/NfeChave>/);
  // peso ausente não vai como campo vazio
  assert.doesNotMatch(xml, /<Peso /);
});

test('xml ObterTracking — com e sem data', () => {
  assert.match(W.xmlObterTracking({ dataConsulta: '2026-09-14' }), /<DataConsulta xsi:type="xsd:date">2026-09-14<\/DataConsulta>/);
  assert.doesNotMatch(W.xmlObterTracking({}), /DataConsulta/);
});

// ── Respostas ────────────────────────────────────────────
const SOAP = corpo => `<?xml version="1.0" encoding="ISO-8859-1"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>${corpo}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test('resposta RegistraColeta — sucesso com protocolo', () => {
  const r = W.parseRegistraColeta(SOAP('<ns1:RegistraColetaResponse><RegistraColetaResponse><ItensProcessados xsi:type="xsd:nonNegativeInteger">2</ItensProcessados><ItensRejeitados>0</ItensRejeitados><CodigoProc>1</CodigoProc><NumProtocolo>998877</NumProtocolo></RegistraColetaResponse></ns1:RegistraColetaResponse>'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.processados, 2);
  assert.strictEqual(r.protocolo, '998877');
  assert.deepStrictEqual(r.erros, []);
});

test('resposta RegistraColeta — recusa parcial traz o pedido e o motivo', () => {
  const r = W.parseRegistraColeta(SOAP('<RegistraColetaResponse><ItensProcessados>1</ItensProcessados><ItensRejeitados>1</ItensRejeitados><ErrosIndividuais><item><Pedido>PV-000124</Pedido><CodigoErro>3</CodigoErro><DescricaoErro>Volume Duplicado</DescricaoErro></item></ErrosIndividuais><CodigoProc>5</CodigoProc><NumProtocolo>1</NumProtocolo></RegistraColetaResponse>'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.codigo_proc, 5);
  assert.deepStrictEqual(r.erros, [{ pedido: 'PV-000124', id_cliente: null, codigo: 3, descricao: 'Volume Duplicado' }]);
});

test('resposta — IP bloqueado vem como Fault, e o IP é lido', () => {
  const xml = SOAP('<SOAP-ENV:Fault><faultcode xsi:type="xsd:int">0</faultcode><faultstring xsi:type="xsd:string">Acesso Negado! Seu IP foi arquivado para controle: 179.190.104.85</faultstring></SOAP-ENV:Fault>');
  const r = W.parseRegistraColeta(xml);
  assert.strictEqual(r.ok, false);
  assert.match(r.mensagem, /Acesso Negado/);
  assert.strictEqual(r.ip_bloqueado, '179.190.104.85');
  assert.strictEqual(W.parseObterTracking(xml).ip_bloqueado, '179.190.104.85');
});

test('resposta ObterTracking — lotes, encomendas e status aninhados', () => {
  const r = W.parseObterTracking(SOAP(`
    <ns1:ObterTrackingResponse><ObterTrackingResponse>
      <CodigoProc>1</CodigoProc>
      <ArrayLoteRetorno><item>
        <CodRetorno>555</CodRetorno><DataGeracao>2026-09-14T10:00:00</DataGeracao>
        <ArrayEncomendaRetorno><item>
          <AWB>123456789012</AWB><Pedido>PV-000123</Pedido><NotaFiscal>456</NotaFiscal><NotaFiscalSerie>1</NotaFiscalSerie>
          <ArrayStatusTotal>
            <item><CodStatus>83</CodStatus><DescStatus>COLETA REALIZADA</DescStatus><DataStatus>2026-09-13T15:00:00</DataStatus></item>
            <item><CodStatus>102</CodStatus><DescStatus>TRANSFERENCIA PARA: LONDRINA</DescStatus><DataStatus>2026-09-14T08:00:00</DataStatus></item>
          </ArrayStatusTotal>
        </item></ArrayEncomendaRetorno>
      </item></ArrayLoteRetorno>
    </ObterTrackingResponse></ns1:ObterTrackingResponse>`));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lotes.length, 1);
  assert.strictEqual(r.lotes[0].cod_retorno, 555);
  const e = r.lotes[0].encomendas[0];
  assert.strictEqual(e.awb, '123456789012');
  assert.strictEqual(e.pedido, 'PV-000123');
  assert.deepStrictEqual(e.status.map(s => s.codigo), [83, 102]);
  assert.strictEqual(e.status[1].descricao, 'TRANSFERENCIA PARA: LONDRINA');
});

test('resposta ObterTracking — sem lote novo', () => {
  const r = W.parseObterTracking(SOAP('<ObterTrackingResponse><CodigoProc>1</CodigoProc></ObterTrackingResponse>'));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.lotes, []);
});

// ── Status e rastreio ────────────────────────────────────
test('status — só coleta, trânsito e entrega mudam a etapa', () => {
  assert.strictEqual(W.efeitoDoStatus(1), 'entregue');
  assert.strictEqual(W.efeitoDoStatus(83), 'coletado');
  assert.strictEqual(W.efeitoDoStatus(102), 'transito');
  assert.strictEqual(W.efeitoDoStatus(0), 'informativo');
  assert.strictEqual(W.efeitoDoStatus(6), 'ocorrencia');   // endereço não localizado
  assert.strictEqual(W.efeitoDoStatus(21), 'ocorrencia');  // ausente
});

test('link de rastreio — REID, pedido e nota', () => {
  assert.strictEqual(
    W.linkRastreio({ reid: '89443', pedido: 'PV-000123', notaFiscal: '456' }),
    'http://tracking.totalexpress.com.br/poupup_track.php?reid=89443&pedido=PV-000123&nfiscal=456',
  );
  assert.strictEqual(W.linkRastreio({ reid: '', pedido: 'PV-1' }), null);
});
