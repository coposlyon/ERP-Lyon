// ============================================================
// DOCUMENTOS — A CENTRAL ÚNICA DE ANEXOS.
//
// O kit da Lyon é explícito: esta é a central; as outras telas só
// mostram status e o botão de visualizar. Nenhuma delas guarda arquivo
// por conta própria — senão o mesmo ASO vira três verdades.
//
// A PERGUNTA QUE ESTA TELA RESPONDE É "O QUE FALTA?". Por isso o
// pendente é CALCULADO: catálogo exigido para aquela pessoa menos o que
// ela já entregou. Guardar "pendente" como linha seria criar uma lista
// que envelhece — o documento chega e o pendente continua lá.
//
// DOCUMENTO SEM VALIDADE NÃO VENCE (item 9). Contrato por prazo
// indeterminado, RG e CPF nunca entram na lista de vencimentos. Só
// aparece ali o que tem data — e a data é do documento, não um palpite.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { CATALOGO, CATEGORIAS, porChave, exigidosPara } = require('../lib/documentosCatalogo');

const DIA = 864e5;
const hojeISO = () => new Date().toISOString().slice(0, 10);

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

/** GET /api/rh/documentos/catalogo — o que o RH cobra, e de quem. */
router.get('/documentos/catalogo', (req, res) => {
  res.json({ catalogo: CATALOGO, categorias: CATEGORIAS });
});

/**
 * GET /api/rh/documentos?employee_id=…
 *
 * Sem filtro: o repositório inteiro e os totais de TODOS os
 * colaboradores. Com filtro: o prontuário de uma pessoa — e a resposta
 * diz `escopo: 'colaborador'`, para a tela poder escrever "Resumo do
 * colaborador" em vez de deixar o usuário achar que são os totais da
 * empresa (item 9).
 */
