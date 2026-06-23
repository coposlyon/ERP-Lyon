const nodemailer = require('nodemailer');
const supabase = require('../config/supabase');

// Lê a configuração de e-mail (SMTP) da empresa — guardada em EMPRESAS.settings.email.
async function getEmailConfig(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings, name, email').eq('id', tenantId).maybeSingle();
    const s = (data?.settings && data.settings.email) || {};
    return { ...s, _companyName: data?.name, _companyEmail: data?.email };
  } catch {
    return {};
  }
}

function makeTransport(cfg) {
  const port = Number(cfg.smtp_port) || 587;
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port,
    secure: cfg.smtp_secure != null ? !!cfg.smtp_secure : port === 465,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  });
}

module.exports = { getEmailConfig, makeTransport };
