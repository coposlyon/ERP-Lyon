const supabase = require('../config/supabase');

/**
 * Registra um evento de auditoria. Fire-and-forget: nunca bloqueia
 * nem derruba a operação principal — se a tabela AUDITORIA ainda não
 * existir (migração 005 pendente), só loga no console.
 *
 * audit(req, 'update', 'product', id, { price: { de: 10, para: 12 } })
 */
function audit(req, action, entity, entityId, details) {
  try {
    supabase
      .from('AUDITORIA')
      .insert({
        tenant_id: req.tenantId,
        user_id:   req.user?.id || null,
        user_name: req.userProfile?.name || req.user?.email || null,
        action,
        entity,
        entity_id: entityId != null ? String(entityId) : null,
        details:   details || null,
      })
      .then(({ error }) => {
        if (error) console.error('[audit]', error.message);
      });
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

module.exports = { audit };
