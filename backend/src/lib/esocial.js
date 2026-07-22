/**
 * eSocial — montagem dos eventos + cliente do gateway.
 *
 * ARQUITETURA
 * Mesmo padrão da NF-e (lib/focusnfe.js): quem guarda o certificado A1,
 * assina o XML e conversa com o governo é um GATEWAY. O ERP só monta o
 * payload no formato do leiaute e manda JSON. Por isso aqui não há
 * XMLDSig, SOAP nem mTLS.
 *
 * O que é estável e o que não é:
 *  - Os BUILDERS abaixo seguem o leiaute do eSocial (definido pelo
 *    governo). Valem para qualquer gateway.
 *  - O CLIENTE HTTP no fim do arquivo é a única parte específica do
 *    fornecedor. Os caminhos seguem o formato documentado, mas DEVEM ser
 *    conferidos com a doc do gateway contratado antes da homologação.
 *
 * Fluxo: montar → validar → enviar (recebe protocolo) → consultar
 * (recebe recibo ou rejeição). O eSocial é assíncrono; nada é "enviado
 * e pronto".
 */

const VER_PROC = 'ERPLyon-1.0';   // verProc: identifica o software emissor
const PROC_EMI = 1;               // 1 = aplicativo do próprio empregador

// tpAmb do leiaute: 1 = produção, 2 = produção restrita (o "homologação"
// do eSocial). Nunca mandar dado de teste para o ambiente 1.
const TP_AMB = { producao: 1, restrita: 2 };

function tpAmb(ambiente) {
  return TP_AMB[ambiente] || TP_AMB.restrita;
}

// ── Helpers ───────────────────────────────────────────────

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

// O leiaute usa AAAA-MM-DD; o banco devolve Date ou string ISO.
function dt(v) {
  if (!v) return null;
  const s = typeof v === 'string' ? v : new Date(v).toISOString();
  return s.slice(0, 10);
}

