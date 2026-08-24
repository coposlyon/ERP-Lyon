// ============================================================
// Configurações → Permissões por setor.
//
// A matriz setor × módulo. Quem edita aqui decide o que cada área da
// empresa enxerga do ERP — e, no caso do setor de Vendas, decide também
// que ele vê a área enxuta em vez do sistema inteiro.
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { MODULOS, MODULO_KEYS, LAYOUTS, MODULOS_SEM_TELA, listSetores, tabelaAusente } = require('../lib/setores');
const { audit } = require('../lib/audit');

// A lista de módulos é pública dentro do ERP: é o que a tela desenha
// como colunas, e não revela nada além dos nomes dos módulos.
router.get('/modulos', (req, res) => res.json(MODULOS));

// Os módulos que nenhuma tela do menu alcança. A tela de Permissões
// desenha uma seção só para eles — marcar páginas jamais os liberaria.
router.get('/modulos-sem-tela', (req, res) => res.json(MODULOS_SEM_TELA));

/**
 * O acesso desta sessão, recalculado agora.
 *
 * O login guarda um retrato no navegador; sem isto, mudar a permissão de
 * um setor só valeria depois que a pessoa fizesse logout — e ninguém faz
 * logout. A tela consulta na abertura e se acerta sozinha.
 */
router.get('/meu-acesso', (req, res) => {
  res.json({
    allowed_modules: req.acesso?.modules ?? null,
    // Telas liberadas — a tela pergunta a cada carregamento, então
    // tirar uma permissão vale no próximo F5, não só no próximo login.
    allowed_screens: req.acesso?.screens ?? null,
    layout: req.acesso?.layout || 'erp',
    home_path: req.acesso?.home || '/',
    sector_key: req.acesso?.setor || null,
    sector_name: req.acesso?.setorName || null,
    role: req.userProfile?.role || null,
  });
});

router.get('/', async (req, res) => {
  try {
    const { setores, missing } = await listSetores(req.tenantId);
    res.json({ setup_pending: missing, setores });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Quem pode mexer: só administrador. Permissão é assunto de dono. */
function soAdmin(req, res, next) {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores alteram as permissões dos setores' });
  }
  next();
}

/** Só caminhos de tela plausíveis — nada de texto solto virando permissão. */
function limparTelas(v) {
  if (!Array.isArray(v)) return undefined;   // undefined = não mexer na coluna
  return [...new Set(v.map(String).filter(t => /^\/[\w\-/:]*$/.test(t)))];
}

function limpar(body) {
  const modules = (Array.isArray(body.modules) ? body.modules : [])
    .map(String).filter(m => MODULO_KEYS.has(m));
  const screens = limparTelas(body.screens);
  return {
    name: String(body.name || '').slice(0, 60) || 'Setor',
    modules,
    // A tela manda as duas listas: as TELAS, que é o que o
    // administrador escolheu de fato, e os MÓDULOS que elas implicam,
    // porque é o módulo que a API confere a cada requisição. Guardar
    // só as telas obrigaria o servidor a conhecer o menu, que é
    // assunto do front — e aí passariam a existir dois menus.
    ...(screens !== undefined ? { screens } : {}),
    layout: LAYOUTS.includes(body.layout) ? body.layout : 'erp',
    home_path: String(body.home_path || '/').slice(0, 120),
    sort: Number(body.sort) || 0,
  };
}

router.post('/', soAdmin, async (req, res) => {
  const key = String(req.body.key || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!key) return res.status(400).json({ error: 'Informe a chave do setor (ex.: comercial)' });
  try {
    const { data, error } = await supabase.from('SETORES_PERFIS').insert({
      tenant_id: req.tenantId, key, ...limpar(req.body),
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe um setor com essa chave' });
      throw error;
    }
    audit(req, 'create', 'setor', data.id, { key, modulos: data.modules.length });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', soAdmin, async (req, res) => {
  try {
    const patch = limpar(req.body);
    const { data, error } = await supabase.from('SETORES_PERFIS')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'setor', req.params.id, { modulos: patch.modules.length, layout: patch.layout });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', soAdmin, async (req, res) => {
  try {
    // Apagar um setor com gente dentro jogaria essas pessoas de volta na
    // regra antiga sem ninguém perceber. Melhor bloquear e explicar.
    const { data: setor } = await supabase.from('SETORES_PERFIS')
      .select('key').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!setor) return res.status(404).json({ error: 'Setor não encontrado' });

    const { count } = await supabase.from('USUARIOS')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).eq('sector_key', setor.key);
    if (count > 0) {
      return res.status(400).json({ error: `${count} usuário(s) ainda estão neste setor. Mova-os antes de excluir.` });
    }

    const { error } = await supabase.from('SETORES_PERFIS')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'setor', req.params.id, { key: setor.key });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Quem está em cada setor ──────────────────────────────────
router.get('/usuarios', async (req, res) => {
  try {
    const { data, error } = await supabase.from('USUARIOS')
      .select('id, name, email, role, is_active, sector_key, allowed_modules, allowed_screens')
      .eq('tenant_id', req.tenantId).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * PUT /api/setores/usuarios/:id
 *
 * Move a pessoa de setor e/ou define a lista de telas dela.
 *
 * `allowed_screens: null` devolve a pessoa para a herança do setor — e
 * essa é a opção que a tela oferece de volta em um clique. Sem isso,
 * qualquer ajuste individual seria definitivo e o setor viraria
 * decoração depois do primeiro ajuste.
 */
router.put('/usuarios/:id', soAdmin, async (req, res) => {
  const sector_key = req.body.sector_key ? String(req.body.sector_key) : null;
  try {
    if (sector_key) {
      const { data: existe } = await supabase.from('SETORES_PERFIS')
        .select('key').eq('tenant_id', req.tenantId).eq('key', sector_key).maybeSingle();
      if (!existe) return res.status(400).json({ error: 'Setor não encontrado' });
    }
    const patch = { sector_key };

    // 'screens' só entra no patch quando a chamada fala dele. Assim
    // mover alguém de setor não apaga sem querer a lista própria dela.
    if ('allowed_screens' in req.body) {
      patch.allowed_screens = req.body.allowed_screens === null
        ? null                                   // volta a herdar do setor
        : (limparTelas(req.body.allowed_screens) || []);
    }
    if ('allowed_modules' in req.body) {
      patch.allowed_modules = req.body.allowed_modules === null ? null
        : (Array.isArray(req.body.allowed_modules) ? req.body.allowed_modules : [])
            .map(String).filter(m => MODULO_KEYS.has(m));
    }

    const { data, error } = await supabase.from('USUARIOS')
      .update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, name, email, role, sector_key, allowed_modules, allowed_screens').single();
    if (error) { if (tabelaAusente(error)) return res.status(503).json({ error: 'Rode a migração 067 no banco.' }); throw error; }
    audit(req, 'update', 'usuario_setor', req.params.id, {
      sector_key,
      telas: patch.allowed_screens === null ? 'herda do setor'
        : (patch.allowed_screens ? patch.allowed_screens.length : undefined),
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
