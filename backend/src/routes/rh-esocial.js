// ============================================================
// eSOCIAL / FGTS DIGITAL.
//
// O eSocial não é uma tela de digitação: é o ESPELHO do que já
// aconteceu no RH. Admitiu alguém? Nasce um S-2200. Mudou salário ou
// cargo? S-2205. Afastou por mais de 15 dias? S-2230. Fechou a folha?
// S-1200. Desligou? S-2299. Se o RH precisasse redigitar isso, o
// eSocial seria a terceira versão da mesma verdade — e a que vai para
// o governo.
//
// FGTS DIGITAL, NÃO SEFIP (item 10). A guia do FGTS hoje sai do FGTS
// Digital, alimentado pelos eventos do eSocial. SEFIP/GFIP é processo
// de outra época e não pode aparecer como fluxo padrão para 2027 — nem
// no texto da tela.
//
// O QUE ESTE MÓDULO NÃO FAZ: assinar e transmitir. Isso exige
// certificado digital A1/A3 e um gateway homologado. Aqui os eventos
// são MONTADOS e ficam prontos; enquanto não houver transmissor
// configurado, a tela diz "pronto para envio" — e não "enviado".
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { regrasAfastamento } = require('../lib/ferias');

const compAtual = () => new Date().toISOString().slice(0, 7);

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

// Os eventos que a operação da Lyon gera. Cada um sabe de que fato
// nasce — é isso que permite "montar" em vez de "cadastrar".
const EVENTOS = {
  'S-2200': { nome: 'Admissão do trabalhador', origem: 'cadastro do colaborador' },
  'S-2205': { nome: 'Alteração de dados cadastrais', origem: 'edição do cadastro' },
  'S-2206': { nome: 'Alteração de contrato de trabalho', origem: 'mudança de cargo, salário ou jornada' },
  'S-2230': { nome: 'Afastamento temporário', origem: 'Férias/Afastamentos' },
  'S-2299': { nome: 'Desligamento', origem: 'Desligamentos' },
  'S-1200': { nome: 'Remuneração do trabalhador', origem: 'fechamento da folha' },
  'S-1210': { nome: 'Pagamentos de rendimentos', origem: 'pagamento da folha' },
};

/**
 * O LEVANTAMENTO — uma função, dois usuários.
 *
 * A tela lê daqui e o "preparar" grava daqui. Duas listas de pendências
 * seriam duas verdades sobre o que o governo ainda não recebeu.
 */