router.get('/documentos', async (req, res) => {
  const t = req.tenantId;
  const alvo = req.query.employee_id || null;
  const hoje = hojeISO();
  const em30 = new Date(Date.now() + 30 * DIA).toISOString().slice(0, 10);
  const avisos = [];

  try {
    const [colab, docs, politicas, aceites, ferias] = await Promise.all([
      tentar(() => supabase.from('CLIENTES').select('id, name, is_active, admission_data')
        .eq('tenant_id', t).eq('type', 'CO')),
      tentar(() => supabase.from('RH_DOCUMENTOS').select('*').eq('tenant_id', t)),
      tentar(() => supabase.from('RH_POLITICAS').select('*').eq('tenant_id', t).eq('is_active', true)),
      tentar(() => supabase.from('RH_POLITICAS_ACEITES').select('*').eq('tenant_id', t)),
      tentar(() => supabase.from('RH_FERIAS').select('employee_id, kind, end_date, exame_retorno_exigido, exame_retorno_em')
        .eq('tenant_id', t)),
    ]);
    for (const [n, r] of [['documentos', docs], ['políticas', politicas], ['aceites', aceites]]) {
      if (!r.ok) avisos.push(`${n}: ${r.erro}`);
    }

    let pessoas = colab.linhas.filter(c => c.is_active !== false);
    if (alvo) pessoas = pessoas.filter(p => p.id === alvo);

    const nomeDe = id => colab.linhas.find(p => p.id === id)?.name || '—';

    // O documento mais recente de cada chave, por pessoa.
    const maisRecente = (empId, key) => docs.linhas
      .filter(d => d.employee_id === empId && (d.doc_key === key || d.type === key))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;

    const vencido = d => d && !d.sem_validade && d.expires_at && d.expires_at < hoje;
    const vencendo = d => d && !d.sem_validade && d.expires_at && d.expires_at >= hoje && d.expires_at <= em30;

    // ── O prontuário de cada pessoa ─────────────────────────
    const prontuarios = pessoas.map(p => {
      const exigidos = exigidosPara(p);
      const itens = exigidos.map(cat => {
        const doc = maisRecente(p.id, cat.key);
        let status = 'pendente';
        if (doc) {
          if (vencido(doc)) status = 'vencido';
          else if (cat.assina && !doc.signed_at) status = 'aguardando_assinatura';
          else status = doc.signed_at ? 'assinado' : 'anexado';
        }
        return {
          doc_key: cat.key, titulo: cat.titulo, categoria: cat.categoria,
          origem: cat.origem, obrigatorio: cat.obrigatorio, ajuda: cat.ajuda || null,
          // Um documento SEM validade não vence — e a tela precisa saber
          // a diferença entre "não vence" e "ninguém preencheu a data".
          sem_validade: !!cat.sem_validade,
          status,
          documento: doc ? {
            id: doc.id, url: doc.file_url, nome: doc.description || cat.titulo,
            anexado_em: doc.created_at, expires_at: doc.sem_validade ? null : doc.expires_at,
            assinado_em: doc.signed_at || null,
          } : null,
        };
      });

      const obrig = itens.filter(i => i.obrigatorio);
      return {
        employee_id: p.id,
        nome: p.name,
        setor: p.admission_data?.sector || null,
        contrato: p.admission_data?.contract_type || null,
        itens,
        total: itens.length,
        anexados: itens.filter(i => ['anexado', 'assinado'].includes(i.status)).length,
        pendentes: itens.filter(i => i.status === 'pendente').length,
        obrigatorios_pendentes: obrig.filter(i => i.status === 'pendente').length,
        vencidos: itens.filter(i => i.status === 'vencido').length,
        aguardando_assinatura: itens.filter(i => i.status === 'aguardando_assinatura').length,
        // Conformidade da pessoa: só fecha com TODO obrigatório entregue
        // e nada vencido.
        conforme: obrig.every(i => i.status !== 'pendente') && !itens.some(i => i.status === 'vencido'),
        pct: obrig.length ? Math.round((obrig.filter(i => i.status !== 'pendente').length / obrig.length) * 100) : 100,
      };
    });

    // ── Políticas: uma versão, muitos aceites ───────────────
    const politicasComAceite = politicas.linhas.map(pol => {
      const meus = aceites.linhas.filter(a => a.politica_id === pol.id && a.versao === pol.versao);
      const escopo = alvo ? meus.filter(a => a.employee_id === alvo) : meus;
      return {
        ...pol,
        aceites: escopo.length,
        pendentes: Math.max(0, pessoas.length - escopo.length),
        pct: pessoas.length ? Math.round((escopo.length / pessoas.length) * 100) : 0,
      };
    });

    // ── Vencimentos: SÓ o que tem validade de verdade ───────
    const todosDocs = docs.linhas.filter(d => !alvo || d.employee_id === alvo);
    const vencimentos = todosDocs
      .filter(d => vencendo(d) || vencido(d))
      .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))
      .map(d => ({
        id: d.id, employee_id: d.employee_id, colaborador: nomeDe(d.employee_id),
        documento: porChave[d.doc_key]?.titulo || d.type,
        expires_at: d.expires_at,
        dias: Math.round((new Date(d.expires_at) - new Date(hoje)) / DIA),
        vencido: vencido(d),
      }));

    // Exames de retorno que o afastamento exigiu e ninguém anexou.
    const examesRetorno = ferias.linhas
      .filter(f => f.exame_retorno_exigido && !f.exame_retorno_em && (!alvo || f.employee_id === alvo))
      .map(f => ({ employee_id: f.employee_id, colaborador: nomeDe(f.employee_id), retorno: f.end_date }));

    const soma = campo => prontuarios.reduce((s, p) => s + p[campo], 0);

    res.json({
      escopo: alvo ? 'colaborador' : 'empresa',
      colaborador: alvo ? { id: alvo, nome: nomeDe(alvo) } : null,
      colaboradores: prontuarios.length,
      cartoes: {
        documentos_validos: soma('anexados'),
        pendentes: soma('pendentes'),
        obrigatorios_pendentes: soma('obrigatorios_pendentes'),
        vencendo_30_dias: vencimentos.filter(v => !v.vencido).length,
        vencidos: soma('vencidos'),
        aguardando_assinatura: soma('aguardando_assinatura'),
        conformidade_pct: prontuarios.length
          ? Math.round((prontuarios.filter(p => p.conforme).length / prontuarios.length) * 100) : null,
      },
      prontuarios,
      politicas: politicasComAceite,
      vencimentos,
      exames_retorno_pendentes: examesRetorno,
      categorias: CATEGORIAS,
      avisos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/documentos
 * Registra um documento no prontuário. O arquivo em si já foi para o
 * Storage pelo caminho de anexos do colaborador — aqui entra a
 * CLASSIFICAÇÃO, que é o que torna a pendência calculável.
 */
router.post('/documentos', async (req, res) => {
  const t = req.tenantId;
  const {
    employee_id, doc_key, file_url, description, expires_at,
    sem_validade, document_date, origin = 'rh', mime, size_bytes,
  } = req.body || {};

  if (!employee_id || !doc_key) {
    return res.status(400).json({ error: 'Informe o colaborador e o tipo de documento.' });
  }
  const cat = porChave[doc_key];

  try {
    const linha = {
      tenant_id: t, employee_id,
      doc_key,
      type: doc_key,
      category: cat?.categoria || 'pessoal',
      description: description || cat?.titulo || doc_key,
      file_url: file_url || null,
      document_date: document_date || hojeISO(),
      // A regra vale na gravação, não só na leitura: documento cujo
      // catálogo diz que não vence entra com sem_validade e SEM data.
      sem_validade: sem_validade != null ? !!sem_validade : !!cat?.sem_validade,
      expires_at: (sem_validade || cat?.sem_validade) ? null : (expires_at || null),
      required: !!cat?.obrigatorio,
      origin,
      status: 'anexado',
      mime: mime || null,
      size_bytes: size_bytes || null,
    };

    const { data, error } = await supabase.from('RH_DOCUMENTOS').insert(linha).select().single();
    if (error) throw error;

    audit(req, 'create', 'documento', data.id, { doc_key, employee_id });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/rh/documentos/:id — assinar, revalidar ou recusar. */
router.patch('/documentos/:id', async (req, res) => {
  const { acao, expires_at, sem_validade } = req.body || {};
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (acao === 'assinar') {
      patch.signed_at = new Date().toISOString();
      patch.signed_by = req.userProfile?.id || null;
      patch.status = 'assinado';
    }
    if (acao === 'recusar') patch.status = 'recusado';
    if (expires_at !== undefined) { patch.expires_at = expires_at || null; patch.sem_validade = false; }
    if (sem_validade) { patch.sem_validade = true; patch.expires_at = null; }

    const { data, error } = await supabase.from('RH_DOCUMENTOS')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id).select().single();
    if (error) throw error;
    audit(req, acao || 'update', 'documento', req.params.id, patch);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/documentos/termo-ciencia/:employeeId
 *
 * O TERMO DE CIÊNCIA NASCE DOS ACEITES (item 9). A etapa Contrato e
 * Políticas do cadastro registra o que a pessoa aceitou e quando; aqui
 * isso vira um documento arquivado no prontuário, com a versão de cada
 * política. Ninguém redigita nada.
 */
router.post('/documentos/termo-ciencia/:employeeId', async (req, res) => {
  const t = req.tenantId;
  const id = req.params.employeeId;
  try {
    const [{ data: pessoa }, { data: politicas }] = await Promise.all([
      supabase.from('CLIENTES').select('id, name, cpf_cnpj, admission_data').eq('tenant_id', t).eq('id', id).maybeSingle(),
      supabase.from('RH_POLITICAS').select('*').eq('tenant_id', t).eq('is_active', true),
    ]);
    if (!pessoa) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    const aceitas = pessoa.admission_data?.politicas || {};
    const marcadas = Object.entries(aceitas).filter(([, v]) => v);
    if (!marcadas.length) {
      return res.status(400).json({
        error: 'Nenhuma política aceita no cadastro. Marque os aceites na etapa Contrato e Políticas.',
      });
    }

    // Grava o aceite versionado — a política é uma só; o aceite é de cada um.
    for (const [chave, dataAceite] of marcadas) {
      const pol = (politicas || []).find(p => p.chave === chave
        || p.chave === ({ termo_sistema: 'seguranca', imagem: 'conduta', epi: 'seguranca', sigilo: 'lgpd' })[chave]);
      if (!pol) continue;
      await supabase.from('RH_POLITICAS_ACEITES').upsert({
        tenant_id: t, politica_id: pol.id, employee_id: id, versao: pol.versao,
        aceito_em: `${dataAceite}T12:00:00Z`, origem: 'cadastro',
      }, { onConflict: 'tenant_id,politica_id,employee_id,versao' });
    }

    const resumo = marcadas.map(([k, d]) => `${k}: aceito em ${String(d).split('-').reverse().join('/')}`).join(' · ');
    const { data: doc, error } = await supabase.from('RH_DOCUMENTOS').insert({
      tenant_id: t, employee_id: id,
      doc_key: 'termo_ciencia', type: 'termo_ciencia', category: 'politica',
      description: `Termo de ciência e aceite das políticas — ${resumo}`,
      document_date: hojeISO(), sem_validade: true, expires_at: null,
      required: true, origin: 'sistema', status: 'assinado',
      signed_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    audit(req, 'create', 'termo_ciencia', doc.id, { employee_id: id, politicas: marcadas.length });
    res.status(201).json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
