const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const es       = require('../lib/esocial');

/**
 * eSocial — configuração, cadastros e fila de eventos.
 *
 * O eSocial é assíncrono: enviar NÃO significa aceito. O ciclo é
 * enviar (recebe protocolo) → consultar (recebe recibo ou rejeição).
 * As rotas abaixo espelham isso; nada aqui marca sucesso sem recibo.
 */

// ── Helpers ───────────────────────────────────────────────

async function getConfig(tenantId) {
  const { data } = await supabase
    .from('CONFIG_ESOCIAL').select('*')
    .eq('tenant_id', tenantId).maybeSingle();
  return data;
}

function maskToken(t) {
  if (!t) return null;
  return t.length > 4 ? '••••••••' + t.slice(-4) : '••••';
}

function isAdmin(req) {
  return req.userProfile?.role === 'admin';
}

// Cria (ou reaproveita) a linha da fila para um evento.
async function registrarEvento(req, { tipo, ref_type, ref_id, per_apur, payload, cfg }) {
  const { data, error } = await supabase
    .from('ESOCIAL_EVENTOS')
    .insert({
      tenant_id: req.tenantId,
      tipo,
      ambiente:  cfg.ambiente,
      ref_type,
      ref_id:    ref_id || null,
      per_apur:  per_apur || null,
      payload,
      status:    'pendente',
      user_id:   req.user?.id || null,
    })
    .select().single();
  if (error) throw error;
  return data;
}

