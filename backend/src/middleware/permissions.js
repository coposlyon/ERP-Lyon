/**
 * Controle de acesso por módulo.
 *
 * Regras:
 *  - role 'admin'                     → acesso total
 *  - allowed_modules NULL/undefined   → sem restrição (usuário legado)
 *  - allowed_modules = []             → nenhum módulo
 *  - allowed_modules = ['sales', ...] → precisa conter ao menos um dos
 *                                       módulos exigidos pela rota
 *
 * Uso: router.use('/sales', requireModules('sales', 'pdv'), salesRoutes)
 * (rotas compartilhadas aceitam vários módulos — basta ter um deles)
 */
function requireModules(...modules) {
  return (req, res, next) => {
    const profile = req.userProfile;
    if (!profile) {
      return res.status(403).json({ error: 'Perfil de usuário não carregado' });
    }

    if (profile.role === 'admin') return next();

    const allowed = profile.allowed_modules;
    // NULL = usuário sem restrição configurada (legado)
    if (allowed == null) return next();

    if (Array.isArray(allowed) && modules.some(m => allowed.includes(m))) {
      return next();
    }

    return res.status(403).json({
      error: 'Você não tem acesso a este módulo',
      code: 'MODULE_FORBIDDEN',
      required: modules,
    });
  };
}

module.exports = { requireModules };
