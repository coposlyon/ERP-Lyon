const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por documento
});

const DOC_KINDS = ['contrato'];

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function validaCPF(v) {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === +c[10];
}

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, is_active } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('FORNECEDORES')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (search) {
      // remove caracteres de sintaxe do filtro PostgREST (injeção via busca)
      const s = String(search).replace(/[%,()]/g, ' ').trim();
      if (s) query = query.or(`name.ilike.%${s}%,cnpj.ilike.%${s}%`);
    }
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('FORNECEDORES')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, cnpj, ie, email, phone, contact_name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });

  try {
    const base = {
      tenant_id: req.tenantId,
      name, cnpj, email, phone, contact_name,
      address: address || {},
      is_active: true,
    };
    const payload = { ...base, ie: String(ie || '').trim() || null };
    let { data, error } = await supabase.from('FORNECEDORES').insert(payload).select().single();
    if (error && /\bie\b/i.test(error.message || '')) { // coluna ie ainda não existe (migration 023)
      ({ data, error } = await supabase.from('FORNECEDORES').insert(base).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, cnpj, ie, email, phone, contact_name, address, is_active } = req.body;

  try {
    const base = { name, cnpj, email, phone, contact_name, address, is_active };
    const payload = { ...base, ie: String(ie || '').trim() || null };
    let { data, error } = await supabase.from('FORNECEDORES')
      .update(payload).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error && /\bie\b/i.test(error.message || '')) { // coluna ie ainda não existe (migration 023)
      ({ data, error } = await supabase.from('FORNECEDORES')
        .update(base).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('FORNECEDORES')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    res.json({ message: 'Fornecedor desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/suppliers/:id/attachments — lista os documentos anexados
router.get('/:id/attachments', async (req, res) => {
  try {
    const { data: supplier } = await supabase
      .from('FORNECEDORES')
      .select('documents')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    res.json(supplier?.documents?.attachments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/suppliers/:id/attachments — anexa um documento e registra quem anexou
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  const { kind, uploader_name, uploader_cpf, uploader_cargo } = req.body;

  if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  if (!DOC_KINDS.includes(kind)) return res.status(400).json({ error: 'Tipo de documento inválido' });
  if (!String(uploader_name || '').trim() || !String(uploader_cargo || '').trim())
    return res.status(400).json({ error: 'Informe o nome completo e o cargo de quem está anexando' });
  if (!validaCPF(uploader_cpf))
    return res.status(400).json({ error: 'CPF inválido. Confira os números digitados.' });

  try {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${req.tenantId}/fornecedores/${id}/${Date.now()}_${kind}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('DOCUMENTOS')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('DOCUMENTOS')
      .getPublicUrl(filePath);

    const { data: supplier } = await supabase
      .from('FORNECEDORES')
      .select('documents')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    const docs = supplier?.documents || {};
    const uploaded_by = {
      name: String(uploader_name).trim(),
      cpf: soDigitos(uploader_cpf),
      cargo: String(uploader_cargo).trim(),
    };
    const now = new Date().toISOString();
    const newItem = {
      id: Date.now().toString(),
      kind,
      name: file.originalname,
      url: publicUrl,
      path: filePath,
      type: file.mimetype,
      size: file.size,
      uploaded_at: now,
      uploaded_by,
    };

    await supabase
      .from('FORNECEDORES')
      .update({
        documents: {
          ...docs,
          attachments: [...(docs.attachments || []), newItem],
          responsible: { ...uploaded_by, at: now },
        },
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/suppliers/:id/attachments/:attachmentId — remove um documento
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const { id, attachmentId } = req.params;
  try {
    const { data: supplier } = await supabase
      .from('FORNECEDORES')
      .select('documents')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    const docs = supplier?.documents || {};
    const attachments = docs.attachments || [];
    const toRemove = attachments.find(a => a.id === attachmentId);
    if (toRemove?.path) await supabase.storage.from('DOCUMENTOS').remove([toRemove.path]);

    await supabase
      .from('FORNECEDORES')
      .update({ documents: { ...docs, attachments: attachments.filter(a => a.id !== attachmentId) } })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.json({ message: 'Anexo removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
