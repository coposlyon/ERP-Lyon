// ============================================================
// CADASTRO COMPLETO DO COLABORADOR.
//
// Era um modal. Um modal para guardar a vida funcional de uma pessoa —
// identidade, família, conta bancária, contrato, documentos e o acesso
// dela ao sistema — obrigava a caber tudo numa janelinha, e o que não
// cabia simplesmente não era perguntado.
//
// Agora é tela cheia, em cinco etapas que seguem a admissão de verdade:
//
//   1. Dados pessoais      quem é a pessoa e como o sistema fala com ela
//   2. Dados trabalhistas  o que foi combinado de trabalho e dinheiro
//   3. Documentação        os papéis que comprovam o combinado
//   4. Contrato e políticas o que ela assinou
//   5. Revisão e conclusão o que ela enxerga do sistema
//
// SALVAR NÃO ESPERA A ÚLTIMA ETAPA. O botão grava a qualquer momento —
// meio cadastro salvo vale mais do que um cadastro perdido porque o
// telefone tocou na etapa 2. Só o que é essencial para existir um
// colaborador (nome e departamento) é cobrado.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Save, Loader2, Check, Camera, Trash2, UserCircle2,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DadosPessoais, DadosTrabalhistas, Documentacao, ContratoPoliticas, Revisao } from './passos';
import { StatusDocumentos, CapturaFacial } from './pecas';
import { TOM, Pagina, Bloco, Medidor, ItemResumo } from '@/components/RH/kit';
import {
  dinheiroParaNumero, numeroParaDinheiro, fmtMoeda, soDigitos, mCEP,
} from './campos';

// A ordem aprovada. Estava trocada aqui — Documentação em 3º e Contrato
// em 4º — enquanto o servidor e a tela de Admissões já usavam a ordem
// certa. As duas discordavam sobre em que etapa a pessoa estava.
const ETAPAS = [
  { n: 1, titulo: 'Dados Pessoais' },
  { n: 2, titulo: 'Dados Trabalhistas' },
  { n: 3, titulo: 'Contrato e Políticas' },
  { n: 4, titulo: 'Documentação' },
  { n: 5, titulo: 'Revisão e Conclusão' },
];

// Os campos em dinheiro: guardados como número, mostrados com máscara.
const CAMPOS_DINHEIRO = ['salary', 'sales_goal', 'benefit_vt', 'benefit_vr', 'benefit_health', 'benefit_other'];

const VAZIO = {
  name: '', nome_social: '', cpf_cnpj: '', birth_date: '', rg_ie: '', rg_emissao: '',
  nacionalidade: 'Brasileira', estado_civil: '', genero: '', mother_name: '', father_name: '',
  conjuge_nome: '', conjuge_cpf: '', conjuge_nascimento: '', conjuge_telefone: '',
  filhos: [],
  email: '', phone: '', mobile: '',
  address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip: '' },
  banco: '', agencia: '', conta: '', tipo_conta: '', pix: '', titular_conta: '',
  has_access: false, access_email: '', access_password: '', email_corporativo: '',
  whatsapp_notificacoes: '', ponto_metodo: '',
  sector: '', role: '', contract_type: 'CLT', start_date: '', scale_id: '', monthly_hours: '',
  experiencia: '', salary: '', commission_pct: '', sales_goal: '',
  benefit_vt: '', benefit_vr: '', benefit_health: '', benefit_other: '',
  pis: '', ctps_numero: '', ctps_serie: '', ctps_uf: '', titulo_eleitor: '', reservista: '',
  cnh: '', cnh_categoria: '',
  contrato_assinado_em: '', experiencia_fim: '', exame_admissional: '', observacoes: '',
  politicas: {},
  is_active: true,
};

/** O que conta como etapa concluída — é isso que move a barra de progresso. */
function etapasConcluidas(f, temAnexos, acesso) {
  return [
    !!(f.name && f.cpf_cnpj && f.birth_date && f.address?.city),
    !!(f.sector && f.role && f.contract_type && f.start_date && f.salary && f.scale_id),
    !!(f.contrato_assinado_em || Object.values(f.politicas || {}).some(Boolean)),
    temAnexos,
    !f.has_access || !!acesso.role,
  ];
}

