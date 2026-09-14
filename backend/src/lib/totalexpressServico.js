// ============================================================
// TOTAL EXPRESS NO FLUXO DO PEDIDO — quem envia, quando, e o que volta.
//
// lib/totalexpressWs.js fala com o webservice. Este arquivo decide o
// que falar: quais pedidos estão prontos para ir, o que gravar quando a
// Total Express aceita, e o que fazer com o rastreio que ela devolve.
//
// QUANDO UM PEDIDO ESTÁ PRONTO PARA IR:
//
//   · a transportadora dele é a Total Express;
//   · é entrega, e não retirada;
//   · está na expedição (embalagem finalizada até aguardando coleta);
//   · tem NF-e AUTORIZADA — a Total Express emite o CT-e a partir dela;
//   · ainda não foi transmitido (ela recusa volume duplicado).
//
// O RASTREIO ANDA O PEDIDO, MAS SÓ NA LOGÍSTICA. Coleta realizada leva o
// pedido a "Coleta realizada", transferência a "Em trânsito", entrega a
// "Pedido entregue". Nunca mexe num pedido que ainda está na produção:
// status de transportadora não prova que a caixa ficou pronta.
// ============================================================
// O banco entra só quando alguém for a ele — assim o módulo carrega em
// teste sem SUPABASE_URL, como lib/totalexpress.js.
let _supabase;
const db = () => (_supabase ||= require('../config/supabase'));
const W = require('./totalexpressWs');

const STATUS_PRONTO_PARA_ENVIO = ['embalagem_finalizada', 'aguardando_logistica', 'aguardando_coleta', 'coleta_processo'];

// A régua da logística, na ordem. O rastreio só avança dentro dela.
const REGUA_LOGISTICA = [
  'embalagem_finalizada', 'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'em_transito', 'aguardando_entrega', 'entregue', 'pedido_finalizado',
];
const ALVO_DO_EFEITO = { coletado: 'mercadoria_coletada', transito: 'em_transito', entregue: 'entregue' };

const posicao = s => REGUA_LOGISTICA.indexOf(s);

/** As credenciais do webservice, já resolvidas pelo getFreteConfig. */
function credenciais(cfg) {
  return {
    url: cfg.tex_ws_url || W.URL_PADRAO,
    usuario: cfg.tex_ws_user || '',
    senha: cfg.tex_ws_password || '',
    reid: cfg.tex_reid || '',
    servico: Number(cfg.tex_servico) || 1,
    natureza: cfg.tex_natureza || 'COPOS PERSONALIZADOS',
  };
}
const configurado = cred => !!(cred.usuario && cred.senha);

async function configDoTenant(tenantId) {
  const { getFreteConfig } = require('./shipping');
  const cfg = await getFreteConfig(tenantId);
  return { cfg, cred: credenciais(cfg) };
}

/**
 * Qual transportadora cadastrada É a Total Express.
 *
 * Escolhida em Configurações (`tex_carrier_id`). Sem escolha, vale o nome:
 * a Lyon cadastra transportadora à mão, e exigir o id antes de a
 * primeira coleta sair seria mais um passo que ninguém sabe que existe.
 */
async function transportadorasTotalExpress(tenantId, cfg) {
  if (cfg.tex_carrier_id) return [cfg.tex_carrier_id];
  const { data } = await db().from('TRANSPORTADORAS')
    .select('id, name, trade_name').eq('tenant_id', tenantId);
  return (data || [])
    .filter(t => /total\s*express/i.test(`${t.name || ''} ${t.trade_name || ''}`))
    .map(t => t.id);
}

async function tabelaExiste(nome) {
  const { error } = await db().from(nome).select('id', { head: true, count: 'exact' }).limit(1);
  return !error;
}

/** Acrescenta um marco ao histórico do pedido. */
async function gravarMarco(tenantId, saleId, marco) {
  const { data: v } = await db().from('VENDAS').select('production_log')
    .eq('id', saleId).eq('tenant_id', tenantId).maybeSingle();
  const log = Array.isArray(v?.production_log) ? [...v.production_log] : [];
  log.push({ stage: 'expedicao', at: new Date().toISOString(), ...marco });
  await db().from('VENDAS').update({ production_log: log }).eq('id', saleId).eq('tenant_id', tenantId);
  return log;
}