async function levantar(t, comp) {
  const avisos = [];
  const inicio = `${comp}-01`;
  const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0).toISOString().slice(0, 10);

  const [eventos, colab, ferias, folha, desl, config] = await Promise.all([
    tentar(() => supabase.from('ESOCIAL_EVENTOS').select('*').eq('tenant_id', t)
      .order('created_at', { ascending: false }).limit(500)),
    tentar(() => supabase.from('CLIENTES').select('id, name, cpf_cnpj, is_active, created_at, admission_data')
      .eq('tenant_id', t).eq('type', 'CO')),
    tentar(() => supabase.from('RH_FERIAS').select('*').eq('tenant_id', t)),
    tentar(() => supabase.from('RH_SALARIOS').select('*').eq('tenant_id', t).eq('reference_month', comp)),
    tentar(() => supabase.from('RH_DESLIGAMENTOS').select('*').eq('tenant_id', t)),
    tentar(() => supabase.from('CONFIG_FISCAL').select('*').eq('tenant_id', t).limit(1)),
  ]);
  for (const [n, r] of [['eventos', eventos], ['colaboradores', colab], ['férias', ferias]]) {
    if (!r.ok) avisos.push(`${n}: ${r.erro}`);
  }

  const pessoas = colab.linhas;
  const nomeDe = id => pessoas.find(p => p.id === id)?.name || '—';
  const cpfDe = id => pessoas.find(p => p.id === id)?.cpf_cnpj || null;
  const enviados = eventos.linhas;
  const jaTem = (tipo, refId, per) => enviados.some(e =>
    e.tipo === tipo && (!refId || e.ref_id === refId) && (!per || e.per_apur === per));

  // ── O que os FATOS pedem nesta competência ──────────────
  const pendentes = [];

  // Admissões do mês → S-2200
  for (const p of pessoas) {
    const admissao = p.admission_data?.start_date || (p.created_at || '').slice(0, 10);
    if (!admissao?.startsWith(comp)) continue;
    if (jaTem('S-2200', p.id)) continue;
    pendentes.push({
      tipo: 'S-2200', descricao: EVENTOS['S-2200'].nome,
      colaborador: p.name, cpf: p.cpf_cnpj, ref_id: p.id, per_apur: comp,
      // Sem CPF ou sem data, o evento é recusado pelo governo. Melhor
      // saber aqui do que no protocolo de erro.
      bloqueios: [
        ...(!p.cpf_cnpj ? ['CPF não cadastrado'] : []),
        ...(!p.admission_data?.start_date ? ['Data de admissão não informada'] : []),
        ...(!p.admission_data?.role ? ['Cargo não informado'] : []),
        ...(!p.admission_data?.salary ? ['Salário não informado'] : []),
      ],
    });
  }

  // Afastamentos acima de 15 dias → S-2230
  for (const f of ferias.linhas.filter(x => x.kind && x.kind !== 'ferias')) {
    const r = regrasAfastamento({ start_date: f.start_date, end_date: f.end_date });
    if (!r.inss_apos_15) continue;                 // até 15 dias não gera evento
    if (jaTem('S-2230', f.id)) continue;
    pendentes.push({
      tipo: 'S-2230', descricao: EVENTOS['S-2230'].nome,
      colaborador: nomeDe(f.employee_id), cpf: cpfDe(f.employee_id),
      ref_id: f.id, per_apur: String(f.start_date).slice(0, 7),
      detalhe: `${r.dias} dias · ${f.reason || 'sem motivo informado'}`,
      bloqueios: [...(!f.cid ? ['CID não informado no afastamento'] : [])],
    });
  }

  // Desligamentos → S-2299
  for (const d of desl.linhas.filter(x => String(x.exit_date || '').startsWith(comp))) {
    if (jaTem('S-2299', d.id)) continue;
    pendentes.push({
      tipo: 'S-2299', descricao: EVENTOS['S-2299'].nome,
      colaborador: nomeDe(d.employee_id), cpf: cpfDe(d.employee_id),
      ref_id: d.id, per_apur: comp,
      detalhe: `saída em ${String(d.exit_date).split('-').reverse().join('/')}`,
      bloqueios: [...(d.exam_required && !d.exam_done_on ? ['Exame demissional pendente'] : [])],
    });
  }

  // Folha fechada → S-1200 (um por colaborador)
  for (const f of folha.linhas.filter(x => x.status === 'closed' || x.status === 'paid')) {
    if (jaTem('S-1200', f.employee_id, comp)) continue;
    pendentes.push({
      tipo: 'S-1200', descricao: EVENTOS['S-1200'].nome,
      colaborador: nomeDe(f.employee_id), cpf: cpfDe(f.employee_id),
      ref_id: f.employee_id, per_apur: comp,
      detalhe: `bruto R$ ${Number(f.gross_salary || 0).toFixed(2)}`,
      bloqueios: [],
    });
  }

  const cfg = config.linhas[0] || null;
  const temTransmissor = !!(cfg && (cfg.focus_token_producao || cfg.focus_token_homologacao));

  // ── FGTS Digital: a guia sai dos eventos, não do SEFIP ───
  const fgtsMes = folha.linhas.reduce((s, f) => s + (Number(f.fgts_value) || 0), 0);
  const folhaFechada = folha.linhas.some(f => f.status === 'closed' || f.status === 'paid');

  return ({
    competencia: comp,
    // O nome certo do processo atual — não "GFIP/SEFIP" (item 10).
    regime_fgts: 'FGTS Digital',
    transmissor_configurado: temTransmissor,
    ambiente: cfg?.ambiente || null,
    cartoes: {
      enviados: enviados.filter(e => e.status === 'enviado' || e.status === 'processado').length,
      pendentes: pendentes.length,
      prontos_para_envio: pendentes.filter(p => !p.bloqueios.length).length,
      bloqueados: pendentes.filter(p => p.bloqueios.length).length,
      rejeitados: enviados.filter(e => e.status === 'rejeitado' || e.status === 'erro').length,
      fgts_a_recolher: Math.round(fgtsMes * 100) / 100,
    },
    // O que falta mandar — montado dos fatos do RH
    pendentes,
    // O que já foi
    historico: enviados.slice(0, 50).map(e => ({
      id: e.id, tipo: e.tipo, descricao: EVENTOS[e.tipo]?.nome || e.tipo,
      status: e.status, ambiente: e.ambiente, per_apur: e.per_apur,
      protocolo: e.protocolo || e.recibo || null,
      criado_em: e.created_at, erro: e.erro || null,
    })),
    fgts: {
      competencia: comp,
      valor: Math.round(fgtsMes * 100) / 100,
      // O prazo do FGTS Digital é dia 20 do mês seguinte.
      vencimento: (() => {
        const d = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 20);
        return d.toISOString().slice(0, 10);
      })(),
      situacao: !folhaFechada ? 'aguardando fechamento da folha'
        : (temTransmissor ? 'pronto para gerar a guia' : 'sem transmissor configurado'),
    },
    conformidade: [
      { item: 'Configuração fiscal preenchida', ok: !!cfg,
        detalhe: cfg ? null : 'Cadastre CNPJ, endereço e token em Fiscal → Configuração.' },
      { item: 'Transmissor do eSocial configurado', ok: temTransmissor,
        detalhe: temTransmissor ? null : 'Sem transmissor, os eventos ficam prontos mas não são enviados.' },
      { item: 'Eventos sem bloqueio de cadastro', ok: !pendentes.some(p => p.bloqueios.length),
        detalhe: pendentes.filter(p => p.bloqueios.length).length
          ? `${pendentes.filter(p => p.bloqueios.length).length} evento(s) com dado faltando no cadastro` : null },
      { item: 'FGTS Digital em dia', ok: folhaFechada,
        detalhe: folhaFechada ? null : 'A guia depende do fechamento da folha da competência.' },
      { item: 'Sem eventos rejeitados', ok: !enviados.some(e => ['rejeitado', 'erro'].includes(e.status)) },
    ],
    eventos_suportados: EVENTOS,
    avisos,
  });
}

