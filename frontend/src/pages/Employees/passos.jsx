// ============================================================
// AS CINCO ETAPAS DO CADASTRO DE COLABORADOR.
//
// A ordem não é decorativa: ela segue a admissão de verdade. Primeiro
// quem é a pessoa (e como o sistema fala com ela), depois o que foi
// combinado de trabalho e dinheiro, depois os papéis que comprovam
// isso, então o contrato e as políticas que ela assina — e só no fim a
// revisão, onde se decide o que ela enxerga do sistema.
//
// Cada etapa é uma função pura de formulário: recebe o rascunho e a
// função que o altera. Quem salva é a tela de fora — assim dá para
// pular entre etapas sem perder nada e sem salvar pela metade.
// ============================================================
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Users, Home, Landmark, Monitor, Briefcase, FileText, Upload, Trash2,
  Download, Loader2, Plus, ShieldCheck, ScrollText, Baby, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import PermissoesTelas from './PermissoesTelas';
import {
  Campo, Secao, Chave, CampoSenha, UFS, DEPARTAMENTOS, TIPOS_CONTRATO,
  ESTADOS_CIVIS, GENEROS, METODOS_PONTO, mCPF, mTelefone, mCEP, mPIS,
  mDinheiro, fmtMoeda, cpfValido, soDigitos,
} from './campos';

