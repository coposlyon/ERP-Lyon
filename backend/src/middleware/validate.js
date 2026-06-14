// Middleware de validação com Joi. Valida apenas os campos declarados no
// schema; campos extras passam (allowUnknown) para não quebrar fluxos.
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, allowUnknown: true, stripUnknown: false,
    });
    if (error) {
      return res.status(400).json({ error: error.details.map(d => d.message).join('; '), code: 'VALIDATION' });
    }
    Object.assign(req.body, value);
    next();
  };
}

module.exports = { validate };
