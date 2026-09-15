// ============================================================
// CONFIGURAÇÕES › BACKUP — só administradores.
// Gerar, listar, baixar e verificar os backups da empresa. As contas
// estão em lib/backup.js.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const B = require('../lib/backup');

let gerandoAgora = new Set();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('BACKUPS').select('*')
      .eq('tenant_id', req.tenantId).order('criado_em', { ascending: false }).limit(200);
    if (error) throw error;
    const ultimoOk = (data || []).find(b => b.status === 'ok') || null;
    res.json({
      itens: data || [],
      automatico: process.env.BACKUP_AUTOMATICO !== 'false' && !!process.env.DATABASE_URL,
      sem_conexao: !process.env.DATABASE_URL,
      ultimo_ok: ultimoOk,
      horas_desde_ultimo: ultimoOk ? Math.round((Date.now() - new Date(ultimoOk.criado_em)) / 360000) / 10 : null,
      retencao: { diarios: 30, mensais: 12 },
      bucket: B.BUCKET,
    });
  } catch (err) {
    if (/BACKUPS/.test(err.message || '')) return res.status(503).json({ error: 'Migração 125 (backups) ainda não aplicada.' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (gerandoAgora.has(req.tenantId)) return res.status(409).json({ error: 'Já existe um backup sendo gerado. Aguarde terminar.' });
  gerandoAgora.add(req.tenantId);
  try {
    const r = await B.gerarBackup(req.tenantId, { origem: 'manual', usuario: req.user?.name || req.user?.email || null, userId: req.user?.id || null });
    audit(req, 'create', 'backup', r?.id, { status: r?.status, linhas: r?.linhas, bytes: r?.bytes });
    if (r?.status !== 'ok') return res.status(500).json({ error: r?.erro || 'O backup falhou.', backup: r });
    res.status(201).json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    gerandoAgora.delete(req.tenantId);
  }
});

async function doTenant(req, res) {
  const { data } = await supabase.from('BACKUPS').select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
  if (!data) { res.status(404).json({ error: 'Backup não encontrado' }); return null; }
  if (data.status !== 'ok') { res.status(409).json({ error: 'Este backup não está disponível (status: ' + data.status + ').' }); return null; }
  return data;
}

router.get('/:id/download', async (req, res) => {
  try {
    const b = await doTenant(req, res);
    if (!b) return;
    const url = await B.linkDownload(b.arquivo);
    audit(req, 'access', 'backup', b.id, { download: b.arquivo });
    res.json({ url, expira_em_segundos: 600, arquivo: b.arquivo.split('/').pop(), sha256: b.sha256 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/verificar', async (req, res) => {
  try {
    const b = await doTenant(req, res);
    if (!b) return;
    const r = await B.verificarBackup(b);
    await supabase.from('BACKUPS').update({ detalhes: { ...b.detalhes, _verificado_em: new Date().toISOString(), _verificacao_ok: r.ok } }).eq('id', b.id);
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