// perApur / iniValid usam AAAA-MM
function ym(v) {
  if (!v) return null;
  return String(v).slice(0, 7);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Remove chaves nulas/vazias: o eSocial rejeita tag vazia, e o gateway
// repassa o que a gente mandar. Mais seguro omitir do que mandar "".
function clean(obj) {
  if (Array.isArray(obj)) {
    const arr = obj.map(clean).filter(v => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (obj === null || obj === '' ) return undefined;
  return obj;
}

function ideEvento(cfg, extra = {}) {
  return { tpAmb: tpAmb(cfg.ambiente), procEmi: PROC_EMI, verProc: VER_PROC, ...extra };
}

function ideEmpregador(cfg) {
  return { tpInsc: cfg.tp_insc || 1, nrInsc: digits(cfg.nr_insc) };
}

// ── Validação ─────────────────────────────────────────────
// Barrar aqui é barato; ser rejeitado pelo governo é caro (o evento vai,
// volta com erro e precisa ser reenviado). Cada função devolve a lista
// de problemas — vazia significa pronto para transmitir.

function validarConfig(cfg) {
  const err = [];
  if (!cfg)                       return ['Configuração do eSocial não preenchida'];
  if (!digits(cfg.nr_insc))       err.push('CNPJ do empregador (nr_insc) é obrigatório');
  if (!cfg.classif_trib)          err.push('Classificação tributária (classif_trib) é obrigatória');
  if (!cfg.ini_valid)             err.push('Início da validade (ini_valid, AAAA-MM) é obrigatório');
  if (!cfg.nm_ctt)                err.push('Nome do contato é obrigatório');
  if (!digits(cfg.cpf_ctt))       err.push('CPF do contato é obrigatório');
  if (digits(cfg.cpf_ctt) && digits(cfg.cpf_ctt).length !== 11)
    err.push('CPF do contato deve ter 11 dígitos');
  if (!cfg.ambiente)              err.push('Ambiente (restrita | producao) é obrigatório');
  return err;
}

function validarRubrica(r) {
  const err = [];
  if (!r.cod_rubrica)  err.push('Código da rubrica é obrigatório');
  if (!r.dsc_rubrica)  err.push('Descrição da rubrica é obrigatória');
  if (!r.ini_valid)    err.push('Início da validade (AAAA-MM) é obrigatório');
  if (!r.nat_rubrica)  err.push('Natureza da rubrica é obrigatória');
  if (![1, 2, 3, 4].includes(Number(r.tp_rubrica)))
    err.push('Tipo da rubrica deve ser 1 (provento), 2 (desconto), 3 (informativa) ou 4 (informativa dedutora)');
  return err;
}

function validarTrabalhador(t) {
  const err = [];
  if (!t)                       return ['Trabalhador não encontrado'];
  if (digits(t.cpf).length !== 11) err.push('CPF deve ter 11 dígitos');
  if (!t.nome)                  err.push('Nome é obrigatório');
  if (!t.data_nascimento)       err.push('Data de nascimento é obrigatória');
  if (!['M', 'F'].includes(t.sexo)) err.push('Sexo deve ser M ou F');
  if (!t.categoria)             err.push('Categoria do trabalhador é obrigatória (ex.: 101 = empregado geral)');
  if (!t.cbo)                   err.push('CBO da função é obrigatório');
  if (!t.data_admissao)         err.push('Data de admissão é obrigatória');
  if (!t.matricula)             err.push('Matrícula é obrigatória');
  if (!num(t.salario_base))     err.push('Salário base é obrigatório');
  if (!t.nome_mae)              err.push('Nome da mãe é obrigatório');
  const end = t.endereco || {};
  if (!end.cep || !end.codMunic)
    err.push('Endereço do trabalhador incompleto (CEP e código do município são obrigatórios)');
  if (Number(t.tp_contr) === 2 && !t.dt_term)
    err.push('Contrato por prazo determinado exige data de término');
  return err;
}

function validarFolha(payroll, itens) {
  const err = [];
  if (!payroll)                 return ['Folha não encontrada'];
  if (!payroll.reference_month) err.push('Mês de referência é obrigatório');
  if (!itens || !itens.length)
    err.push('Folha sem rubricas: o S-1200 transmite rubricas, não o salário bruto');
  for (const it of itens || []) {
    if (!it.cod_rubrica)  err.push('Item da folha sem código de rubrica');
    if (!num(it.vr_rubrica)) err.push(`Rubrica ${it.cod_rubrica || '?'} sem valor`);
  }
  return err;
}

// ── S-1000 · Informações do empregador ────────────────────
// Primeiro evento da fila. Sem ele aceito, nada mais entra.

function buildS1000(cfg, { indRetif, nrRecibo } = {}) {
  return clean({
    evtInfoEmpregador: {
      ideEvento: ideEvento(cfg, indRetif ? { indRetif, nrRecibo } : {}),
      ideEmpregador: ideEmpregador(cfg),
      infoEmpregador: {
        [indRetif ? 'alteracao' : 'inclusao']: {
          idePeriodo: { iniValid: ym(cfg.ini_valid) },
          infoCadastro: {
            classTrib:        cfg.classif_trib,
            natJurid:         cfg.nat_jur,
            indCoop:          cfg.ind_coop ?? 0,
            indConstr:        cfg.ind_constr ?? 0,
            indDesFolha:      cfg.ind_desf ?? 0,
            indOptRegEletron: cfg.ind_opt_reg_eletron ?? 0,
            indEntEd:         cfg.ind_ent_ed ?? 0,
            indEtt:           cfg.ind_ett ?? 0,
            nrRegEtt:         cfg.nr_reg_ett,
            contato: {
              nmCtt:    cfg.nm_ctt,
              cpfCtt:   digits(cfg.cpf_ctt),
              foneFixo: digits(cfg.fone_ctt),
              email:    cfg.email_ctt,
            },
          },
        },
      },
    },
  });
}

// ── S-1005 · Tabela de estabelecimentos ───────────────────
// Carrega CNAE preponderante, RAT e FAP: define quanto a empresa recolhe.

function buildS1005(cfg, { indRetif, nrRecibo } = {}) {
  return clean({
    evtTabEstab: {
      ideEvento: ideEvento(cfg, indRetif ? { indRetif, nrRecibo } : {}),
      ideEmpregador: ideEmpregador(cfg),
      infoEstab: {
        [indRetif ? 'alteracao' : 'inclusao']: {
          ideEstab: {
            tpInsc:    cfg.tp_insc || 1,
            nrInsc:    digits(cfg.nr_insc),
            iniValid:  ym(cfg.ini_valid),
          },
          dadosEstab: {
            cnaePrep: digits(cfg.cnae_preponderante),
            aliqGilrat: {
              aliqRat: cfg.aliq_rat != null ? num(cfg.aliq_rat) : undefined,
              fap:     cfg.fap != null ? num(cfg.fap) : undefined,
            },
          },
        },
      },
    },
  });
}

// ── S-1010 · Tabela de rubricas ───────────────────────────
// Precisa estar aceita ANTES do S-1200 que a utiliza.

function buildS1010(cfg, r, { indRetif, nrRecibo } = {}) {
  return clean({
    evtTabRubrica: {
      ideEvento: ideEvento(cfg, indRetif ? { indRetif, nrRecibo } : {}),
      ideEmpregador: ideEmpregador(cfg),
      infoRubrica: {
        [indRetif ? 'alteracao' : 'inclusao']: {
          ideRubrica: {
            codRubr:    r.cod_rubrica,
            ideTabRubr: r.ide_tabela_rubrica || '1',
            iniValid:   ym(r.ini_valid),
            fimValid:   ym(r.fim_valid),
          },
          dadosRubrica: {
            dscRubr:     r.dsc_rubrica,
            natRubr:     r.nat_rubrica,
            tpRubr:      r.tp_rubrica,
            codIncCP:    r.cod_inc_cp,
            codIncIRRF:  r.cod_inc_irrf,
            codIncFGTS:  r.cod_inc_fgts,
            codIncSIND:  r.cod_inc_sind,
            tetoRemun:   r.teto_remun ?? 0,
            observacao:  r.observacao,
          },
        },
      },
    },
  });
}

// ── S-2200 · Admissão / cadastro inicial do vínculo ───────
// O evento mais pesado do leiaute. Todo campo aqui vem do
// RH_ESOCIAL_TRABALHADOR (migração 046) — não de admission_data.

function buildS2200(cfg, t, { cadIni = false, indRetif, nrRecibo } = {}) {
  const end = t.endereco || {};
  const deps = Array.isArray(t.dependentes) ? t.dependentes : [];

  return clean({
    evtAdmissao: {
      ideEvento: ideEvento(cfg, indRetif ? { indRetif, nrRecibo } : {}),
      ideEmpregador: ideEmpregador(cfg),
      trabalhador: {
        cpfTrab:   digits(t.cpf),
        nmTrab:    t.nome,
        sexo:      t.sexo,
        racaCor:   t.raca_cor,
        estCiv:    t.estado_civil,
        grauInstr: t.grau_instrucao,
        nmSoc:     t.nome_social,
        nascimento: {
          dtNascto:  dt(t.data_nascimento),
          codMunic:  digits(t.municipio_nascimento) || undefined,
          uf:        t.uf_nascimento,
          paisNascto: t.pais_nascimento || '105',
          paisNac:    t.pais_nacionalidade || '105',
          nmMae:      t.nome_mae,
          nmPai:      t.nome_pai,
        },
        endereco: {
          brasil: {
            tpLgr:       end.tpLgr || 'R',
            dscLgr:      end.dscLgr || end.street,
            nrLgr:       end.nrLgr || end.number,
            complemento: end.complemento || end.complement,
            bairro:      end.bairro || end.neighborhood,
            cep:         digits(end.cep || end.zip),
            codMunic:    digits(end.codMunic),
            uf:          end.uf || end.state,
          },
        },
        // O leiaute aceita N dependentes; quem preenche é a tela do RH.
        dependente: deps.map(d => ({
          tpDep:      d.tpDep,
          nmDep:      d.nmDep || d.nome,
          dtNascto:   dt(d.dtNascto || d.data_nascimento),
          cpfDep:     digits(d.cpfDep || d.cpf),
          depIRRF:    d.depIRRF ?? 'N',
          depSF:      d.depSF ?? 'N',
          incTrab:    d.incTrab ?? 'N',
        })),
        documentos: {
          CTPS: t.ctps_numero ? {
            nrCtps:    t.ctps_numero,
            serieCtps: t.ctps_serie,
            ufCtps:    t.ctps_uf,
          } : undefined,
          RG: t.rg_numero ? {
            nrRg:       t.rg_numero,
            orgaoEmissor: t.rg_orgao_emissor,
            dtExped:    dt(t.rg_data_expedicao),
          } : undefined,
          CNH: t.cnh_numero ? {
            nrRegCnh:   t.cnh_numero,
            categoriaCnh: t.cnh_categoria,
            dtValid:    dt(t.cnh_validade),
          } : undefined,
        },
      },
      vinculo: {
        matricula:  t.matricula,
        tpRegTrab:  t.tp_reg_trab ?? 1,
        tpRegPrev:  t.tp_reg_prev ?? 1,
        // cadIni = true só na carga inicial (vínculos que já existiam
        // antes de a empresa entrar no eSocial).
        cadIni:     cadIni ? 'S' : 'N',
        infoRegimeTrab: {
          infoCeletista: {
            dtAdm:        dt(t.data_admissao),
            tpAdmissao:   t.tp_admissao ?? 1,
            indAdmissao:  t.ind_admissao ?? 1,
            natAtividade: t.nat_atividade ?? 1,
            FGTS: { opcFGTS: 1, dtOpcFGTS: dt(t.data_admissao) },
          },
        },
        infoContrato: {
          CBOCargo:  digits(t.cbo),
          codCateg:  t.categoria,
          remuneracao: {
            vrSalFx:    num(t.salario_base),
            undSalFixo: t.und_sal_fixo ?? 5,
            dscSalVar:  t.dsc_sal_var,
          },
          duracao: {
            tpContr:    t.tp_contr ?? 1,
            dtTerm:     dt(t.dt_term),
            clauAssec:  t.clau_assec,
          },
          localTrabalho: {
            localTrabGeral: {
              tpInsc: t.local_tp_insc ?? cfg.tp_insc ?? 1,
              nrInsc: digits(t.local_nr_insc || cfg.nr_insc),
            },
          },
          horContratual: {
            qtdHrsSem: t.qtd_hrs_sem != null ? num(t.qtd_hrs_sem) : undefined,
            tpJornada: t.tp_jornada,
            dscTpJorn: t.dsc_jorn_trab,
          },
        },
      },
    },
  });
}

// ── S-1200 · Remuneração do trabalhador ───────────────────
// Evento periódico. NÃO manda "salário bruto": manda cada rubrica.
// Por isso a folha precisa de RH_SALARIOS_ITENS.

function buildS1200(cfg, { trabalhador, payroll, itens, codLotacao }) {
  const perApur = ym(payroll.reference_month);

  return clean({
    evtRemun: {
      ideEvento: ideEvento(cfg, { indApuracao: 1, perApur }),
      ideEmpregador: ideEmpregador(cfg),
      ideTrabalhador: { cpfTrab: digits(trabalhador.cpf) },
      dmDev: [{
        ideDmDev: `${payroll.kind || 'mensal'}-${perApur}`,
        codCateg: trabalhador.categoria,
        infoPerApur: {
          ideEstabLot: [{
            tpInsc:     cfg.tp_insc || 1,
            nrInsc:     digits(cfg.nr_insc),
            codLotacao: codLotacao || digits(cfg.nr_insc),
            remunPerApur: [{
              matricula: trabalhador.matricula,
              itensRemun: (itens || []).map(it => ({
                codRubr:    it.cod_rubrica,
                ideTabRubr: it.ide_tabela_rubrica || '1',
                qtdRubr:    it.qtd_rubrica != null ? num(it.qtd_rubrica) : undefined,
                fatorRubr:  it.fator_rubrica != null ? num(it.fator_rubrica) : undefined,
                vrUnit:     it.vr_unit != null ? num(it.vr_unit) : undefined,
                vrRubr:     num(it.vr_rubrica),
                indApurIR:  it.ind_apur_ir ?? 0,
              })),
            }],
          }],
        },
      }],
    },
  });
}

// ── S-2299 · Desligamento ─────────────────────────────────

function buildS2299(cfg, t, { dtDeslig, mtvDeslig, indRetif, nrRecibo } = {}) {
  return clean({
    evtDeslig: {
      ideEvento: ideEvento(cfg, indRetif ? { indRetif, nrRecibo } : {}),
      ideEmpregador: ideEmpregador(cfg),
      ideVinculo: {
        cpfTrab:   digits(t.cpf),
        matricula: t.matricula,
      },
      infoDeslig: {
        mtvDeslig:  mtvDeslig || t.mtv_desligamento,
        dtDeslig:   dt(dtDeslig || t.data_desligamento),
        indPagtoAPI: 'N',
      },
    },
  });
}

// Despacha a montagem pelo tipo do evento.
function buildEvento(tipo, cfg, ctx = {}, opts = {}) {
  switch (tipo) {
    case 'S-1000': return buildS1000(cfg, opts);
    case 'S-1005': return buildS1005(cfg, opts);
    case 'S-1010': return buildS1010(cfg, ctx.rubrica, opts);
    case 'S-2200': return buildS2200(cfg, ctx.trabalhador, opts);
    case 'S-1200': return buildS1200(cfg, ctx);
    case 'S-2299': return buildS2299(cfg, ctx.trabalhador, opts);
    default: throw new Error(`Evento não suportado: ${tipo}`);
  }
}

// ── Cliente do gateway ────────────────────────────────────
// ÚNICA parte específica de fornecedor. Trocar de gateway = trocar
// (ou acrescentar) uma entrada em PROVIDERS.
//
// ATENÇÃO: os caminhos abaixo seguem o formato REST documentado pelos
// gateways, mas PRECISAM ser conferidos contra a doc do fornecedor
// contratado antes da homologação. É de propósito que estejam
// concentrados aqui e não espalhados pelas rotas.

const PROVIDERS = {
  tecnospeed: {
    base: 'https://api.esocial.tecnospeed.com.br',
    auth: token => ({ Authorization: `Bearer ${token}` }),
    paths: {
      enviar:    '/v1/eventos',
      consultar: p => `/v1/eventos/protocolo/${encodeURIComponent(p)}`,
    },
  },
  resocial: {
    base: 'https://api.resocial.com.br',
    auth: token => ({ 'X-API-Key': token }),
    paths: {
      enviar:    '/v1/eventos',
      consultar: p => `/v1/eventos/${encodeURIComponent(p)}`,
    },
  },
  custom: {
    base: null,               // exige provider_base_url no CONFIG_ESOCIAL
    auth: token => ({ Authorization: `Bearer ${token}` }),
    paths: {
      enviar:    '/eventos',
      consultar: p => `/eventos/${encodeURIComponent(p)}`,
    },
  },
};

function provider(cfg) {
  const p = PROVIDERS[cfg.provider] || PROVIDERS.tecnospeed;
  const base = cfg.provider_base_url || p.base;
  if (!base) throw new Error('Gateway do eSocial sem URL base configurada (provider_base_url)');
  return { ...p, base };
}

// O token é por ambiente: nunca usar o de produção em teste.
function tokenAtivo(cfg) {
  return cfg.ambiente === 'producao' ? cfg.provider_token_producao : cfg.provider_token_restrita;
}

function configurado(cfg) {
  return !!(cfg && tokenAtivo(cfg));
}

async function request(cfg, method, path, body) {
  const p = provider(cfg);
  const token = tokenAtivo(cfg);
  if (!token) {
    return { ok: false, status: 0, data: { erro: 'eSocial não configurado: token do gateway ausente para este ambiente' } };
  }

  let res;
  try {
    res = await fetch(`${p.base}${path}`, {
      method,
      headers: { ...p.auth(token), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Rede fora do ar não pode derrubar a rota: vira erro tratável e o
    // evento continua 'pendente' para retentativa.
    return { ok: false, status: 0, data: { erro: `Falha de rede ao falar com o gateway: ${err.message}` } };
  }

  let data = null;
  try { data = await res.json(); } catch { /* respostas sem corpo */ }
  return { ok: res.ok, status: res.status, data };
}

// Envia um evento. Resposta esperada: protocolo (processamento assíncrono).
function enviarEvento(cfg, tipo, payload) {
  const p = provider(cfg);
  return request(cfg, 'POST', p.paths.enviar, {
    tipo,
    ambiente: tpAmb(cfg.ambiente),
    empregador: cfg.provider_empregador_id || digits(cfg.nr_insc),
    evento: payload,
  });
}

// Consulta o resultado pelo protocolo. Só depois disso existe recibo.
function consultarProtocolo(cfg, protocolo) {
  const p = provider(cfg);
  return request(cfg, 'GET', p.paths.consultar(protocolo));
}

// Normaliza a resposta do gateway para a máquina de estado do banco.
// Cada fornecedor nomeia os campos do seu jeito; concentramos aqui.
function normalizarRetorno(data) {
  if (!data) return { status: 'aguardando_retorno' };

  const recibo    = data.recibo || data.nrRecibo || data.numeroRecibo || null;
  const protocolo = data.protocolo || data.numeroProtocolo || null;
  const bruto     = String(data.status || data.situacao || '').toLowerCase();

  const erros = data.erros || data.ocorrencias || data.mensagens || [];
  const erroMsg = Array.isArray(erros) && erros.length
    ? (erros[0].descricao || erros[0].mensagem || erros[0].message || JSON.stringify(erros[0]))
    : (data.erro || data.mensagemErro || null);

  let status = 'aguardando_retorno';
  if (recibo || ['sucesso', 'aceito', 'processado', 'ok'].some(s => bruto.includes(s))) {
    status = 'sucesso';
  } else if (['rejeit', 'erro', 'inconsist'].some(s => bruto.includes(s)) || erroMsg) {
    status = 'rejeitado';
  }

  return { status, recibo, protocolo, erro_msg: erroMsg, retorno: data };
}

module.exports = {
  // builders
  buildEvento, buildS1000, buildS1005, buildS1010, buildS2200, buildS1200, buildS2299,
  // validação
  validarConfig, validarRubrica, validarTrabalhador, validarFolha,
  // gateway
  enviarEvento, consultarProtocolo, normalizarRetorno, configurado, tokenAtivo,
  // utilitários
  digits, dt, ym, tpAmb, VER_PROC,
};