// ── 1. Dados pessoais ───────────────────────────────────────
export function DadosPessoais({ f, set, setEndereco, buscandoCep, buscarCep }) {
  const casado = /casad|uni/i.test(f.estado_civil || '');
  const filhos = Array.isArray(f.filhos) ? f.filhos : [];

  const editarFilho = (i, campo, valor) =>
    set('filhos', filhos.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  return (
    <div className="space-y-4">
      <Secao icone={User} titulo="Identificação" descricao="O que a lei e a folha de pagamento exigem para existir um vínculo.">
        <Campo label="Nome completo" obrigatorio col={2}>
          <input className="input" value={f.name || ''} onChange={e => set('name', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Nome social" dica="Como a pessoa quer ser chamada, se for diferente.">
          <input className="input" value={f.nome_social || ''} onChange={e => set('nome_social', e.target.value)} />
        </Campo>
        <Campo label="CPF" obrigatorio erro={f.cpf_cnpj && !cpfValido(f.cpf_cnpj) ? 'CPF inválido' : null}>
          <input className="input" value={f.cpf_cnpj || ''} onChange={e => set('cpf_cnpj', mCPF(e.target.value))} placeholder="000.000.000-00" />
        </Campo>
        <Campo label="Data de nascimento" obrigatorio>
          <input type="date" className="input" value={f.birth_date || ''} onChange={e => set('birth_date', e.target.value)} />
        </Campo>
        <Campo label="RG / Órgão emissor">
          <input className="input" value={f.rg_ie || ''} onChange={e => set('rg_ie', e.target.value.toUpperCase())} placeholder="00.000.000-0 — SSP/PR" />
        </Campo>
        <Campo label="Data de emissão">
          <input type="date" className="input" value={f.rg_emissao || ''} onChange={e => set('rg_emissao', e.target.value)} />
        </Campo>
        <Campo label="Nacionalidade">
          <input className="input" value={f.nacionalidade || ''} onChange={e => set('nacionalidade', e.target.value)} placeholder="Brasileira" />
        </Campo>
        <Campo label="Estado civil">
          <select className="input" value={f.estado_civil || ''} onChange={e => set('estado_civil', e.target.value)}>
            <option value="">—</option>{ESTADOS_CIVIS.map(x => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo label="Gênero">
          <select className="input" value={f.genero || ''} onChange={e => set('genero', e.target.value)}>
            <option value="">—</option>{GENEROS.map(x => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo label="Nome da mãe" col={2}>
          <input className="input" value={f.mother_name || ''} onChange={e => set('mother_name', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Nome do pai" col={2}>
          <input className="input" value={f.father_name || ''} onChange={e => set('father_name', e.target.value.toUpperCase())} />
        </Campo>
      </Secao>

      {/* O cônjuge só é perguntado a quem tem cônjuge. */}
      {casado && (
        <Secao icone={Users} titulo="Dados do cônjuge" descricao="Entram no imposto de renda e nos benefícios com dependente.">
          <Campo label="Nome do cônjuge" col={2}>
            <input className="input" value={f.conjuge_nome || ''} onChange={e => set('conjuge_nome', e.target.value.toUpperCase())} />
          </Campo>
          <Campo label="CPF do cônjuge">
            <input className="input" value={f.conjuge_cpf || ''} onChange={e => set('conjuge_cpf', mCPF(e.target.value))} />
          </Campo>
          <Campo label="Data de nascimento">
            <input type="date" className="input" value={f.conjuge_nascimento || ''} onChange={e => set('conjuge_nascimento', e.target.value)} />
          </Campo>
          <Campo label="Telefone">
            <input className="input" value={f.conjuge_telefone || ''} onChange={e => set('conjuge_telefone', mTelefone(e.target.value))} />
          </Campo>
        </Secao>
      )}

      <Secao icone={Baby} titulo="Filhos" descricao="Salário-família, vale-creche e dependentes do IR saem daqui."
        colunas={4}
        acao={
          <button type="button" className="btn-secondary btn-sm"
            onClick={() => set('filhos', [...filhos, { nome: '', nascimento: '', genero: '', cpf: '' }])}>
            <Plus size={13} /> Adicionar filho
          </button>
        }>
        {filhos.length === 0 && (
          <p className="sm:col-span-4 text-sm text-gray-400">Nenhum filho cadastrado.</p>
        )}
        {filhos.map((filho, i) => (
          <div key={i} className="sm:col-span-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-gray-100 pb-3 last:border-0">
            <div className="sm:col-span-4">
              <label className="label">Nome completo</label>
              <input className="input" value={filho.nome || ''} onChange={e => editarFilho(i, 'nome', e.target.value.toUpperCase())} />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Data de nascimento</label>
              <input type="date" className="input" value={filho.nascimento || ''} onChange={e => editarFilho(i, 'nascimento', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Gênero</label>
              <select className="input" value={filho.genero || ''} onChange={e => editarFilho(i, 'genero', e.target.value)}>
                <option value="">—</option>{GENEROS.map(x => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">CPF (se tiver)</label>
              <input className="input" value={filho.cpf || ''} onChange={e => editarFilho(i, 'cpf', mCPF(e.target.value))} />
            </div>
            <button type="button" onClick={() => set('filhos', filhos.filter((_, j) => j !== i))}
              className="sm:col-span-1 btn-ghost text-gray-400 hover:text-red-500" title="Remover">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </Secao>

      <Secao icone={Home} titulo="Contato e endereço" descricao="Para onde vai o holerite, e por onde a empresa fala com a pessoa.">
        <Campo label="CEP" dica={buscandoCep ? 'buscando…' : 'Preenche o resto sozinho.'}>
          <input className="input" value={f.address?.zip || ''}
            onChange={e => { const v = mCEP(e.target.value); setEndereco('zip', v); if (soDigitos(v).length === 8) buscarCep(v); }} />
        </Campo>
        <Campo label="Rua / Logradouro" col={2}>
          <input className="input" value={f.address?.street || ''} onChange={e => setEndereco('street', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Número">
          <input className="input" value={f.address?.number || ''} onChange={e => setEndereco('number', e.target.value)} />
        </Campo>
        <Campo label="Complemento">
          <input className="input" value={f.address?.complement || ''} onChange={e => setEndereco('complement', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Bairro">
          <input className="input" value={f.address?.neighborhood || ''} onChange={e => setEndereco('neighborhood', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Cidade">
          <input className="input" value={f.address?.city || ''} onChange={e => setEndereco('city', e.target.value.toUpperCase())} />
        </Campo>
        <Campo label="Estado / UF">
          <select className="input" value={f.address?.state || ''} onChange={e => setEndereco('state', e.target.value)}>
            <option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo label="E-mail pessoal" col={2}>
          <input type="email" className="input" value={f.email || ''} onChange={e => set('email', e.target.value)} />
        </Campo>
        <Campo label="Telefone / WhatsApp">
          <input className="input" value={f.phone || ''} onChange={e => set('phone', mTelefone(e.target.value))} />
        </Campo>
        <Campo label="Telefone para recado">
          <input className="input" value={f.mobile || ''} onChange={e => set('mobile', mTelefone(e.target.value))} />
        </Campo>
      </Secao>

      <Secao icone={Landmark} titulo="Dados bancários" descricao="Conta onde o salário cai. O titular tem que ser a própria pessoa.">
        <Campo label="Banco">
          <input className="input" value={f.banco || ''} onChange={e => set('banco', e.target.value.toUpperCase())} placeholder="Banco do Brasil" />
        </Campo>
        <Campo label="Agência">
          <input className="input" value={f.agencia || ''} onChange={e => set('agencia', e.target.value)} />
        </Campo>
        <Campo label="Conta">
          <input className="input" value={f.conta || ''} onChange={e => set('conta', e.target.value)} />
        </Campo>
        <Campo label="Tipo de conta">
          <select className="input" value={f.tipo_conta || ''} onChange={e => set('tipo_conta', e.target.value)}>
            <option value="">—</option>
            <option>Conta Corrente</option><option>Conta Poupança</option><option>Conta Salário</option>
          </select>
        </Campo>
        <Campo label="Chave PIX" col={2}>
          <input className="input" value={f.pix || ''} onChange={e => set('pix', e.target.value)} placeholder="CPF, telefone, e-mail ou aleatória" />
        </Campo>
        <Campo label="Titular da conta" col={2}>
          <input className="input" value={f.titular_conta || ''} onChange={e => set('titular_conta', e.target.value.toUpperCase())} />
        </Campo>
      </Secao>

      <Secao icone={Monitor} titulo="Informações do sistema" descricao="O login desta pessoa. O que ela enxerga se decide na etapa 5.">
        <div className="sm:col-span-4">
          <Chave ligado={f.has_access} aoMudar={v => set('has_access', v)}
            titulo="Este colaborador acessa o sistema"
            descricao="Cria o login e libera a escolha de telas e módulos na etapa de revisão." />
        </div>
        {f.has_access && (
          <>
            <Campo label="E-mail de acesso (login)" obrigatorio col={2}
              dica="É por este e-mail que a pessoa entra no sistema.">
              <input type="email" className="input" value={f.access_email || ''} onChange={e => set('access_email', e.target.value)} />
            </Campo>
            <Campo label="Senha inicial" col={2}
              dica="Em branco, mantém a senha atual de quem já tem acesso.">
              <CampoSenha valor={f.access_password} aoMudar={v => set('access_password', v)} placeholder="mínimo 8 caracteres" />
            </Campo>
            <Campo label="E-mail corporativo" col={2}>
              <input type="email" className="input" value={f.email_corporativo || ''} onChange={e => set('email_corporativo', e.target.value)} />
            </Campo>
            <Campo label="WhatsApp para notificações" col={2}>
              <input className="input" value={f.whatsapp_notificacoes || ''} onChange={e => set('whatsapp_notificacoes', mTelefone(e.target.value))} />
            </Campo>
            <Campo label="Método de ponto" col={2}>
              <select className="input" value={f.ponto_metodo || ''} onChange={e => set('ponto_metodo', e.target.value)}>
                <option value="">—</option>
                {METODOS_PONTO.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Campo>
            <div className="sm:col-span-2 flex items-end">
              <p className="text-xs text-gray-500 pb-2">
                O <b>perfil de acesso</b> e as <b>telas liberadas</b> ficam na etapa
                <b> Revisão e Conclusão</b> — lá dá para marcar tela por tela.
              </p>
            </div>
          </>
        )}
      </Secao>
    </div>
  );
}

// ── 2. Dados trabalhistas ───────────────────────────────────
export function DadosTrabalhistas({ f, set }) {
  const { data: escalas = [] } = useQuery({ queryKey: ['escalas'], queryFn: () => api.get('/escalas') });
  const ehVendas = ['COMERCIAL', 'VENDAS'].includes(f.sector || '');

  return (
    <div className="space-y-4">
      <Secao icone={Briefcase} titulo="Vínculo" descricao="O combinado: onde trabalha, fazendo o quê, desde quando e como.">
        <Campo label="Departamento" obrigatorio>
          <select className="input" value={f.sector || ''} onChange={e => set('sector', e.target.value)}>
            <option value="">—</option>{DEPARTAMENTOS.map(s => <option key={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo label="Cargo">
          <input className="input" value={f.role || ''} onChange={e => set('role', e.target.value.toUpperCase())} placeholder="VENDEDOR INTERNO" />
        </Campo>
        <Campo label="Tipo de contrato">
          <select className="input" value={f.contract_type || ''} onChange={e => set('contract_type', e.target.value)}>
            <option value="">—</option>{TIPOS_CONTRATO.map(t => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Data de admissão" obrigatorio>
          <input type="date" className="input" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} />
        </Campo>
        <Campo label="Escala de trabalho" obrigatorio col={2}
          dica="Define a jornada esperada e alimenta o controle de ponto.">
          <select className="input" value={f.scale_id || ''} onChange={e => set('scale_id', e.target.value)}>
            <option value="">—</option>
            {escalas.map(es => <option key={es.id} value={es.id}>{es.name}</option>)}
          </select>
        </Campo>
        <Campo label="Jornada mensal (horas)">
          <input type="number" className="input" value={f.monthly_hours || ''} onChange={e => set('monthly_hours', e.target.value)} placeholder="220" />
        </Campo>
        <Campo label="Experiência (dias)" dica="Ex.: 30+60.">
          <input className="input" value={f.experiencia || ''} onChange={e => set('experiencia', e.target.value)} placeholder="30+60" />
        </Campo>
      </Secao>

      <Secao icone={Landmark} titulo="Remuneração" descricao="Salário e benefícios daqui alimentam a folha e o rateio de custos.">
        <Campo label="Salário (R$)" obrigatorio>
          <input className="input" value={f.salary || ''} onChange={e => set('salary', mDinheiro(e.target.value))} placeholder="2.500,00" />
        </Campo>
        <Campo label="Vale-transporte (R$)">
          <input className="input" value={f.benefit_vt || ''} onChange={e => set('benefit_vt', mDinheiro(e.target.value))} />
        </Campo>
        <Campo label="Vale-refeição (R$)">
          <input className="input" value={f.benefit_vr || ''} onChange={e => set('benefit_vr', mDinheiro(e.target.value))} />
        </Campo>
        <Campo label="Plano de saúde (R$)">
          <input className="input" value={f.benefit_health || ''} onChange={e => set('benefit_health', mDinheiro(e.target.value))} />
        </Campo>
        <Campo label="Outros benefícios (R$)">
          <input className="input" value={f.benefit_other || ''} onChange={e => set('benefit_other', mDinheiro(e.target.value))} />
        </Campo>
        {ehVendas && (
          <>
            <Campo label="Comissão (%)" dica="Sobre o que for entregue, não sobre o que for vendido.">
              <input className="input" value={f.commission_pct || ''} onChange={e => set('commission_pct', e.target.value)} placeholder="2,5" />
            </Campo>
            <Campo label="Meta mensal (R$)">
              <input className="input" value={f.sales_goal || ''} onChange={e => set('sales_goal', mDinheiro(e.target.value))} />
            </Campo>
          </>
        )}
      </Secao>

      <Secao icone={FileText} titulo="Documentos trabalhistas" descricao="Números que o eSocial e a folha pedem." colunas={4}>
        <Campo label="PIS / PASEP">
          <input className="input" value={f.pis || ''} onChange={e => set('pis', mPIS(e.target.value))} />
        </Campo>
        <Campo label="CTPS — número">
          <input className="input" value={f.ctps_numero || ''} onChange={e => set('ctps_numero', e.target.value)} />
        </Campo>
        <Campo label="CTPS — série">
          <input className="input" value={f.ctps_serie || ''} onChange={e => set('ctps_serie', e.target.value)} />
        </Campo>
        <Campo label="CTPS — UF">
          <select className="input" value={f.ctps_uf || ''} onChange={e => set('ctps_uf', e.target.value)}>
            <option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo label="Título de eleitor">
          <input className="input" value={f.titulo_eleitor || ''} onChange={e => set('titulo_eleitor', e.target.value)} />
        </Campo>
        <Campo label="Reservista">
          <input className="input" value={f.reservista || ''} onChange={e => set('reservista', e.target.value)} />
        </Campo>
        <Campo label="CNH">
          <input className="input" value={f.cnh || ''} onChange={e => set('cnh', e.target.value)} />
        </Campo>
        <Campo label="Categoria da CNH">
          <input className="input" value={f.cnh_categoria || ''} onChange={e => set('cnh_categoria', e.target.value.toUpperCase())} placeholder="AB" />
        </Campo>
      </Secao>
    </div>
  );
}

// ── 3. Documentação ─────────────────────────────────────────
const PASTAS = [
  { key: 'pessoais', label: 'Documentos pessoais', desc: 'RG, CPF, CNH, comprovante de escolaridade.' },
  { key: 'conjuge', label: 'Documentos do cônjuge', desc: 'Certidão de casamento, RG e CPF.' },
  { key: 'filhos', label: 'Documentos dos filhos', desc: 'Certidão de nascimento, RG, dados escolares.' },
  { key: 'residencia', label: 'Comprovante de residência', desc: 'Conta de luz, água ou telefone.' },
  { key: 'bancario', label: 'Comprovante bancário', desc: 'Extrato, cartão ou contrato da conta.' },
  { key: 'trabalhista', label: 'Documentos trabalhistas', desc: 'CTPS, PIS, exame admissional, contrato.' },
];

export function Documentacao({ colaboradorId }) {
  const qc = useQueryClient();
  const entrada = useRef();
  const [pasta, setPasta] = useState('pessoais');
  const [enviando, setEnviando] = useState(false);

  const { data: anexos = [], isLoading } = useQuery({
    queryKey: ['attachments', colaboradorId],
    queryFn: () => api.get(`/customers/${colaboradorId}/attachments`),
    enabled: !!colaboradorId,
  });

  if (!colaboradorId) {
    return (
      <div className="card"><div className="card-body">
        <p className="text-sm text-gray-500">
          Os documentos são anexados depois que o colaborador existir. Salve as duas primeiras
          etapas e volte aqui — o botão <b>Salvar</b> no topo já cria o cadastro.
        </p>
      </div></div>
    );
  }

  async function enviar(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('file', arquivo);
      // A pasta viaja no nome para o anexo não virar um monte sem dono.
      fd.append('folder', pasta);
      await api.post(`/customers/${colaboradorId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Documento anexado');
      qc.invalidateQueries(['attachments', colaboradorId]);
    } catch (err) { toast.error(err.error || 'Erro ao enviar'); }
    finally { setEnviando(false); e.target.value = ''; }
  }

  async function remover(id) {
    if (!window.confirm('Remover este documento?')) return;
    try {
      await api.delete(`/customers/${colaboradorId}/attachments/${id}`);
      qc.invalidateQueries(['attachments', colaboradorId]);
    } catch { toast.error('Erro ao remover'); }
  }

  return (
    <div className="space-y-4">
      <Secao icone={Upload} titulo="Anexar documento" descricao="Escolha a pasta e envie. PDF, imagem ou documento do Office." colunas={4}>
        <Campo label="Pasta" col={2}>
          <select className="input" value={pasta} onChange={e => setPasta(e.target.value)}>
            {PASTAS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">{PASTAS.find(p => p.key === pasta)?.desc}</p>
        </Campo>
        <div className="sm:col-span-2 flex items-end">
          <input ref={entrada} type="file" className="hidden" onChange={enviar}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt" />
          <button type="button" onClick={() => entrada.current?.click()} disabled={enviando} className="btn-primary">
            {enviando ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : <><Upload size={15} /> Escolher arquivo</>}
          </button>
        </div>
      </Secao>

      <section className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-[15px]">Documentos anexados ({anexos.length})</h2>
        </div>
        <div className="card-body space-y-2">
          {isLoading && <p className="text-sm text-gray-400">Carregando…</p>}
          {!isLoading && !anexos.length && (
            <p className="text-sm text-gray-400 text-center py-6">
              Nenhum documento ainda. Anexe contrato, CTPS, exame admissional e comprovantes.
            </p>
          )}
          {anexos.map(a => (
            <div key={a.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2">
              <FileText size={16} className="text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                <p className="text-[11px] text-gray-400">
                  {a.folder ? `${PASTAS.find(p => p.key === a.folder)?.label || a.folder} · ` : ''}
                  {a.size ? `${(a.size / 1024).toFixed(0)} KB` : ''}
                </p>
              </div>
              <a href={a.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-primary-600" title="Abrir">
                <Download size={14} />
              </a>
              <button type="button" onClick={() => remover(a.id)} className="btn-ghost btn-sm text-gray-400 hover:text-red-500" title="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── 4. Contrato e políticas ─────────────────────────────────
const POLITICAS = [
  { key: 'termo_sistema', label: 'Termo de uso do sistema', desc: 'Login pessoal e intransferível, registro de auditoria.' },
  { key: 'lgpd', label: 'Política de privacidade (LGPD)', desc: 'Tratamento dos dados pessoais do colaborador.' },
  { key: 'imagem', label: 'Autorização de uso de imagem', desc: 'Fotos em redes sociais e materiais da Lyon.' },
  { key: 'epi', label: 'Recebimento de EPI', desc: 'Equipamentos de proteção entregues e treinamento.' },
  { key: 'conduta', label: 'Código de conduta', desc: 'Regras de convivência e comportamento.' },
  { key: 'sigilo', label: 'Termo de sigilo', desc: 'Preço de custo, carteira de clientes e processos.' },
];

export function ContratoPoliticas({ f, set }) {
  const aceitas = f.politicas || {};
  const marcar = (k, v) => set('politicas', { ...aceitas, [k]: v ? new Date().toISOString().slice(0, 10) : null });

  return (
    <div className="space-y-4">
      <Secao icone={ScrollText} titulo="Contrato" descricao="O que foi assinado, e quando." colunas={4}>
        <Campo label="Modelo de contrato">
          <select className="input" value={f.contract_type || ''} onChange={e => set('contract_type', e.target.value)}>
            <option value="">—</option>{TIPOS_CONTRATO.map(t => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Assinado em">
          <input type="date" className="input" value={f.contrato_assinado_em || ''} onChange={e => set('contrato_assinado_em', e.target.value)} />
        </Campo>
        <Campo label="Fim da experiência">
          <input type="date" className="input" value={f.experiencia_fim || ''} onChange={e => set('experiencia_fim', e.target.value)} />
        </Campo>
        <Campo label="Exame admissional em">
          <input type="date" className="input" value={f.exame_admissional || ''} onChange={e => set('exame_admissional', e.target.value)} />
        </Campo>
        <Campo label="Observações" col={4}>
          <textarea className="input min-h-[80px]" value={f.observacoes || ''} onChange={e => set('observacoes', e.target.value)}
            placeholder="Combinados que não cabem nos campos acima." />
        </Campo>
      </Secao>

      <Secao icone={ShieldCheck} titulo="Políticas internas"
        descricao="Marcar registra a data de aceite. O documento assinado vai na etapa de Documentação." colunas={2}>
        {POLITICAS.map(p => (
          <div key={p.key} className="sm:col-span-1">
            <Chave ligado={!!aceitas[p.key]} aoMudar={v => marcar(p.key, v)}
              titulo={p.label}
              descricao={aceitas[p.key] ? `Aceito em ${aceitas[p.key].split('-').reverse().join('/')}` : p.desc} />
          </div>
        ))}
      </Secao>
    </div>
  );
}

// ── 5. Revisão e conclusão ──────────────────────────────────
export function Revisao({ f, acesso, setAcesso, resumo }) {
  return (
    <div className="space-y-4">
      <Secao icone={Check} titulo="Confira antes de concluir" descricao="O que vai ser gravado no cadastro." colunas={4}>
        {resumo.map(r => (
          <div key={r.label}>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">{r.label}</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{r.valor || '—'}</p>
          </div>
        ))}
      </Secao>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 text-[15px]">Acesso e permissões</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            O que esta pessoa enxerga do sistema — tela por tela.
          </p>
        </div>
        <div className="card-body">
          <PermissoesTelas valor={acesso} aoMudar={setAcesso} semAcesso={!f.has_access} />
        </div>
      </section>
    </div>
  );
}

export { fmtMoeda };