export default function EmployeeFull() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const editando = !!id;

  const [etapa, setEtapa] = useState(1);
  const [f, setF] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [foto, setFoto] = useState(null);        // data URL nova, se trocada
  const [fotoAtual, setFotoAtual] = useState(null);
  const entradaFoto = useRef();

  // Acesso ao sistema: papel, módulos e telas. Mora fora do `f` porque
  // não é dado do colaborador — é dado do USUÁRIO dele.
  const [acesso, setAcesso] = useState({ role: 'operator', allowed_modules: [], allowed_screens: null });

  const { data: colaborador, isLoading } = useQuery({
    queryKey: ['colaborador', id],
    queryFn: () => api.get(`/customers/${id}`),
    enabled: editando,
  });

  const { data: anexos = [] } = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => api.get(`/customers/${id}/attachments`),
    enabled: editando,
  });

  // Carrega o colaborador no rascunho
  useEffect(() => {
    if (!colaborador) return;
    const adm = colaborador.admission_data || {};
    const carregado = { ...VAZIO, ...adm,
      name: colaborador.name || '',
      cpf_cnpj: colaborador.cpf_cnpj || '',
      rg_ie: colaborador.rg_ie || '',
      email: colaborador.email || '',
      phone: colaborador.phone || '',
      mobile: colaborador.mobile || '',
      birth_date: colaborador.birth_date || adm.birth_date || '',
      address: { ...VAZIO.address, ...(colaborador.address || {}) },
      filhos: Array.isArray(adm.filhos) ? adm.filhos : [],
      politicas: adm.politicas || {},
      access_password: '',
      is_active: colaborador.is_active !== false,
    };
    for (const k of CAMPOS_DINHEIRO) carregado[k] = numeroParaDinheiro(adm[k]);
    setF(carregado);
    setFotoAtual(colaborador.avatar_url || null);
  }, [colaborador]);

  // Carrega o acesso atual (papel, módulos e telas) pelo e-mail de login
  useEffect(() => {
    const email = (f.access_email || '').trim();
    if (!editando || !f.has_access || !email || !isAdmin) return;
    let vivo = true;
    api.get(`/employees/access?email=${encodeURIComponent(email)}`)
      .then(r => {
        if (!vivo || !r?.existe) return;
        setAcesso({
          role: r.role || 'operator',
          allowed_modules: r.allowed_modules || [],
          allowed_screens: r.allowed_screens ?? null,
        });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [editando, f.has_access, f.access_email, isAdmin]);

  const set = (campo, valor) => setF(p => ({ ...p, [campo]: valor }));
  const setEndereco = (campo, valor) => setF(p => ({ ...p, address: { ...p.address, [campo]: valor } }));

  async function buscarCep(cep) {
    const limpo = soDigitos(cep);
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`/api/cep/${limpo}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'CEP não encontrado'); return; }
      setF(p => ({ ...p, address: { ...p.address,
        street: (d.street || p.address.street || '').toUpperCase(),
        neighborhood: (d.neighborhood || p.address.neighborhood || '').toUpperCase(),
        city: (d.city || p.address.city || '').toUpperCase(),
        state: d.state || p.address.state || '',
        zip: mCEP(cep),
      } }));
    } catch { toast.error('Erro ao buscar o CEP'); }
    finally { setBuscandoCep(false); }
  }

  function escolherFoto(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 4 * 1024 * 1024) { toast.error('Foto muito grande (máx. 4 MB)'); return; }
    const leitor = new FileReader();
    leitor.onload = () => setFoto(leitor.result);
    leitor.readAsDataURL(arquivo);
    e.target.value = '';
  }

  const concluidas = etapasConcluidas(f, anexos.length > 0, acesso);
  const progresso = Math.round((concluidas.filter(Boolean).length / ETAPAS.length) * 100);

  const resumo = useMemo(() => ([
    { label: 'Departamento', valor: f.sector },
    { label: 'Cargo', valor: f.role },
    { label: 'Contrato', valor: f.contract_type },
    { label: 'Admissão', valor: f.start_date ? f.start_date.split('-').reverse().join('/') : '' },
    { label: 'Salário', valor: f.salary ? fmtMoeda(dinheiroParaNumero(f.salary)) : '' },
    { label: 'Jornada', valor: f.monthly_hours ? `${f.monthly_hours}h/mês` : '' },
    { label: 'Acesso ao sistema', valor: f.has_access ? (f.access_email || 'sim') : 'sem acesso' },
    { label: 'Documentos', valor: `${anexos.length} anexado(s)` },
  ]), [f, anexos.length]);

  // O MESMO mínimo que o servidor exige (backend/src/lib/colaborador.js).
  // Aqui é só gentileza: avisar antes de enviar e levar a pessoa à etapa
  // certa. A regra que vale é a de lá — esta tela não é a única porta.
  const OBRIGATORIOS = [
    { ok: () => f.name.trim(), etapa: 1, msg: 'Informe o nome do colaborador' },
    { ok: () => f.cpf_cnpj, etapa: 1, msg: 'Informe o CPF — sem ele o eSocial não transmite nada' },
    { ok: () => f.sector, etapa: 2, msg: 'Informe o departamento' },
    { ok: () => f.role, etapa: 2, msg: 'Informe o cargo — o eSocial rejeita a admissão sem ele' },
    { ok: () => f.contract_type, etapa: 2, msg: 'Informe o tipo de contrato' },
    { ok: () => f.start_date, etapa: 2, msg: 'Informe a data de admissão — férias e 13º saem dela' },
    { ok: () => dinheiroParaNumero(f.salary) > 0, etapa: 2, msg: 'Informe o salário — sem ele a folha fecha em zero' },
    { ok: () => f.scale_id, etapa: 2, msg: 'Escolha a escala — é ela que define atraso e falta' },
  ];

  async function salvar({ irPara } = {}) {
    const pendente = OBRIGATORIOS.find(o => !o.ok());
    if (pendente) { toast.error(pendente.msg); setEtapa(pendente.etapa); return; }
    if (f.has_access && !f.access_email) { toast.error('Informe o e-mail de acesso'); setEtapa(1); return; }
    if (f.has_access && !editando && !f.access_password) {
      toast.error('Informe a senha inicial do acesso'); setEtapa(1); return;
    }

    setSalvando(true);
    try {
      // Dinheiro vai como número; a máscara é só visual.
      const adm = { ...f };
      for (const k of CAMPOS_DINHEIRO) adm[k] = dinheiroParaNumero(adm[k]);
      const pct = parseFloat(String(adm.commission_pct ?? '').replace(',', '.'));
      adm.commission_pct = Number.isFinite(pct) ? pct : null;
      delete adm.access_password;   // senha nunca é gravada no cadastro

      const corpo = {
        type: 'CO',
        name: f.name,
        cpf_cnpj: f.cpf_cnpj || null,
        rg_ie: f.rg_ie || null,
        email: f.email || null,
        phone: f.phone || null,
        mobile: f.mobile || null,
        birth_date: f.birth_date || null,
        address: f.address,
        is_active: f.is_active,
        admission_data: adm,
        ...(foto ? { avatar: foto } : {}),
      };

      let idSalvo = id;
      if (editando) {
        await api.put(`/customers/${id}`, corpo);
      } else {
        const novo = await api.post('/customers', corpo);
        idSalvo = novo.id;
      }

      // O acesso ao sistema é outro registro (USUARIOS) — e só admin mexe.
      if (f.has_access && f.access_email && isAdmin) {
        const r = await api.post('/employees/access', {
          customer_id: idSalvo,
          email: f.access_email,
          password: f.access_password || undefined,
          name: f.name,
          phone: f.phone || null,
          role: acesso.role,
          allowed_modules: acesso.allowed_modules,
          allowed_screens: acesso.allowed_screens,
        });
        if (r?.aviso) toast(r.aviso, { icon: '⚠️', duration: 6000 });
      }

      toast.success(editando ? 'Colaborador atualizado' : 'Colaborador cadastrado');
      qc.invalidateQueries(['employees']);
      qc.invalidateQueries(['colaborador', idSalvo]);
      setFoto(null);

      if (!editando && idSalvo) navigate(`/employees/${idSalvo}`, { replace: true });
      if (irPara) setEtapa(irPara);
    } catch (err) {
      if (err?.duplicate) {
        toast.error(`CPF já cadastrado: ${err.existing_name}`);
        setEtapa(1);
      } else {
        toast.error(err?.error || 'Erro ao salvar');
      }
    } finally { setSalvando(false); }
  }

  if (editando && isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const ultima = etapa === ETAPAS.length;

  return (
    <Pagina>
      {/* Cabeçalho: trilha, título e as duas ações — na ordem da imagem. */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[12px] flex items-center gap-1.5" style={{ color: TOM.texto3 }}>
            <Link to="/hr/painel" className="hover:underline" style={{ color: TOM.texto2 }}>RH</Link>
            <ChevronRight size={12} />
            <Link to="/employees" className="hover:underline" style={{ color: TOM.texto2 }}>Colaboradores</Link>
            <ChevronRight size={12} />
            <span>{editando ? f.name || 'Colaborador' : 'Novo Colaborador'}</span>
          </p>
          <h1 className="text-2xl font-semibold mt-1" style={{ color: TOM.texto }}>
            {editando ? f.name || 'Colaborador' : 'Novo Colaborador'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: TOM.texto2 }}>
            {editando ? 'Cadastro completo, documentos e permissões de acesso.' : 'Cadastre um novo colaborador na empresa.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/employees" className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: TOM.texto2, border: `1px solid ${TOM.borda}` }}>Cancelar</Link>
          <button onClick={() => salvar({ irPara: ultima ? undefined : etapa + 1 })} disabled={salvando}
            className="px-4 py-2 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-60"
            style={{ background: TOM.azul, color: '#07101F' }}>
            {salvando ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
              : ultima ? <><Check size={15} /> Concluir Admissão</>
              : <>Salvar e Próximo <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>

      {/* As cinco etapas em linha, ligadas — só a atual acesa. */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {ETAPAS.map((e, i) => {
          const ativa = etapa === e.n;
          const feita = concluidas[e.n - 1];
          return (
            <div key={e.n} className="flex items-center gap-2 shrink-0">
              <button onClick={() => setEtapa(e.n)} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold"
                  style={ativa
                    ? { background: TOM.azul, color: '#07101F' }
                    : feita
                      ? { background: 'rgba(45,212,167,.15)', color: TOM.verde, border: `1px solid rgba(45,212,167,.35)` }
                      : { background: 'transparent', color: TOM.texto3, border: `1px solid ${TOM.borda}` }}>
                  {feita && !ativa ? <Check size={13} /> : e.n}
                </span>
                <span className="text-[13px] whitespace-nowrap"
                  style={{ color: ativa ? TOM.texto : TOM.texto3, fontWeight: ativa ? 600 : 400 }}>
                  {e.titulo}
                </span>
              </button>
              {i < ETAPAS.length - 1 && (
                <span className="w-8 sm:w-16 h-px shrink-0" style={{ background: TOM.borda }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Formulário */}
        <div className="xl:col-span-9 space-y-4">
          {etapa === 1 && (
            <DadosPessoais f={f} set={set} setEndereco={setEndereco} buscandoCep={buscandoCep} buscarCep={buscarCep} />
          )}
          {etapa === 2 && <DadosTrabalhistas f={f} set={set} />}
          {etapa === 3 && <ContratoPoliticas f={f} set={set} />}
          {etapa === 4 && <Documentacao colaboradorId={id} />}
          {etapa === 5 && (
            isAdmin
              ? <Revisao f={f} set={set} acesso={acesso} setAcesso={setAcesso} resumo={resumo} />
              : (
                <div className="card"><div className="card-body">
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">
                    Só administradores mexem em permissão de acesso. O resto do cadastro você pode salvar normalmente.
                  </p>
                </div></div>
              )
          )}
        </div>

        {/* Coluna da direita */}
        <div className="xl:col-span-3 space-y-4">
          {/* Só consulta o que a etapa 4 guardou — nenhum upload aqui. */}
          <StatusDocumentos anexos={anexos} f={f} />

          {/* O resumo NÃO guarda cópia de nada: lê os mesmos campos do
              formulário. Enquanto a etapa 2 não for preenchida, sai
              traço — e traço é a informação honesta de "ainda não". */}
          <Bloco titulo="Resumo da Admissão">
            {resumo.slice(0, 6).map(r => (
              <ItemResumo key={r.label} rotulo={r.label} valor={r.valor || '—'} />
            ))}
            <button type="button" onClick={() => setEtapa(5)}
              className="text-[12px] mt-2 hover:underline" style={{ color: TOM.azul }}>
              Ver detalhes completos
            </button>
          </Bloco>

          <Bloco titulo="Progresso da Admissão">
            <div className="flex flex-col items-center">
              <Medidor valor={progresso} tamanho={104} espessura={9}
                tom={progresso === 100 ? 'verde' : 'azul'} />
              <p className="text-[11.5px] mt-2" style={{ color: TOM.texto3 }}>
                {concluidas.filter(Boolean).length} de {ETAPAS.length} etapas concluídas
              </p>
            </div>
            <div className="mt-3 space-y-1">
              {ETAPAS.map(e => {
                const feita = concluidas[e.n - 1];
                const atual = etapa === e.n;
                return (
                  <button key={e.n} onClick={() => setEtapa(e.n)}
                    className="w-full flex items-center gap-2.5 py-1 text-left">
                    <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                      style={feita
                        ? { background: 'rgba(45,212,167,.15)', color: TOM.verde }
                        : atual
                          ? { background: TOM.azul, color: '#07101F' }
                          : { border: `1px solid ${TOM.borda}`, color: TOM.texto3 }}>
                      {feita ? <Check size={10} /> : e.n}
                    </span>
                    <span className="text-[12.5px] truncate"
                      style={{ color: atual ? TOM.texto : TOM.texto2, fontWeight: atual ? 600 : 400 }}>
                      {e.titulo}
                    </span>
                  </button>
                );
              })}
            </div>
          </Bloco>

          <CapturaFacial
            foto={foto || fotoAtual}
            capturadaEm={f.foto_capturada_em}
            aoCapturar={(dataUrl, quando) => { setFoto(dataUrl); set('foto_capturada_em', quando); }}
            aoRemover={() => { setFoto(null); setFotoAtual(null); set('foto_capturada_em', null); }}
          />
        </div>
      </div>
    </Pagina>
  );
}
