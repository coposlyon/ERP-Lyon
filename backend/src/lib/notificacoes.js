// ============================================================
// AVISAR O COLABORADOR — E REGISTRAR QUE AVISOU.
//
// "O sistema manda WhatsApp automático" é a frase mais fácil de
// escrever e a mais fácil de mentir. Sem registro, ninguém sabe se a
// mensagem saiu, se falhou ou se foi entregue duas vezes — e o RH
// descobre no dia em que o colaborador diz "nunca me avisaram".
//
// Aqui toda mensagem vira LINHA em RH_NOTIFICACOES antes de qualquer
// tentativa de envio. Se houver integração configurada, tenta enviar e
// grava o resultado. Se NÃO houver, a linha fica em 'pendente' com o
// texto pronto: o RH copia e manda à mão, e o sistema não finge que
// enviou.
//
// A INTEGRAÇÃO É GENÉRICA DE PROPÓSITO. Em Configurações →
// Empresa.settings.whatsapp o cliente informa uma URL e um token; o
// sistema faz um POST com { para, mensagem }. Serve para Z-API, Evolution,
// Meta Cloud API com um adaptador na frente, ou um n8n — sem prender a
// Lyon a um fornecedor que pode sumir.
// ============================================================
const supabase = require('../config/supabase');

const soDigitos = v => String(v || '').replace(/\D/g, '');

/** Telefone com DDI do Brasil quando vier sem. */
function comDDI(fone) {
  const d = soDigitos(fone);
  if (!d) return null;
  return d.length <= 11 ? `55${d}` : d;
}

async function configWhatsapp(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings, phone').eq('id', tenantId).maybeSingle();
    const w = data?.settings?.whatsapp || {};
    return {
      ativo: !!(w.url && w.enabled !== false),
      url: w.url || null,
      token: w.token || null,
      campo_para: w.campo_para || 'para',
      campo_texto: w.campo_texto || 'mensagem',
      remetente: data?.phone || null,
    };
  } catch { return { ativo: false }; }
}

/**
 * Enfileira (e tenta enviar) um aviso.
 *
 * Devolve a linha gravada — inclusive quando não há integração. Quem
 * chamou nunca precisa saber se o WhatsApp está ligado: o registro
 * existe do mesmo jeito.
 */
async function notificar(tenantId, { employee_id, telefone, mensagem, motivo, ref_type, ref_id, assunto }) {
  const destino = comDDI(telefone);
  const base = {
    tenant_id: tenantId, employee_id: employee_id || null,
    canal: 'whatsapp', destino, assunto: assunto || null,
    mensagem, motivo: motivo || null,
    ref_type: ref_type || null, ref_id: ref_id || null,
    status: 'pendente',
  };

  let linha = null;
  try {
    const { data } = await supabase.from('RH_NOTIFICACOES').insert(base).select().single();
    linha = data;
  } catch {
    // Tabela ausente (migração 082 pendente): não derruba o ponto por
    // causa de um aviso.
    return { ...base, id: null, salvo: false };
  }

  if (!destino) {
    await supabase.from('RH_NOTIFICACOES')
      .update({ status: 'falhou', erro: 'Colaborador sem telefone cadastrado' }).eq('id', linha.id);
    return { ...linha, status: 'falhou' };
  }

  const cfg = await configWhatsapp(tenantId);
  if (!cfg.ativo) return linha;    // fica pendente, com o texto pronto

  try {
    const corpo = { [cfg.campo_para]: destino, [cfg.campo_texto]: mensagem };
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { data } = await supabase.from('RH_NOTIFICACOES')
      .update({ status: 'enviada', enviada_em: new Date().toISOString(), tentativas: 1 })
      .eq('id', linha.id).select().single();
    return data;
  } catch (e) {
    const { data } = await supabase.from('RH_NOTIFICACOES')
      .update({ status: 'falhou', erro: String(e.message).slice(0, 200), tentativas: 1 })
      .eq('id', linha.id).select().single();
    return data;
  }
}

/**
 * Os textos. Ficam juntos para o RH poder ler tudo o que o sistema diz
 * em nome da empresa num lugar só — e para ninguém escrever "vc" numa
 * mensagem e "você" na outra.
 */
const MENSAGENS = {
  atraso: ({ nome, data, minutos, tolerancia }) =>
    `Olá, ${nome}. Registramos ${minutos} minuto(s) de atraso em ${data} `
    + `(a tolerância combinada é de ${tolerancia} minutos). `
    + `Se houve um motivo, responda esta mensagem com a justificativa e, se tiver, o comprovante — `
    + `ela entra direto no sistema para análise do RH.`,

  falta: ({ nome, data }) =>
    `Olá, ${nome}. Não identificamos marcação de ponto em ${data}. `
    + `Se você trabalhou ou teve algum imprevisto, responda com a justificativa e o comprovante (atestado, declaração) `
    + `para o RH analisar.`,

  justificativa_aprovada: ({ nome, data }) =>
    `Olá, ${nome}. Sua justificativa referente a ${data} foi aprovada pelo RH. Nada mais é necessário.`,

  justificativa_recusada: ({ nome, data, motivo }) =>
    `Olá, ${nome}. Sua justificativa referente a ${data} não foi aceita${motivo ? `: ${motivo}` : '.'} `
    + `Procure o RH para entender os próximos passos.`,
};

module.exports = { notificar, MENSAGENS, configWhatsapp, comDDI };