// ════════════════════════════════════════════════════════════
// OS PEDIDOS PRONTOS PARA TRANSMITIR
// ════════════════════════════════════════════════════════════
async function pendentes(tenantId) {
  const { cfg, cred } = await configDoTenant(tenantId);
  const { codigoPedido } = require('./pedidoCodigo');
  const A = require('./atencao');
  const { medirPedido } = require('./embalagem');

  const base = { configurado: configurado(cred), servico: W.SERVICOS[cred.servico] || null };

  const ids = await transportadorasTotalExpress(tenantId, cfg);
  if (!ids.length) return { ...base, transportadora_cadastrada: false, pedidos: [] };
  if (!(await tabelaExiste('TOTALEXPRESS_ENVIOS'))) {
    return { ...base, transportadora_cadastrada: true, migracao_pendente: true, pedidos: [] };
  }

  const { data: vendas, error } = await db().from('VENDAS')
    .select('id, number, status, carrier_id, delivery_mode, subtotal, discount, total, production_log, '
          + 'CLIENTES(name, cpf_cnpj, phone, mobile, email, address), VENDA_ITENS(product_id, quantity)')
    .eq('tenant_id', tenantId).in('carrier_id', ids).in('status', STATUS_PRONTO_PARA_ENVIO)
    .order('number');
  if (error) throw error;

  const lista = (vendas || []).filter(v => !A.ehRetirada(v));
  if (!lista.length) return { ...base, transportadora_cadastrada: true, pedidos: [] };
  const saleIds = lista.map(v => v.id);

  const [{ data: enviados }, { data: notas }] = await Promise.all([
    db().from('TOTALEXPRESS_ENVIOS').select('sale_id')
      .eq('tenant_id', tenantId).eq('situacao', 'enviado').in('sale_id', saleIds),
    db().from('NOTAS_FISCAIS')
      .select('sale_id, numero, serie, chave, total, status, authorized_at, created_at, response')
      .eq('tenant_id', tenantId).eq('status', 'autorizado').in('sale_id', saleIds)
      .order('created_at', { ascending: false }),
  ]);
  const jaEnviado = new Set((enviados || []).map(e => e.sale_id));
  const notaDe = {};
  for (const n of notas || []) if (!notaDe[n.sale_id]) notaDe[n.sale_id] = n;

  const pedidos = [];
  for (const v of lista) {
    if (jaEnviado.has(v.id)) continue;
    const itens = (v.VENDA_ITENS || []).map(i => ({ product_id: i.product_id, quantity: i.quantity }));
    const medida = itens.length ? await medirPedido(tenantId, itens) : {};
    const nota = notaDe[v.id]
      ? { ...notaDe[v.id], data_emissao: notaDe[v.id].response?.data_emissao || null }
      : null;
    const codigo = codigoPedido(v.number);
    const m = W.montarEncomenda({ pedido: codigo, venda: v, cliente: v.CLIENTES, nota, medida, cfg: cred });
    pedidos.push({
      id: v.id,
      codigo,
      cliente: v.CLIENTES?.name || null,
      cidade: v.CLIENTES?.address?.city || null,
      uf: v.CLIENTES?.address?.state || null,
      status_label: A.infoStatus(v.status).label,
      nota: nota ? nota.numero : null,
      volumes: m.ok ? m.encomenda.Volumes : null,
      peso: m.ok ? m.encomenda.Peso : null,
      pronto: m.ok,
      problemas: m.problemas || [],
      _encomenda: m.ok ? m.encomenda : null,
      _nota_numero: nota ? nota.numero : null,
    });
  }
  return { ...base, transportadora_cadastrada: true, pedidos };
}

// ════════════════════════════════════════════════════════════
// TRANSMITIR O LOTE
// ════════════════════════════════════════════════════════════
function codigoRemessa(agora = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `LY${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}`
    + `${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`;
}

