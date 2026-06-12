const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, type, is_active, rating, sort } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('CLIENTES')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId);

    // Ordenação: alfabética (padrão) | recent = últimos admitidos
    if (sort === 'name') {
      query = query.order('name', { ascending: true });
    } else if (sort === 'recent') {
      query = query.order('display_id', { ascending: false });
    } else {
      query = query.order('display_id', { ascending: true });
    }

    if (search) {
      const isNumeric = /^\d+$/.test(search.trim());
      if (isNumeric) {
        // Busca por ID numérico OU campos texto
        query = query.or(
          `display_id.eq.${parseInt(search)},name.ilike.%${search}%,cpf_cnpj.ilike.%${search}%,phone.ilike.%${search}%,mobile.ilike.%${search}%`
        );
      } else {
        query = query.or(
          `name.ilike.%${search}%,cpf_cnpj.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,mobile.ilike.%${search}%`
        );
      }
    }

    // type=CO → só colaboradores | type=cliente → PF e PJ | sem type → todos
    if (type === 'CO') {
      query = query.eq('type', 'CO');
    } else if (type === 'cliente') {
      query = query.in('type', ['PF', 'PJ']);
    }

    if (rating)     query = query.eq('rating', parseInt(rating));
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
    credit_limit, instagram, nome_fantasia, rating, admission_data, is_active
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

    const { data, error } = await supabase
      .from('CLIENTES')
      .insert({
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
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const {
    type, name, cpf_cnpj, rg_ie, email, phone, mobile, address,
    credit_limit, is_active, instagram, nome_fantasia, rating, admission_data
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

    const { data, error } = await supabase
      .from('CLIENTES')
      .update({
        type, name, cpf_cnpj, rg_ie, email, phone, mobile, address,
        credit_limit, is_active, instagram, nome_fantasia,
        rating: rating || null,
        admission_data: {
          ...(admission_data || {}),
          attachments: existingAttachments, // sempre preserva os documentos do banco
        },
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/rating', async (req, res) => {
  const { rating } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
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
