const { podeModulo } = require('../lib/setores');

/**
 * Controle de acesso por módulo.
 *
 * A conta de quais módulos o usuário tem fica em lib/setores.js e roda no
 * tenantMiddleware, que deixa o resultado em req.acesso. Aqui só se
 * pergunta se a rota cabe nesse conjunto.
 *
 * Regras (resolvidas lá):
 *  - role 'admin'                → acesso total
 *  - sem setor, allowed_modules NULL → sem restrição (usuário legado)
 *  - sem setor, allowed_modules []   → nenhum módulo
 *  - com setor                   → módulos do setor + extras do usuário
 *
 * Uso: router.use('/sales', requireModules('sales', 'pdv'), salesRoutes)
 * (rotas compartilhadas aceitam vários módulos — basta ter um deles)
 */
function requireModules(...modules) {
  return (req, res, next) => {
    if (!req.userProfile) {
      return res.status(403).json({ error: 'Perfil de usuário não carregado' });
    }
    if (podeModulo(req.acesso, ...modules)) return next();

    return res.status(403).json({
      error: 'Você não tem acesso a este módulo',
      code: 'MODULE_FORBIDDEN',
      required: modules,
    });
  };
}

module.exports = { requireModules };