async function registrarColeta(tenantId, saleIds, quem = 'Usuário') {
  const { cred } = await configDoTenant(tenantId);
  if (!configurado(cred)) {
    const e = new Error('Configure usuário e senha do webservice da Total Express em Configurações → Frete.');
    e.status = 400; throw e;
  }

  const pend = await pendentes(tenantId);
  if (pend.migracao_pendente) {
    const e = new Error('A migração 120 (envios da Total Express) ainda não foi aplicada no banco.');
    e.status = 409; throw e;
  }
  const pedidos = pend.pedidos.filter(p => p.pronto && (!saleIds?.length || saleIds.includes(p.id)));
  if (!pedidos.length) {
    const e = new Error('Nenhum pedido selecionado está pronto para enviar à Total Express.');
    e.status = 400; throw e;
  }

  const remessaBase = codigoRemessa();
  const resultado = { remessa: remessaBase, enviados: [], rejeitados: [], falhas: [] };

  for (let i = 0; i < pedidos.length; i += W.LOTE_MAXIMO) {
    const bloco = pedidos.slice(i, i + W.LOTE_MAXIMO);
    const codRemessa = i === 0 ? remessaBase : `${remessaBase}-${i / W.LOTE_MAXIMO + 1}`;

    let r;
    try {
      r = await W.registraColeta(cred, { codRemessa, encomendas: bloco.map(p => p._encomenda) });
    } catch (err) {
      resultado.falhas.push({ remessa: codRemessa, mensagem: err.name === 'AbortError' ? 'A Total Express não respondeu a tempo.' : err.message, pedidos: bloco.map(p => p.codigo) });
      continue;
    }

    // Transmissão recusada inteira: nada foi registrado do lado deles,
    // então nada é gravado como enviado aqui.
    if (!r.ok) {
      resultado.falhas.push({ remessa: codRemessa, mensagem: r.mensagem, ip_bloqueado: r.ip_bloqueado || null, pedidos: bloco.map(p => p.codigo) });
      continue;
    }

    const recusa = new Map(r.erros.map(e => [e.pedido, e]));
    for (const p of bloco) {
      const erro = recusa.get(p._encomenda.Pedido);
      const link = W.linkRastreio({ reid: cred.reid, pedido: p._encomenda.Pedido, notaFiscal: p._nota_numero });

      if (erro) {
        await db().from('TOTALEXPRESS_ENVIOS').insert({
          tenant_id: tenantId, sale_id: p.id, pedido: p._encomenda.Pedido, cod_remessa: codRemessa,
          situacao: 'rejeitado', erro: erro.descricao, resposta: { codigo_proc: r.codigo_proc, erro }, enviado_por: quem,
        });
        resultado.rejeitados.push({ pedido: p.codigo, erro: erro.descricao });
        continue;
      }

      const { error } = await db().from('TOTALEXPRESS_ENVIOS').insert({
        tenant_id: tenantId, sale_id: p.id, pedido: p._encomenda.Pedido, cod_remessa: codRemessa,
        protocolo: r.protocolo, situacao: 'enviado', link_rastreio: link,
        resposta: { codigo_proc: r.codigo_proc, processados: r.processados, protocolo: r.protocolo }, enviado_por: quem,
      });
      if (error) console.error('[total-express] envio aceito, mas não gravado:', p.codigo, error.message);

      await gravarMarco(tenantId, p.id, {
        action: 'total_express_enviado', user: quem,
        protocolo: r.protocolo, remessa: codRemessa, link_rastreio: link,
        volumes: p._encomenda.Volumes, peso: p._encomenda.Peso,
      });
      resultado.enviados.push({ pedido: p.codigo, protocolo: r.protocolo, link_rastreio: link });
    }
  }

  return resultado;
}

// ════════════════════════════════════════════════════════════
// O RASTREIO
// ════════════════════════════════════════════════════════════

/** Leva o pedido até `alvo`, passo a passo pelo motor do fluxo. */
async function avancarAte(tenantId, saleId, alvo, detalhe) {
  const { carregarParaFluxo, gravarPasso } = require('./fluxoCarga');
  const F = require('./fluxoPedido');
  const req = { user: { id: null, name: 'Total Express (rastreio)' } };
  let passos = 0;

  for (let i = 0; i < 6; i++) {
    const carga = await carregarParaFluxo(tenantId, saleId);
    if (!carga) break;
    const atual = carga.venda.status;
    // Fora da régua da logística (ainda na produção, ou encerrado de outro
    // jeito): o rastreio não mexe.
    if (posicao(atual) < 0 || posicao(atual) >= posicao(alvo)) break;

    const passo = F.avancar(carga.venda, carga.aplicaveis, null, req,
      `Atualizado pelo rastreio da Total Express: ${detalhe}`, { automatico: true });
    if (passo.erro) break;
    await gravarPasso(tenantId, saleId, passo);
    passos++;
  }
  return passos;
}

