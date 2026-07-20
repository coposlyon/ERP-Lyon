const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const { makeClient } = require('../config/supabase');
const { audit } = require('../lib/audit');
const { getEmailConfig, makeTransport } = require('../lib/mailer');
const { recomputeRating, recomputeAll } = require('../lib/customerRating');
const { computePrime, TIERS } = require('../lib/lyonPrime');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// Colaborador (type CO): o salário vira despesa fixa no Rateio, na
// categoria "Funcionários" (1 despesa por colaborador, via employee_id).
// Nunca quebra o salvamento do colaborador — migração 048 pode estar pendente.
async function syncEmployeeSalary(tenantId, customer) {
  if (!customer?.id) return;
  try {
    const isEmployee = customer.type === 'CO';
    const raw = customer.admission_data?.salary;
    // aceita número puro (20000) e formato BR ("20.000,00")
    const salary = (typeof raw === 'string' && raw.includes(','))
      ? (parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0)
      : (Number(raw) || 0);
    const active = isEmployee && customer.is_active !== false && salary > 0;

    const { data: existing, error: e1 } = await supabase.from('DESPESAS_FIXAS')
      .select('id').eq('tenant_id', tenantId).eq('employee_id', customer.id).maybeSingle();
    if (e1) throw e1;

    if (existing) {
      await supabase.from('DESPESAS_FIXAS').update({
        amount: salary, notes: customer.name, is_active: active,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else if (active) {
      const row = {
        tenant_id: tenantId, name: 'Colaboradores', amount: salary,
        due_day: 5, notes: customer.name, employee_id: customer.id, category: 'RH',
      };
      let { error } = await supabase.from('DESPESAS_FIXAS').insert(row);
      if (error && /category/i.test(error.message || '')) {
        delete row.category; // migração 049 pendente
        await supabase.from('DESPESAS_FIXAS').insert(row);
      }
    }
  } catch (err) {
    console.warn('[customers/syncEmployeeSalary]', err.message);
  }
}

// Monta as condições de busca (.or do PostgREST).
// useDigits=true usa as colunas geradas *_digits (migration 015), que
// comparam só os dígitos — assim "4399523972" acha o telefone "43 9952-3972".
function buildSearchOr(search, useDigits) {
  const s = String(search).trim();
  const digits = s.replace(/\D/g, '');
  const isNumeric = /^\d+$/.test(s);
  const conds = [];
  // número = busca pelo CÓDIGO (display_id) exato — evita que "4" traga
  // todo mundo cujo telefone/CPF contém "4".
  if (isNumeric) conds.push(`display_id.eq.${parseInt(s)}`);
  // documento/telefone só entram com 5+ dígitos (fragmento plausível)
  if (digits.length >= 5) {
    if (useDigits) conds.push(`doc_digits.ilike.%${digits}%`, `phone_digits.ilike.%${digits}%`, `mobile_digits.ilike.%${digits}%`);
    else conds.push(`cpf_cnpj.ilike.%${s}%`, `phone.ilike.%${s}%`, `mobile.ilike.%${s}%`);
  }
  // texto = nome / documento / e-mail
  if (!isNumeric) conds.push(`name.ilike.%${s}%`, `cpf_cnpj.ilike.%${s}%`, `email.ilike.%${s}%`);
  if (!conds.length) conds.push(`display_id.eq.0`); // segurança: nunca .or() vazio
  return conds.join(',');
}

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, type, is_active, rating, sort, state } = req.query;
  const offset = (page - 1) * limit;

  const buildQuery = (useDigits) => {
    let query = supabase
      .from('CLIENTES')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId);

    // Ordenação: alfabética (padrão) | recent = últimos admitidos
    if (sort === 'name') query = query.order('name', { ascending: true });
    else if (sort === 'recent') query = query.order('display_id', { ascending: false });
    else query = query.order('display_id', { ascending: true });

    if (search) query = query.or(buildSearchOr(search, useDigits));

    // type=CO → só colaboradores | type=cliente → PF e PJ | sem type → todos
    if (type === 'CO') query = query.eq('type', 'CO');
    else if (type === 'cliente') query = query.in('type', ['PF', 'PJ']);

    if (rating) query = query.eq('rating', parseInt(rating));
    if (state) query = query.eq('address->>state', state); // filtra pela UF do endereço (JSONB)
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    return query.range(offset, offset + limit - 1);
  };

  try {
    let { data, error, count } = await buildQuery(true);
    // Fallback se a migration 015 (colunas *_digits) ainda não foi aplicada
    if (error && /digits|does not exist|column|42703/i.test(error.message || '')) {
      ({ data, error, count } = await buildQuery(false));
    }
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exporta os clientes como vCard (.vcf) para importar no Google Contatos / celular.
// O nome do contato sai como "NOME #0004" para já aparecer identificado no WhatsApp.
router.get('/export-contacts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CLIENTES')
      .select('name, phone, mobile, display_id, email')
      .eq('tenant_id', req.tenantId)
      .in('type', ['PF', 'PJ'])
      .eq('is_active', true)
      .order('name');
    if (error) throw error;

    const code4 = n => (n == null ? '' : String(n).padStart(4, '0'));
    const e164 = v => {
      let d = String(v || '').replace(/\D/g, '');
      if (!d) return null;
      if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número (BR) → +55
      return '+' + d;
    };
    const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

    const cards = [];
    for (const c of (data || [])) {
      const phones = [...new Set([e164(c.phone), e164(c.mobile)].filter(Boolean))];
      if (!phones.length) continue;
      const fn = `${c.name}${c.display_id != null ? ` #${code4(c.display_id)}` : ''}`;
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${esc(fn)};;;`, `FN:${esc(fn)}`];
      phones.forEach((p, i) => lines.push(`TEL;TYPE=${i === 0 ? 'CELL' : 'VOICE'}:${p}`));
      if (c.email) lines.push(`EMAIL:${esc(c.email)}`);
      lines.push('ORG:Lyon Copos');
      lines.push('END:VCARD');
      cards.push(lines.join('\r\n'));
    }

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes-lyon.vcf"');
    res.send(cards.join('\r\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── E-mail em massa (marketing) pelo SMTP configurado ────────────────
router.post('/marketing/email', async (req, res) => {
  const { subject, message, emails } = req.body;
  const list = [...new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(e => /^\S+@\S+\.\S+$/.test(e)))];
  if (!String(subject || '').trim() || !String(message || '').trim()) return res.status(400).json({ error: 'Informe o assunto e a mensagem.' });
  if (!list.length) return res.status(400).json({ error: 'Selecione ao menos um destinatário com e-mail válido.' });
  try {
    const cfg = await getEmailConfig(req.tenantId);
    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return res.status(400).json({ error: 'E-mail não configurado. Vá em Configurações → E-mail e informe o servidor SMTP.' });
    }
    const fromEmail = cfg.from_email || cfg.smtp_user;
    const fromName = cfg.from_name || cfg._companyName || 'Lyon Copos';
    const transport = makeTransport(cfg);

    const html = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    let sent = 0; const errors = [];
    const BATCH = 40; // envia em lotes via BCC (os destinatários não se veem)
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      try {
        await transport.sendMail({ from: `"${fromName}" <${fromEmail}>`, to: fromEmail, bcc: batch, subject, text: message, html });
        sent += batch.length;
      } catch (e) { errors.push(e.message); }
    }
    audit(req, 'create', 'marketing_email', null, { subject, total: list.length, sent });
    if (sent === 0) return res.status(502).json({ error: errors[0] || 'Falha ao enviar — confira as credenciais SMTP.' });
    res.json({ sent, total: list.length, errors: errors.slice(0, 3) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Consulta de crédito (Serasa/SPC via API agregadora) ──────────────
async function getCreditConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.credito) || {};
  } catch { s = {}; }
  return {
    provider:    s.provider    || process.env.CREDIT_PROVIDER || '',
    api_url:     s.api_url      || process.env.CREDIT_API_URL  || '',
    api_key:     s.api_key      || process.env.CREDIT_API_KEY  || '',
    auth_header: s.auth_header  || '',          // vazio = Authorization: Bearer
    cpf_field:   s.cpf_field    || 'cpf',
  };
}

// Adaptador do provedor: faz a chamada e normaliza o retorno.
// A leitura exata dos campos (score/negativado/restrições) é ajustada conforme
// a documentação do provedor escolhido — por isso fica isolada aqui.
async function consultarCredito(cpf, cfg) {
  if (!cfg.api_url || !cfg.api_key) {
    const err = new Error('Provedor de crédito não configurado. Vá em Configurações → Crédito e informe a URL e a chave da API.');
    err.status = 400; throw err;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.auth_header) headers[cfg.auth_header] = cfg.api_key;
  else headers['Authorization'] = `Bearer ${cfg.api_key}`;

  const resp = await fetch(cfg.api_url, {
    method: 'POST', headers,
    body: JSON.stringify({ [cfg.cpf_field]: String(cpf).replace(/\D/g, '') }),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.message || raw?.error || `Falha na consulta (HTTP ${resp.status})`);
    err.status = 502; throw err;
  }

  // Extração tolerante (ajusto os nomes dos campos com a doc do provedor)
  const pick = (...keys) => { for (const k of keys) { const v = k.split('.').reduce((o, kk) => (o == null ? o : o[kk]), raw); if (v != null) return v; } return null; };
  const score = pick('score', 'scoreValue', 'credit_score', 'pontuacao', 'Score', 'resultado.score');
  let negativado = pick('negativado', 'hasRestrictions', 'possuiRestricao', 'restricao');
  const restricoes = pick('restricoes', 'pendencias', 'negativacoes', 'restrictions') || [];
  const total = pick('totalRestricoes', 'valorTotalRestricoes', 'totalPendencias');
  if (negativado == null) negativado = Array.isArray(restricoes) ? restricoes.length > 0 : null;
  const n = Number(score);
  const faixa = isNaN(n) ? null : (n < 300 ? 'Muito baixo' : n < 500 ? 'Baixo' : n < 700 ? 'Médio' : n < 850 ? 'Bom' : 'Excelente');

  return {
    score: isNaN(n) ? null : n, score_faixa: faixa,
    negativado: negativado == null ? null : !!negativado,
    total_restricoes: total != null ? Number(total) : null,
    restricoes: Array.isArray(restricoes) ? restricoes : (restricoes ? [restricoes] : []),
    raw,
  };
}

router.post('/:id/credit-check', async (req, res) => {
  try {
    const { data: cli } = await supabase.from('CLIENTES').select('id, name, cpf_cnpj')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
    const cpf = String(cli.cpf_cnpj || '').replace(/\D/g, '');
    if (!cpf) return res.status(400).json({ error: 'Cliente sem CPF/CNPJ cadastrado.' });

    const cfg = await getCreditConfig(req.tenantId);
    const r = await consultarCredito(cpf, cfg);

    const { data: rec } = await supabase.from('CONSULTAS_CREDITO').insert({
      tenant_id: req.tenantId, customer_id: cli.id, cpf_cnpj: cli.cpf_cnpj, provider: cfg.provider || null,
      score: r.score, score_faixa: r.score_faixa, negativado: r.negativado, total_restricoes: r.total_restricoes,
      restricoes: r.restricoes, raw: r.raw, user_id: req.user?.id || null, user_name: req.user?.name || req.user?.email || null,
    }).select().single();
    audit(req, 'create', 'credit_check', cli.id, { score: r.score, negativado: r.negativado });
    res.status(201).json(rec || r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id/credit-checks', async (req, res) => {
  try {
    const { data } = await supabase.from('CONSULTAS_CREDITO').select('*')
      .eq('tenant_id', req.tenantId).eq('customer_id', req.params.id)
      .order('created_at', { ascending: false }).limit(50);
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Programa Lyon Prime ────────────────────────────────────────────
// Ranking geral (página Lyon Prime): estrelas, faturamento 12m e selo.
router.get('/prime/ranking', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CLIENTES')
      .select('id, display_id, name, nome_fantasia, type, rating, total_12m, credit_limit, blocked, is_active, selo_confianca, vendedor')
      .eq('tenant_id', req.tenantId)
      .in('type', ['PF', 'PJ'])
      .order('total_12m', { ascending: false, nullsFirst: false })
      .limit(300);
    if (error) {
      // colunas 045 podem não existir ainda → versão reduzida
      const { data: basic, error: e2 } = await supabase
        .from('CLIENTES')
        .select('id, display_id, name, nome_fantasia, type, rating, total_12m, credit_limit, blocked, is_active')
        .eq('tenant_id', req.tenantId)
        .in('type', ['PF', 'PJ'])
        .order('total_12m', { ascending: false, nullsFirst: false })
        .limit(300);
      if (e2) throw e2;
      return res.json({ data: basic || [], tiers: TIERS });
    }
    res.json({ data: data || [], tiers: TIERS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Painel Lyon Prime de UM cliente: estrelas, progresso, benefícios,
// selo de confiança, situação financeira e histórico de evolução.
router.get('/:id/prime', async (req, res) => {
  try {
    const prime = await computePrime(req.tenantId, req.params.id);
    if (!prime) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(prime);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CLIENTES')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const {
    type, name, cpf_cnpj, rg_ie, email, phone, mobile, address,
    credit_limit, instagram, nome_fantasia, rating, admission_data, is_active, birth_date, notes,
    blocked, block_reason, vendedor, boleto_days
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do cliente é obrigatório' });

  try {
    // Verifica CPF/CNPJ duplicado
    if (cpf_cnpj) {
      const { data: existing } = await supabase
        .from('CLIENTES')
        .select('id, name, display_id')
        .eq('tenant_id', req.tenantId)
        .eq('cpf_cnpj', cpf_cnpj)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({
          error: 'CPF/CNPJ já cadastrado',
          duplicate: true,
          existing_id: existing.id,
          existing_name: existing.name,
          existing_display_id: existing.display_id,
        });
      }
    }

    const base = {
      tenant_id: req.tenantId,
      type: type || 'PF',
      name, cpf_cnpj, rg_ie, email, phone, mobile,
      address: address || {},
      credit_limit: credit_limit || 0,
      instagram: instagram || null,
      nome_fantasia: nome_fantasia || null,
      rating: rating || null,
      admission_data: admission_data || {},
      is_active: is_active !== false,
      notes: notes || null,
      blocked: !!blocked,
      block_reason: block_reason || null,
    };
    const payload = {
      ...base,
      birth_date: birth_date || null,
      vendedor: vendedor || null,
      boleto_days: (boleto_days === '' || boleto_days == null) ? null : parseInt(boleto_days),
    };
    const ins = () => supabase.from('CLIENTES').insert(payload).select().single();
    let { data, error } = await ins();
    // remove colunas que ainda não existem no banco e tenta de novo
    while (error && /(birth_date|vendedor|boleto_days)/i.test(error.message || '')) {
      if (/birth_date/i.test(error.message)) delete payload.birth_date;
      else if (/vendedor/i.test(error.message)) delete payload.vendedor;
      else if (/boleto_days/i.test(error.message)) delete payload.boleto_days;
      ({ data, error } = await ins());
    }
    if (error) throw error;
    await syncEmployeeSalary(req.tenantId, data);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const {
    type, name, cpf_cnpj, rg_ie, email, phone, mobile, address,
    credit_limit, is_active, instagram, nome_fantasia, rating, admission_data, birth_date, notes,
    blocked, block_reason, vendedor, boleto_days
  } = req.body;

  try {
    // Busca o registro atual para preservar os anexos (attachments)
    // O form nunca carrega admission_data.attachments no estado — sem isso
    // um PUT sobrescreveria os documentos já enviados ao Storage.
    const { data: current } = await supabase
      .from('CLIENTES')
      .select('admission_data')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    const existingAttachments = current?.admission_data?.attachments || [];

    const base = {
      type, name, cpf_cnpj, rg_ie, email, phone, mobile, address,
      credit_limit, is_active, instagram, nome_fantasia,
      rating: rating || null,
      notes: notes != null ? notes : undefined,
      blocked: !!blocked,
      block_reason: block_reason || null,
      admission_data: {
        ...(admission_data || {}),
        attachments: existingAttachments, // sempre preserva os documentos do banco
      },
    };
    // birth_date (023), updated_at (025), vendedor/boleto_days (045) podem não existir → fallback
    const payload = {
      ...base,
      birth_date: birth_date || null,
      updated_at: new Date().toISOString(),
      ...(vendedor !== undefined ? { vendedor: vendedor || null } : {}),
      ...(boleto_days !== undefined ? { boleto_days: (boleto_days === '' || boleto_days == null) ? null : parseInt(boleto_days) } : {}),
    };
    const upd = (p) => supabase.from('CLIENTES')
      .update(p).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    let { data, error } = await upd(payload);
    while (error && /(birth_date|updated_at|vendedor|boleto_days)/i.test(error.message || '')) {
      if (/birth_date/i.test(error.message)) delete payload.birth_date;
      else if (/updated_at/i.test(error.message)) delete payload.updated_at;
      else if (/vendedor/i.test(error.message)) delete payload.vendedor;
      else if (/boleto_days/i.test(error.message)) delete payload.boleto_days;
      ({ data, error } = await upd(payload));
    }
    if (error) throw error;
    await syncEmployeeSalary(req.tenantId, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recalcula as estrelas automáticas de TODOS os clientes pelas compras de 12 meses.
router.post('/recompute-ratings', async (req, res) => {
  try {
    const r = await recomputeAll(req.tenantId);
    res.json({ ok: true, ...r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recalcula um cliente específico.
router.post('/:id/recompute-rating', async (req, res) => {
  try {
    const r = await recomputeRating(req.tenantId, req.params.id);
    res.json({ ok: true, ...(r || {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/rating', async (req, res) => {
  // rating null/0 = remove a classificação; 1-5 = define as estrelas
  const raw = req.body?.rating;
  const rating = (raw == null || raw === 0 || raw === '') ? null : Number(raw);
  if (rating != null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
  }
  try {
    const { data, error } = await supabase
      .from('CLIENTES')
      .update({ rating })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select('id, rating')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('CLIENTES')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    res.json({ message: 'Cliente desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir cliente DE VERDADE — só admin e exige a senha de login.
router.post('/:id/delete', async (req, res) => {
  try {
    if (req.userProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem excluir clientes.' });
    }
    const password = String(req.body?.password || '');
    const email = req.user?.email;
    if (!password) return res.status(400).json({ error: 'Digite sua senha para confirmar.' });
    // Não usar 401 aqui: o interceptor do front trata QUALQUER 401 como sessão
    // expirada e desloga. A senha de confirmação é outra coisa — usamos 403/502.
    if (!email) return res.status(403).json({ error: 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.' });

    // Reautentica para confirmar a senha (sem derrubar a sessão atual — client à parte)
    const client = makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: authErr } = await client.auth.signInWithPassword({ email, password });
    if (authErr) {
      const badPass = authErr.status === 400 || /invalid|credential|password|senha/i.test(authErr.message || '');
      return res.status(badPass ? 403 : 502)
        .json({ error: badPass ? 'Senha incorreta.' : `Não foi possível confirmar a senha: ${authErr.message}` });
    }

    // Exclui (hard delete)
    const { error } = await supabase.from('CLIENTES').delete()
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) {
      if (/foreign key|violat|23503/i.test(error.message || '')) {
        return res.status(409).json({ error: 'Não dá pra excluir: este cliente tem registros vinculados (vendas, orçamentos, etc.). Use "Desativar".' });
      }
      throw error;
    }
    audit(req, 'delete', 'customer', req.params.id, { hard: true });
    res.json({ message: 'Cliente excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: customer, error: custError } = await supabase
      .from('CLIENTES')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (custError || !customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const [
      { data: sales },
      { data: quotes },
      { data: receivables },
      { data: customizations },
    ] = await Promise.all([
      supabase.from('VENDAS').select('id, number, total, status, created_at, delivery_date, payment_method').eq('tenant_id', req.tenantId).eq('customer_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('ORCAMENTOS').select('id, number, total, status, created_at, valid_until').eq('tenant_id', req.tenantId).eq('customer_id', id).order('created_at', { ascending: false }).limit(15),
      supabase.from('LANCAMENTOS').select('id, description, amount, paid_amount, status, due_date, paid_date').eq('tenant_id', req.tenantId).eq('customer_id', id).eq('type', 'receivable').order('due_date', { ascending: false }).limit(20),
      supabase.from('PERSONALIZACOES').select('id, title, status, priority, deadline, created_at').eq('tenant_id', req.tenantId).eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    ]);

    const totalSales = (sales || []).filter(s => s.status !== 'cancelled').reduce((s, v) => s + (v.total || 0), 0);
    const openReceivables = (receivables || []).reduce((s, l) => s + Math.max(0, (l.amount || 0) - (l.paid_amount || 0)), 0);

    res.json({
      customer,
      sales: sales || [],
      quotes: quotes || [],
      receivables: receivables || [],
      customizations: customizations || [],
      summary: {
        total_sales: totalSales,
        open_receivables: openReceivables,
        sales_count: (sales || []).filter(s => s.status !== 'cancelled').length,
        quotes_count: (quotes || []).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Anexos de admissão ───────────────────────────────────────────
router.get('/:id/attachments', async (req, res) => {
  try {
    const { data: customer } = await supabase
      .from('CLIENTES')
      .select('admission_data')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    res.json(customer?.admission_data?.attachments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  try {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${req.tenantId}/${id}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('DOCUMENTOS')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('DOCUMENTOS')
      .getPublicUrl(filePath);

    // Busca admission_data atual
    const { data: customer } = await supabase
      .from('CLIENTES')
      .select('admission_data')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    const attachments = customer?.admission_data?.attachments || [];
    const newItem = {
      id: Date.now().toString(),
      name: file.originalname,
      url: publicUrl,
      path: filePath,
      type: file.mimetype,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };

    await supabase
      .from('CLIENTES')
      .update({
        admission_data: { ...(customer?.admission_data || {}), attachments: [...attachments, newItem] },
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const { id, attachmentId } = req.params;
  try {
    const { data: customer } = await supabase
      .from('CLIENTES')
      .select('admission_data')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    const attachments = customer?.admission_data?.attachments || [];
    const toRemove = attachments.find(a => a.id === attachmentId);

    if (toRemove?.path) {
      await supabase.storage.from('DOCUMENTOS').remove([toRemove.path]);
    }

    const updated = attachments.filter(a => a.id !== attachmentId);
    await supabase
      .from('CLIENTES')
      .update({ admission_data: { ...(customer?.admission_data || {}), attachments: updated } })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.json({ message: 'Anexo removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
