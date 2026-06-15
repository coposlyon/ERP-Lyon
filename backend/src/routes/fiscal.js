const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const focus    = require('../lib/focusnfe');

// ── Helpers ───────────────────────────────────────────────

async function getConfig(tenantId) {
  const { data } = await supabase
    .from('CONFIG_FISCAL').select('*')
    .eq('tenant_id', tenantId).maybeSingle();
  return data;
}

function activeToken(cfg) {
  return cfg.ambiente === 'producao' ? cfg.focus_token_producao : cfg.focus_token_homologacao;
}

function maskToken(t) {
  if (!t) return null;
  return t.length > 4 ? '••••••••' + t.slice(-4) : '••••';
}

// Atualiza o registro local com a resposta da consulta na Focus
async function syncNota(nota, cfg) {
  const token = activeToken(cfg);
  const { data } = await focus.consultarNfe(nota.ambiente || cfg.ambiente, token, nota.ref);
  if (!data) return nota;

  const upd = {
    status:   data.status || nota.status,
    numero:   data.numero  != null ? String(data.numero) : nota.numero,
    serie:    data.serie   != null ? String(data.serie)  : nota.serie,
    chave:    data.chave_nfe || nota.chave,
    motivo:   data.mensagem_sefaz || data.motivo || nota.motivo,
    danfe_url: focus.fileUrl(nota.ambiente || cfg.ambiente, data.caminho_danfe) || nota.danfe_url,
    xml_url:   focus.fileUrl(nota.ambiente || cfg.ambiente, data.caminho_xml_nota_fiscal) || nota.xml_url,
    response: data,
  };
  if (data.status === 'autorizado' && !nota.authorized_at) upd.authorized_at = new Date().toISOString();
  if (data.status === 'cancelado'  && !nota.cancelled_at)  upd.cancelled_at  = new Date().toISOString();

  const { data: updated } = await supabase
    .from('NOTAS_FISCAIS').update(upd)
    .eq('id', nota.id).select().single();
  return updated || { ...nota, ...upd };
}