router.get('/esocial', async (req, res) => {
  const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();
  try {
    res.json(await levantar(req.tenantId, comp));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/esocial/preparar
 * Monta os eventos pendentes e os grava como 'pendente' em
 * ESOCIAL_EVENTOS — prontos para o transmissor. NÃO envia: assinar e
 * transmitir exige certificado, e prometer envio sem ele seria mentir
 * para quem depende do prazo legal.
 */
router.post('/esocial/preparar', async (req, res) => {
  const t = req.tenantId;
  const { tipos } = req.body || {};

  try {
    const comp = /^\d{4}-\d{2}$/.test(String(req.body?.competencia || '')) ? req.body.competencia : compAtual();
    // O MESMO levantamento que a tela mostrou.
    const dados = await levantar(t, comp);

    const alvo = (dados.pendentes || [])
      .filter(p => !p.bloqueios.length)
      .filter(p => !tipos?.length || tipos.includes(p.tipo));

    if (!alvo.length) return res.json({ preparados: 0, aviso: 'Nada pronto para preparar.' });

    const linhas = alvo.map(p => ({
      tenant_id: t, tipo: p.tipo, ref_type: 'trabalhador', ref_id: p.ref_id,
      per_apur: p.per_apur, status: 'pendente',
      payload: { colaborador: p.colaborador, cpf: p.cpf, detalhe: p.detalhe || null },
    }));

    const { error } = await supabase.from('ESOCIAL_EVENTOS').insert(linhas);
    if (error) throw error;

    audit(req, 'prepare', 'esocial', null, { eventos: linhas.length });
    res.json({
      preparados: linhas.length,
      aviso: 'Eventos montados e prontos. A transmissão exige certificado digital configurado.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