// Envia ao gateway e grava o resultado. Usada tanto pelo envio novo
// quanto pelo reprocessamento.
async function transmitir(req, evento, cfg) {
  await supabase.from('ESOCIAL_EVENTOS')
    .update({ status: 'enviando', updated_at: new Date().toISOString() })
    .eq('id', evento.id).eq('tenant_id', req.tenantId);

  const { ok, data } = await es.enviarEvento(cfg, evento.tipo, evento.payload);

  // Falha de rede/gateway: volta para 'pendente' e conta a tentativa.
  // O evento NÃO se perde e pode ser reenviado.
  if (!ok) {
    const upd = {
      status:     'pendente',
      tentativas: (evento.tentativas || 0) + 1,
      erro_msg:   data?.erro || data?.mensagem || 'Falha ao enviar ao gateway',
      retorno:    data || null,
      updated_at: new Date().toISOString(),
    };
    const { data: updated } = await supabase.from('ESOCIAL_EVENTOS')
      .update(upd).eq('id', evento.id).eq('tenant_id', req.tenantId).select().single();
    return updated || { ...evento, ...upd };
  }

  const norm = es.normalizarRetorno(data);
  const upd = {
    // Alguns gateways já devolvem o resultado no envio; a maioria só o
    // protocolo. normalizarRetorno cobre os dois casos.
    status:     norm.status === 'sucesso' ? 'sucesso' : (norm.status || 'aguardando_retorno'),
    protocolo:  norm.protocolo || data?.protocolo || null,
    recibo:     norm.recibo || null,
    erro_msg:   norm.erro_msg || null,
    retorno:    data || null,
    xml:        data?.xml || data?.xmlAssinado || null,
    tentativas: (evento.tentativas || 0) + 1,
    sent_at:    new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (upd.status === 'sucesso' || upd.status === 'rejeitado') {
    upd.processed_at = new Date().toISOString();
  }

  const { data: updated } = await supabase.from('ESOCIAL_EVENTOS')
    .update(upd).eq('id', evento.id).eq('tenant_id', req.tenantId).select().single();
  return updated || { ...evento, ...upd };
}

// Ao aceitar um S-2200/S-2299, reflete a situação no cadastro.
async function refletirSituacao(tenantId, evento) {
  if (evento.status !== 'sucesso' || evento.ref_type !== 'trabalhador' || !evento.ref_id) return;
  const situacao = evento.tipo === 'S-2299' ? 'desligado'
                 : evento.tipo === 'S-2200' ? 'ativo'
                 : null;
  if (!situacao) return;
  await supabase.from('RH_ESOCIAL_TRABALHADOR')
    .update({ situacao, updated_at: new Date().toISOString() })
    .eq('id', evento.ref_id).eq('tenant_id', tenantId);
}

// ── Configuração ──────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg) return res.json(null);
    res.json({
      ...cfg,
      provider_token_restrita: isAdmin(req) ? cfg.provider_token_restrita : maskToken(cfg.provider_token_restrita),
      provider_token_producao: isAdmin(req) ? cfg.provider_token_producao : maskToken(cfg.provider_token_producao),
      pendencias: es.validarConfig(cfg),
      configurado: es.configurado(cfg),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar a configuração do eSocial' });
  }
  const allowed = [
    'provider','provider_base_url','ambiente','provider_token_restrita','provider_token_producao',
    'provider_empregador_id','tp_insc','nr_insc','razao_social','classif_trib','nat_jur',
    'ind_coop','ind_constr','ind_desf','ind_opc_cp','ind_porte','ind_opt_reg_eletron',
    'ind_ent_ed','ind_ett','nr_reg_ett','nm_ctt','cpf_ctt','fone_ctt','email_ctt',
    'cnae_preponderante','aliq_rat','fap','ini_valid',
  ];
  const upd = { tenant_id: req.tenantId, updated_at: new Date().toISOString() };
  for (const k of allowed) if (req.body[k] !== undefined) upd[k] = req.body[k];

  if (upd.ambiente && !['restrita','producao'].includes(upd.ambiente)) {
    return res.status(400).json({ error: "Ambiente deve ser 'restrita' ou 'producao'" });
  }

  try {
    const { data, error } = await supabase
      .from('CONFIG_ESOCIAL').upsert(upd, { onConflict: 'tenant_id' })
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'esocial', 'config', { ambiente: data.ambiente, provider: data.provider });
    res.json({ ...data, pendencias: es.validarConfig(data) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Trabalhadores (dados que o eSocial exige) ─────────────

router.get('/trabalhadores', async (req, res) => {
  const { situacao, employee_id } = req.query;
  try {
    let q = supabase.from('RH_ESOCIAL_TRABALHADOR')
      .select('*, CLIENTES(id,name)')
      .eq('tenant_id', req.tenantId).order('nome');
    if (situacao)    q = q.eq('situacao', situacao);
    if (employee_id) q = q.eq('employee_id', employee_id);
    const { data, error } = await q;
    if (error) throw error;
    // pendencias: o que falta para o evento ser aceito pelo governo
    res.json((data || []).map(t => ({ ...t, pendencias: es.validarTrabalhador(t) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/trabalhadores/:employee_id', async (req, res) => {
  const campos = [
    'cpf','nis','matricula','nome','nome_social','data_nascimento','sexo','raca_cor',
    'estado_civil','grau_instrucao','nome_mae','nome_pai','pais_nascimento','pais_nacionalidade',
    'uf_nascimento','municipio_nascimento','categoria','cbo','data_admissao','tp_admissao',
    'ind_admissao','tp_reg_trab','tp_reg_prev','nat_atividade','tp_contr','dt_term','clau_assec',
    'salario_base','und_sal_fixo','dsc_sal_var','tp_jornada','dsc_jorn_trab','qtd_hrs_sem',
    'escala_id','local_tp_insc','local_nr_insc','ctps_numero','ctps_serie','ctps_uf',
    'rg_numero','rg_orgao_emissor','rg_data_expedicao','cnh_numero','cnh_categoria','cnh_validade',
    'endereco','dependentes','data_desligamento','mtv_desligamento',
  ];
  const upd = {
    tenant_id:   req.tenantId,
    employee_id: req.params.employee_id,
    updated_at:  new Date().toISOString(),
  };
  for (const k of campos) if (req.body[k] !== undefined) upd[k] = req.body[k];

  if (upd.cpf) upd.cpf = es.digits(upd.cpf);
  if (upd.cpf && upd.cpf.length !== 11) {
    return res.status(400).json({ error: 'CPF deve ter 11 dígitos' });
  }
  if (!upd.nome && !upd.cpf) {
    // upsert precisa dos NOT NULL na criação
    const { data: existe } = await supabase.from('RH_ESOCIAL_TRABALHADOR')
      .select('id').eq('tenant_id', req.tenantId).eq('employee_id', req.params.employee_id).maybeSingle();
    if (!existe) return res.status(400).json({ error: 'CPF e nome são obrigatórios no primeiro cadastro' });
  }

  try {
    const { data, error } = await supabase
      .from('RH_ESOCIAL_TRABALHADOR')
      .upsert(upd, { onConflict: 'tenant_id,employee_id' })
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'esocial', data.id, { trabalhador: data.nome });
    res.json({ ...data, pendencias: es.validarTrabalhador(data) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Rubricas (S-1010) ─────────────────────────────────────

router.get('/rubricas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('RH_RUBRICAS').select('*')
      .eq('tenant_id', req.tenantId).order('cod_rubrica');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rubricas', async (req, res) => {
  const erros = es.validarRubrica(req.body);
  if (erros.length) return res.status(400).json({ error: erros[0], pendencias: erros });
  const campos = [
    'cod_rubrica','ide_tabela_rubrica','ini_valid','fim_valid','dsc_rubrica','nat_rubrica',
    'tp_rubrica','cod_inc_cp','cod_inc_irrf','cod_inc_fgts','cod_inc_sind','teto_remun',
    'observacao','is_active',
  ];
  const upd = { tenant_id: req.tenantId, updated_at: new Date().toISOString() };
  for (const k of campos) if (req.body[k] !== undefined) upd[k] = req.body[k];

  try {
    const { data, error } = await supabase.from('RH_RUBRICAS')
      .upsert(upd, { onConflict: 'tenant_id,cod_rubrica,ide_tabela_rubrica,ini_valid' })
      .select().single();
    if (error) throw error;
    audit(req, 'create', 'esocial', data.id, { rubrica: data.cod_rubrica });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rubricas/:id', async (req, res) => {
  try {
    const { data: r } = await supabase.from('RH_RUBRICAS').select('is_system')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (r?.is_system) return res.status(400).json({ error: 'Rubrica do sistema não pode ser removida' });
    await supabase.from('RH_RUBRICAS').delete()
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    audit(req, 'delete', 'esocial', req.params.id, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fila de eventos ───────────────────────────────────────

router.get('/eventos', async (req, res) => {
  const { status, tipo, limit = 100 } = req.query;
  try {
    let q = supabase.from('ESOCIAL_EVENTOS')
      .select('id,tipo,ambiente,ref_type,ref_id,per_apur,status,protocolo,recibo,erro_msg,tentativas,sent_at,processed_at,created_at')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 100, 500));
    if (status) q = q.eq('status', status);
    if (tipo)   q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/eventos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ESOCIAL_EVENTOS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/esocial/eventos
 * Monta, valida e envia um evento.
 * body: { tipo, ref_id?, cadIni?, dtDeslig?, mtvDeslig?, dry_run? }
 *
 * dry_run devolve o payload montado sem transmitir — serve para conferir
 * o evento com a contabilidade antes de mandar ao governo.
 */
router.post('/eventos', async (req, res) => {
  const { tipo, ref_id, dry_run } = req.body;
  if (!tipo) return res.status(400).json({ error: 'Tipo do evento é obrigatório' });

  try {
    const cfg = await getConfig(req.tenantId);
    const errCfg = es.validarConfig(cfg);
    if (errCfg.length) return res.status(400).json({ error: errCfg[0], pendencias: errCfg });

    const ctx = {};
    let ref_type = null;
    let per_apur = null;

    if (tipo === 'S-1000' || tipo === 'S-1005') {
      ref_type = tipo === 'S-1000' ? 'empregador' : 'estabelecimento';

    } else if (tipo === 'S-1010') {
      const { data: rubrica } = await supabase.from('RH_RUBRICAS').select('*')
        .eq('id', ref_id).eq('tenant_id', req.tenantId).maybeSingle();
      if (!rubrica) return res.status(404).json({ error: 'Rubrica não encontrada' });
      const erros = es.validarRubrica(rubrica);
      if (erros.length) return res.status(400).json({ error: erros[0], pendencias: erros });
      ctx.rubrica = rubrica;
      ref_type = 'rubrica';

    } else if (tipo === 'S-2200' || tipo === 'S-2299') {
      const { data: trab } = await supabase.from('RH_ESOCIAL_TRABALHADOR').select('*')
        .eq('id', ref_id).eq('tenant_id', req.tenantId).maybeSingle();
      if (!trab) return res.status(404).json({ error: 'Trabalhador não encontrado' });
      const erros = es.validarTrabalhador(trab);
      if (erros.length) return res.status(400).json({ error: erros[0], pendencias: erros });
      if (tipo === 'S-2299' && !(req.body.dtDeslig || trab.data_desligamento)) {
        return res.status(400).json({ error: 'Data de desligamento é obrigatória no S-2299' });
      }
      ctx.trabalhador = trab;
      ref_type = 'trabalhador';

    } else if (tipo === 'S-1200') {
      const { data: payroll } = await supabase.from('RH_SALARIOS').select('*')
        .eq('id', ref_id).eq('tenant_id', req.tenantId).maybeSingle();
      if (!payroll) return res.status(404).json({ error: 'Folha não encontrada' });

      const [{ data: itens }, { data: trab }] = await Promise.all([
        supabase.from('RH_SALARIOS_ITENS').select('*')
          .eq('tenant_id', req.tenantId).eq('payroll_id', payroll.id).order('ordem'),
        supabase.from('RH_ESOCIAL_TRABALHADOR').select('*')
          .eq('tenant_id', req.tenantId).eq('employee_id', payroll.employee_id).maybeSingle(),
      ]);

      if (!trab) return res.status(400).json({ error: 'Colaborador sem cadastro eSocial: preencha os dados antes de transmitir a folha' });
      const errTrab = es.validarTrabalhador(trab);
      if (errTrab.length) return res.status(400).json({ error: `Cadastro do trabalhador incompleto: ${errTrab[0]}`, pendencias: errTrab });
      const errFolha = es.validarFolha(payroll, itens);
      if (errFolha.length) return res.status(400).json({ error: errFolha[0], pendencias: errFolha });

      ctx.payroll = payroll;
      ctx.itens = itens;
      ctx.trabalhador = trab;
      ref_type = 'folha';
      per_apur = es.ym(payroll.reference_month);

    } else {
      return res.status(400).json({ error: `Evento não suportado: ${tipo}` });
    }

    const payload = es.buildEvento(tipo, cfg, ctx, {
      cadIni:    req.body.cadIni,
      dtDeslig:  req.body.dtDeslig,
      mtvDeslig: req.body.mtvDeslig,
      indRetif:  req.body.indRetif,
      nrRecibo:  req.body.nrRecibo,
    });

    if (dry_run) return res.json({ tipo, payload, transmitido: false });

    const evento = await registrarEvento(req, { tipo, ref_type, ref_id, per_apur, payload, cfg });
    const enviado = await transmitir(req, evento, cfg);
    await refletirSituacao(req.tenantId, enviado);

    audit(req, 'send', 'esocial', enviado.id, { tipo, status: enviado.status, protocolo: enviado.protocolo });
    res.status(201).json(enviado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/esocial/eventos/:id/consultar
 * Busca o retorno pelo protocolo. É aqui que o recibo aparece.
 */
router.post('/eventos/:id/consultar', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    if (!cfg) return res.status(400).json({ error: 'eSocial não configurado' });

    const { data: evento } = await supabase.from('ESOCIAL_EVENTOS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!evento.protocolo) {
      return res.status(400).json({ error: 'Evento ainda não tem protocolo: reenvie antes de consultar' });
    }

    const { ok, data } = await es.consultarProtocolo(cfg, evento.protocolo);
    if (!ok) {
      return res.status(502).json({ error: data?.erro || 'Falha ao consultar o gateway', retorno: data });
    }

    const norm = es.normalizarRetorno(data);
    const upd = {
      status:     norm.status,
      recibo:     norm.recibo || evento.recibo,
      erro_msg:   norm.erro_msg || null,
      retorno:    data,
      xml:        data?.xml || data?.xmlAssinado || evento.xml,
      updated_at: new Date().toISOString(),
    };
    if (norm.status === 'sucesso' || norm.status === 'rejeitado') {
      upd.processed_at = new Date().toISOString();
    }

    const { data: updated } = await supabase.from('ESOCIAL_EVENTOS')
      .update(upd).eq('id', evento.id).eq('tenant_id', req.tenantId).select().single();

    await refletirSituacao(req.tenantId, updated || { ...evento, ...upd });
    res.json(updated || { ...evento, ...upd });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/esocial/eventos/:id/reenviar
 * Reenvia um evento que falhou (rede, erro do gateway ou rejeição já
 * corrigida no cadastro). Remonta o payload a partir do estado ATUAL do
 * banco: reenviar o payload antigo repetiria o erro.
 */
router.post('/eventos/:id/reenviar', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    const errCfg = es.validarConfig(cfg);
    if (errCfg.length) return res.status(400).json({ error: errCfg[0], pendencias: errCfg });

    const { data: evento } = await supabase.from('ESOCIAL_EVENTOS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    if (evento.status === 'sucesso') {
      return res.status(400).json({ error: 'Evento já aceito pelo governo: use retificação (indRetif) em vez de reenviar' });
    }

    const enviado = await transmitir(req, evento, cfg);
    await refletirSituacao(req.tenantId, enviado);
    audit(req, 'resend', 'esocial', evento.id, { tipo: evento.tipo, status: enviado.status });
    res.json(enviado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Painel: o que falta para transmitir ───────────────────
// Uma chamada só, para a tela do RH mostrar as pendências reais.

router.get('/status', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    const [{ data: trabs }, { data: eventos }] = await Promise.all([
      supabase.from('RH_ESOCIAL_TRABALHADOR').select('*').eq('tenant_id', req.tenantId),
      supabase.from('ESOCIAL_EVENTOS').select('tipo,status').eq('tenant_id', req.tenantId),
    ]);

    const porStatus = {};
    for (const e of eventos || []) porStatus[e.status] = (porStatus[e.status] || 0) + 1;

    const trabPendentes = (trabs || [])
      .map(t => ({ id: t.id, nome: t.nome, pendencias: es.validarTrabalhador(t) }))
      .filter(t => t.pendencias.length);

    res.json({
      configurado:  es.configurado(cfg),
      ambiente:     cfg?.ambiente || null,
      provider:     cfg?.provider || null,
      config_pendencias: es.validarConfig(cfg),
      // S-1000 aceito é pré-requisito de todo o resto.
      empregador_aceito: (eventos || []).some(e => e.tipo === 'S-1000' && e.status === 'sucesso'),
      eventos_por_status: porStatus,
      trabalhadores_total: (trabs || []).length,
      trabalhadores_pendentes: trabPendentes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