// ── Configuração fiscal ───────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg) return res.json(null);
    const isAdmin = req.userProfile?.role === 'admin';
    res.json({
      ...cfg,
      focus_token_homologacao: isAdmin ? cfg.focus_token_homologacao : maskToken(cfg.focus_token_homologacao),
      focus_token_producao:    isAdmin ? cfg.focus_token_producao    : maskToken(cfg.focus_token_producao),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem alterar a configuração fiscal' });
  }
  const allowed = [
    'cnpj','razao_social','nome_fantasia','inscricao_estadual','inscricao_municipal',
    'regime_tributario','logradouro','numero','complemento','bairro','municipio','uf','cep',
    'codigo_municipio','telefone','ncm_padrao','cfop_interno','cfop_interestadual',
    'csosn_padrao','cst_padrao','pis_cst','cofins_cst','natureza_operacao',
    'ambiente','focus_token_homologacao','focus_token_producao',
  ];
  const upd = { tenant_id: req.tenantId, updated_at: new Date().toISOString() };
  for (const k of allowed) if (req.body[k] !== undefined) upd[k] = req.body[k];

  try {
    const { data, error } = await supabase
      .from('CONFIG_FISCAL')
      .upsert(upd, { onConflict: 'tenant_id' })
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'fiscal', 'config', { ambiente: data.ambiente, cnpj: data.cnpj });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Listagem ──────────────────────────────────────────────

router.get('/invoices', async (req, res) => {
  const { page = 1, limit = 20, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;
  try {
    let query = supabase
      .from('NOTAS_FISCAIS')
      .select('*, VENDAS(number, CLIENTES(name))', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status)     query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date)   query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vendas confirmadas sem nota autorizada (para o modal de emissão)
router.get('/sales-pending', async (req, res) => {
  try {
    const { data: sales } = await supabase
      .from('VENDAS')
      .select('id, number, total, created_at, CLIENTES(name, cpf_cnpj)')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: notas } = await supabase
      .from('NOTAS_FISCAIS')
      .select('sale_id, status')
      .eq('tenant_id', req.tenantId)
      .in('status', ['autorizado', 'processando_autorizacao']);

    const taken = new Set((notas || []).map(n => n.sale_id));
    res.json((sales || []).filter(s => !taken.has(s.id)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Emissão ───────────────────────────────────────────────

router.post('/emit/:sale_id', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg || !cfg.cnpj || !activeToken(cfg)) {
      return res.status(400).json({
        error: 'Configuração fiscal incompleta. Preencha CNPJ, endereço e o token Focus NFe em Fiscal → Configuração.',
        code: 'FISCAL_CONFIG_MISSING',
      });
    }
    if (!cfg.logradouro || !cfg.municipio || !cfg.uf || !cfg.codigo_municipio) {
      return res.status(400).json({ error: 'Endereço do emitente incompleto (logradouro, município, UF e código IBGE são obrigatórios).' });
    }

    // Venda + itens + cliente
    const { data: sale } = await supabase
      .from('VENDAS')
      .select('*, CLIENTES(*)')
      .eq('id', req.params.sale_id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });

    const { data: items } = await supabase
      .from('VENDA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit, ncm, cfop, cst)')
      .eq('sale_id', sale.id);
    if (!items?.length) return res.status(400).json({ error: 'Venda sem itens' });

    const cust = sale.CLIENTES;
    if (!cust?.cpf_cnpj) {
      return res.status(400).json({ error: 'NF-e exige cliente identificado com CPF/CNPJ. Edite a venda ou o cadastro do cliente.' });
    }
    const addr = cust.address || {};
    if (!addr.street || !addr.city || !addr.state) {
      return res.status(400).json({ error: `Endereço do cliente ${cust.name} incompleto (rua, cidade e UF são obrigatórios para NF-e).` });
    }

    const docDest   = String(cust.cpf_cnpj).replace(/\D/g, '');
    const interna   = String(addr.state).toUpperCase() === String(cfg.uf).toUpperCase();
    const cfopPad   = interna ? (cfg.cfop_interno || '5102') : (cfg.cfop_interestadual || '6102');
    const simples   = (cfg.regime_tributario || 'simples') === 'simples';

    // CFOP por destino: o CFOP do produto é tratado como interno (5xxx);
    // em venda interestadual o 1º dígito vira 6 automaticamente (5101→6101).
    const cfopByDest = (cfopProd) => {
      let c = String(cfopProd || '').replace(/\D/g, '');
      if (c.length < 4) return cfopPad;            // sem CFOP no produto → padrão da config
      if (interna && c[0] === '6') c = '5' + c.slice(1);
      else if (!interna && c[0] === '5') c = '6' + c.slice(1);
      return c;
    };

    const payload = {
      natureza_operacao: cfg.natureza_operacao || 'Venda de mercadoria',
      data_emissao:      new Date().toISOString(),
      tipo_documento:    1,
      finalidade_emissao: 1,
      consumidor_final:  docDest.length === 11 ? 1 : 0,
      presenca_comprador: 1,
      local_destino:     interna ? 1 : 2,
      cnpj_emitente:     String(cfg.cnpj).replace(/\D/g, ''),

      nome_destinatario: cust.name,
      ...(docDest.length === 11 ? { cpf_destinatario: docDest } : { cnpj_destinatario: docDest }),
      ...(docDest.length === 14 ? { indicador_inscricao_estadual_destinatario: 9 } : {}),
      logradouro_destinatario: addr.street,
      numero_destinatario:     addr.number || 'S/N',
      bairro_destinatario:     addr.neighborhood || 'Centro',
      municipio_destinatario:  addr.city,
      uf_destinatario:         String(addr.state).toUpperCase(),
      cep_destinatario:        String(addr.zip || '').replace(/\D/g, '') || undefined,

      valor_frete: 0,
      valor_seguro: 0,
      valor_total: Number(sale.total),
      valor_produtos: Number(sale.subtotal),
      modalidade_frete: 9, // sem frete

      items: items.map((it, idx) => {
        const p = it.PRODUTOS || {};
        const base = {
          numero_item:               idx + 1,
          codigo_produto:            p.code || p.id,
          descricao:                 p.name,
          codigo_ncm:                (p.ncm || cfg.ncm_padrao || '39241000').replace(/\D/g, ''),
          cfop:                      cfopByDest(p.cfop),
          unidade_comercial:         p.unit || 'UN',
          quantidade_comercial:      Number(it.quantity),
          valor_unitario_comercial:  Number(it.unit_price),
          unidade_tributavel:        p.unit || 'UN',
          quantidade_tributavel:     Number(it.quantity),
          valor_unitario_tributavel: Number(it.unit_price),
          valor_bruto:               Number(it.quantity) * Number(it.unit_price),
          valor_desconto:            Number(it.discount) || undefined,
          icms_origem:               0,
          pis_situacao_tributaria:    cfg.pis_cst || '49',
          cofins_situacao_tributaria: cfg.cofins_cst || '49',
        };
        if (simples) {
          base.icms_situacao_tributaria = cfg.csosn_padrao || '102';
        } else {
          base.icms_situacao_tributaria = p.cst || cfg.cst_padrao || '00';
        }
        return base;
      }),
    };

    // desconto no total da nota
    if (Number(sale.discount) > 0) payload.valor_desconto = Number(sale.discount);

    const ref = `nfe-${req.tenantId.slice(0, 8)}-${sale.number}-${Date.now().toString(36)}`;
    const token = activeToken(cfg);
    const { ok, status, data } = await focus.emitirNfe(cfg.ambiente, token, ref, payload);

    if (!ok && status !== 202) {
      const msg = data?.mensagem || (Array.isArray(data?.erros) ? data.erros.map(e => e.mensagem).join('; ') : null) || `Focus NFe retornou HTTP ${status}`;
      return res.status(400).json({ error: msg, focus: data });
    }

    const { data: nota, error } = await supabase
      .from('NOTAS_FISCAIS')
      .insert({
        tenant_id:    req.tenantId,
        sale_id:      sale.id,
        ref,
        tipo:         'nfe',
        ambiente:     cfg.ambiente,
        status:       data?.status || 'processando_autorizacao',
        total:        sale.total,
        destinatario: cust.name,
        response:     data || null,
        user_id:      req.user.id,
      })
      .select().single();
    if (error) throw error;

    audit(req, 'create', 'fiscal', nota.id, { ref, venda: sale.number, total: sale.total, ambiente: cfg.ambiente });
    res.status(201).json(nota);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Consulta de status ────────────────────────────────────

router.post('/invoices/:id/refresh', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg) return res.status(400).json({ error: 'Configuração fiscal ausente' });

    const { data: nota } = await supabase
      .from('NOTAS_FISCAIS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });

    const updated = await syncNota(nota, cfg);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cancelamento ──────────────────────────────────────────

router.post('/invoices/:id/cancel', async (req, res) => {
  const { justificativa } = req.body;
  if (!justificativa || justificativa.trim().length < 15) {
    return res.status(400).json({ error: 'Justificativa deve ter pelo menos 15 caracteres' });
  }
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg) return res.status(400).json({ error: 'Configuração fiscal ausente' });

    const { data: nota } = await supabase
      .from('NOTAS_FISCAIS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'autorizado') {
      return res.status(400).json({ error: 'Só é possível cancelar notas autorizadas' });
    }

    const token = activeToken(cfg);
    const { ok, data } = await focus.cancelarNfe(nota.ambiente || cfg.ambiente, token, nota.ref, justificativa.trim());
    if (!ok && data?.status !== 'cancelado') {
      return res.status(400).json({ error: data?.mensagem || 'Falha ao cancelar na SEFAZ', focus: data });
    }

    const { data: updated } = await supabase
      .from('NOTAS_FISCAIS')
      .update({ status: 'cancelado', cancelled_at: new Date().toISOString(), motivo: justificativa.trim() })
      .eq('id', nota.id).select().single();

    audit(req, 'delete', 'fiscal', nota.id, { ref: nota.ref, justificativa: justificativa.trim() });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