async function acharEnvio(tenantId, pedido) {
  const { data } = await db().from('TOTALEXPRESS_ENVIOS')
    .select('id, sale_id, awb, ultimo_status_codigo, ultimo_status_em, link_rastreio')
    .eq('tenant_id', tenantId).eq('situacao', 'enviado').eq('pedido', pedido)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function aplicarEncomenda(tenantId, cred, enc) {
  const envio = enc.pedido ? await acharEnvio(tenantId, enc.pedido) : null;
  if (!envio) return { encontrado: false };

  const status = [...(enc.status || [])].filter(s => s.codigo !== null)
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
  const ultimo = status[status.length - 1] || null;

  // O histórico: um marco por status novo (o mesmo lote pode chegar duas
  // vezes quando se consulta por data).
  const { data: v } = await db().from('VENDAS').select('production_log, tracking_code')
    .eq('id', envio.sale_id).eq('tenant_id', tenantId).maybeSingle();
  const log = Array.isArray(v?.production_log) ? [...v.production_log] : [];
  const vistos = new Set(log.filter(e => e.action === 'total_express_status').map(e => `${e.codigo}|${e.data_status}`));
  let novos = 0;
  for (const s of status) {
    const chave = `${s.codigo}|${s.data}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    log.push({
      stage: 'expedicao', action: 'total_express_status', at: new Date().toISOString(),
      user: 'Total Express (rastreio)', codigo: s.codigo, descricao: s.descricao,
      data_status: s.data, efeito: W.efeitoDoStatus(s.codigo), awb: enc.awb || null,
    });
    novos++;
  }

  const patchVenda = {};
  if (novos) patchVenda.production_log = log;
  if (enc.awb && !v?.tracking_code) patchVenda.tracking_code = enc.awb;
  if (Object.keys(patchVenda).length) {
    await db().from('VENDAS').update(patchVenda).eq('id', envio.sale_id).eq('tenant_id', tenantId);
  }

  const link = W.linkRastreio({ reid: cred.reid, pedido: enc.pedido, notaFiscal: enc.nota_fiscal }) || envio.link_rastreio;
  await db().from('TOTALEXPRESS_ENVIOS').update({
    awb: enc.awb || envio.awb,
    link_rastreio: link,
    ...(ultimo ? { ultimo_status_codigo: ultimo.codigo, ultimo_status: ultimo.descricao, ultimo_status_em: ultimo.data } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', envio.id);

  // A etapa: o efeito mais avançado entre os status recebidos.
  const ordem = ['coletado', 'transito', 'entregue'];
  const efeito = status.map(s => W.efeitoDoStatus(s.codigo))
    .filter(e => ordem.includes(e))
    .sort((a, b) => ordem.indexOf(b) - ordem.indexOf(a))[0];
  const avancos = efeito
    ? await avancarAte(tenantId, envio.sale_id, ALVO_DO_EFEITO[efeito], ultimo?.descricao || efeito)
    : 0;

  return { encontrado: true, novos, avancos };
}

/**
 * Busca os lotes novos e aplica. O lote cru é gravado ANTES de aplicar:
 * sem data, o ObterTracking consome o lote, e um erro no meio do caminho
 * perderia o status para sempre se ele não estivesse guardado.
 */
async function sincronizarRastreio(tenantId, { dataConsulta } = {}) {
  const { cred } = await configDoTenant(tenantId);
  if (!configurado(cred)) return { ok: false, mensagem: 'Webservice da Total Express não configurado.' };
  if (!(await tabelaExiste('TOTALEXPRESS_LOTES'))) {
    return { ok: false, mensagem: 'A migração 120 (lotes de rastreio) ainda não foi aplicada no banco.' };
  }

  const r = await W.obterTracking(cred, { dataConsulta });
  if (!r.ok) return { ok: false, mensagem: r.mensagem, ip_bloqueado: r.ip_bloqueado || null };

  const resumo = { ok: true, lotes: r.lotes.length, encomendas: 0, status_novos: 0, pedidos_avancados: 0, nao_encontrados: [] };

  for (const lote of r.lotes) {
    if (lote.cod_retorno !== null) {
      await db().from('TOTALEXPRESS_LOTES').upsert({
        tenant_id: tenantId, cod_retorno: lote.cod_retorno,
        data_geracao: lote.data_geracao, conteudo: lote,
      }, { onConflict: 'tenant_id,cod_retorno' });
    }
    let erroLote = null;
    for (const enc of lote.encomendas) {
      resumo.encomendas++;
      try {
        const a = await aplicarEncomenda(tenantId, cred, enc);
        if (!a.encontrado) { resumo.nao_encontrados.push(enc.pedido); continue; }
        resumo.status_novos += a.novos;
        if (a.avancos) resumo.pedidos_avancados++;
      } catch (err) {
        erroLote = err.message;
        console.error('[total-express] rastreio de', enc.pedido, 'falhou:', err.message);
      }
    }
    if (lote.cod_retorno !== null) {
      await db().from('TOTALEXPRESS_LOTES')
        .update({ processado_em: new Date().toISOString(), erro: erroLote })
        .eq('tenant_id', tenantId).eq('cod_retorno', lote.cod_retorno);
    }
  }
  return resumo;
}

// ════════════════════════════════════════════════════════════
// DIAGNÓSTICO E AGENDAMENTO
// ════════════════════════════════════════════════════════════
async function diagnostico(tenantId) {
  const { cfg, cred } = await configDoTenant(tenantId);
  const [ip, transportadoras, acesso] = await Promise.all([
    W.ipDeSaida(),
    transportadorasTotalExpress(tenantId, cfg),
    configurado(cred) ? W.testarAcesso(cred) : Promise.resolve(null),
  ]);
  return {
    configurado: configurado(cred),
    usuario: cred.usuario || null,
    reid: cred.reid || null,
    servico: cred.servico,
    servico_nome: W.SERVICOS[cred.servico] || null,
    url: cred.url,
    ip_do_servidor: ip,
    transportadora_cadastrada: transportadoras.length > 0,
    migracao_aplicada: await tabelaExiste('TOTALEXPRESS_ENVIOS'),
    acesso,
  };
}

/**
 * De hora em hora, para cada empresa com o webservice configurado e com
 * encomenda ainda não entregue. O manual gera lotes no mínimo a cada
 * hora; consultar mais que isso só pesa no serviço deles.
 */
let agendado = false;
function iniciarAgendamento() {
  if (agendado || process.env.TOTALEXPRESS_RASTREIO_AUTOMATICO === 'false') return;
  agendado = true;

  const rodar = async () => {
    try {
      if (!(await tabelaExiste('TOTALEXPRESS_ENVIOS'))) return;
      const { data: empresas } = await db().from('EMPRESAS').select('id, settings');
      for (const e of empresas || []) {
        const f = e.settings?.frete || {};
        if (!f.tex_ws_user || !f.tex_ws_password) continue;
        const { count } = await db().from('TOTALEXPRESS_ENVIOS')
          .select('id', { head: true, count: 'exact' })
          .eq('tenant_id', e.id).eq('situacao', 'enviado')
          .or('ultimo_status_codigo.is.null,ultimo_status_codigo.neq.1');
        if (!count) continue;
        const r = await sincronizarRastreio(e.id);
        if (!r.ok) console.error('[total-express] rastreio automático:', r.mensagem);
        else if (r.encomendas) console.log(`[total-express] rastreio: ${r.encomendas} encomenda(s), ${r.status_novos} status novo(s)`);
      }
    } catch (err) {
      console.error('[total-express] rastreio automático falhou:', err.message);
    }
  };

  setTimeout(rodar, 3 * 60 * 1000);
  setInterval(rodar, 60 * 60 * 1000);
}

module.exports = {
  pendentes, registrarColeta, sincronizarRastreio, diagnostico, iniciarAgendamento,
  credenciais, codigoRemessa, REGUA_LOGISTICA,
};
