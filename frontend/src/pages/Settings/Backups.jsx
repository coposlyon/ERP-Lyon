// ============================================================
// CONFIGURAÇÕES › BACKUP E RECUPERAÇÃO
//
// A segunda cópia dos dados, feita pelo próprio ERP (lib/backup.js):
// todo dia sozinha, ou agora pelo botão. Cada backup pode ser baixado e
// verificado (SHA-256 + leitura do arquivo). Restaurar é pelo script
// backend/scripts/restaurar-backup.js — as instruções estão na tela.
// ============================================================
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DatabaseBackup, Loader2, Download, ShieldCheck, ShieldAlert, Clock, HardDrive, RefreshCw, ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const fmtBytes = b => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const fmtData = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const STATUS = {
  ok: ['Concluído', 'badge-green'], erro: ['Falhou', 'badge-red'], gerando: ['Gerando…', 'badge-yellow'], expirado: ['Expirado', 'badge-gray'],
};

export default function Backups() {
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [verificando, setVerificando] = useState(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['backups'], queryFn: () => api.get('/backups'), refetchInterval: gerando ? 3000 : false });
  const itens = data?.itens || [];

  async function gerar() {
    setGerando(true);
    try {
      const r = await api.post('/backups');
      toast.success(`Backup concluído: ${r.linhas.toLocaleString('pt-BR')} registros em ${r.tabelas} tabelas`);
    } catch (err) { toast.error(err.error || 'O backup falhou'); }
    finally { setGerando(false); qc.invalidateQueries({ queryKey: ['backups'] }); }
  }

  async function baixar(b) {
    try {
      const r = await api.get(`/backups/${b.id}/download`);
      window.location.href = r.url;
    } catch (err) { toast.error(err.error || 'Não foi possível baixar'); }
  }

  async function verificar(b) {
    setVerificando(b.id);
    try {
      const r = await api.post(`/backups/${b.id}/verificar`);
      if (r.ok) toast.success(`Íntegro: SHA-256 confere, ${r.linhas.toLocaleString('pt-BR')} registros legíveis`);
      else toast.error(r.motivo, { duration: 8000 });
      qc.invalidateQueries({ queryKey: ['backups'] });
    } catch (err) { toast.error(err.error || 'Erro ao verificar'); } finally { setVerificando(null); }
  }

  const ultimo = data?.ultimo_ok;
  const atrasado = data?.horas_desde_ultimo == null || data.horas_desde_ultimo > 26;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><DatabaseBackup size={22} /> Backup e Recuperação</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
            Cópia completa dos dados da empresa, guardada fora do banco de dados, feita automaticamente todo dia.
            Complementa o backup diário do próprio Supabase.
          </p>
        </div>
        <button className="btn-primary" onClick={gerar} disabled={gerando || data?.sem_conexao}>
          {gerando ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} Gerar backup agora
        </button>
      </div>

      {data?.sem_conexao && (
        <div className="card p-3 text-[13px] text-red-600 flex items-center gap-2"><ShieldAlert size={16} /> DATABASE_URL não está configurada no servidor — o backup não consegue ler o banco.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card icone={atrasado ? ShieldAlert : ShieldCheck} cor={atrasado ? 'bg-red-600' : 'bg-green-600'} titulo="Último backup"
          valor={ultimo ? fmtData(ultimo.criado_em) : 'Nenhum ainda'} sub={ultimo ? `há ${data.horas_desde_ultimo} h` : 'gere o primeiro agora'} />
        <Card icone={Clock} cor="bg-blue-600" titulo="Backup automático" valor={data?.automatico ? 'Ligado' : 'Desligado'} sub="verifica de hora em hora; gera a cada 24 h" />
        <Card icone={HardDrive} cor="bg-indigo-600" titulo="Tamanho do último" valor={fmtBytes(ultimo?.bytes)} sub={ultimo ? `${(ultimo.linhas || 0).toLocaleString('pt-BR')} registros · ${ultimo.tabelas} tabelas` : '—'} />
        <Card icone={RefreshCw} cor="bg-emerald-600" titulo="Retenção" valor={`${data?.retencao?.diarios || 30} diários`} sub={`+ 1 por mês por ${data?.retencao?.mensais || 12} meses`} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Backups</h2>
          <button className="btn-ghost btn-sm" onClick={() => qc.invalidateQueries({ queryKey: ['backups'] })}><RefreshCw size={13} /> Atualizar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                {['', 'Data', 'Origem', 'Status', 'Tabelas', 'Registros', 'Tamanho', 'SHA-256', 'Por', 'Ações'].map((h, i) =>
                  <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="py-8 text-center"><Loader2 className="animate-spin inline" size={18} /></td></tr>}
              {error && <tr><td colSpan={10} className="py-8 text-center text-red-500">{error.error || 'Erro ao carregar'}</td></tr>}
              {!isLoading && !error && itens.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">Nenhum backup ainda. Clique em “Gerar backup agora”.</td></tr>}
              {itens.map(b => {
                const [rot, cls] = STATUS[b.status] || [b.status, 'badge-gray'];
                const tabelas = Object.entries(b.detalhes || {}).filter(([k]) => !k.startsWith('_')).sort((x, y) => y[1] - x[1]);
                const verif = b.detalhes?._verificado_em;
                return (
                  <FragmentoLinha key={b.id} aberto={aberto === b.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-2">
                        {b.status === 'ok' && <button className="btn-ghost p-1" onClick={() => setAberto(aberto === b.id ? null : b.id)}>
                          {aberto === b.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtData(b.criado_em)}</td>
                      <td className="px-3 py-2">{b.origem === 'automatico' ? 'Automático' : 'Manual'}</td>
                      <td className="px-3 py-2"><span className={cls}>{rot}</span>{b.erro && <p className="text-[11px] text-red-500 max-w-xs truncate" title={b.erro}>{b.erro}</p>}</td>
                      <td className="px-3 py-2 text-right">{b.tabelas ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{b.linhas != null ? Number(b.linhas).toLocaleString('pt-BR') : '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBytes(b.bytes)}</td>
                      <td className="px-3 py-2 font-mono text-[11px]" title={b.sha256 || ''}>{b.sha256 ? `${b.sha256.slice(0, 12)}…` : '—'}
                        {verif && <span className={`block text-[10.5px] font-sans ${b.detalhes._verificacao_ok ? 'text-green-600' : 'text-red-500'}`}>
                          {b.detalhes._verificacao_ok ? 'verificado' : 'falhou'} {fmtData(verif)}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{b.usuario || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {b.status === 'ok' && (
                          <>
                            <button className="btn-secondary btn-sm mr-1" onClick={() => baixar(b)}><Download size={13} /> Baixar</button>
                            <button className="btn-secondary btn-sm" onClick={() => verificar(b)} disabled={verificando === b.id}>
                              {verificando === b.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verificar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {aberto === b.id && (
                      <tr className="bg-gray-50"><td colSpan={10} className="px-6 py-3">
                        <p className="text-[12px] text-gray-500 mb-2">Registros por tabela neste backup:</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-0.5 text-[12px]">
                          {tabelas.map(([t, n]) => <span key={t} className="flex justify-between gap-2"><span className="truncate text-gray-600">{t}</span><b>{n}</b></span>)}
                        </div>
                      </td></tr>
                    )}
                  </FragmentoLinha>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 text-[13px] text-gray-700 space-y-2">
        <p className="font-semibold text-gray-900 flex items-center gap-2"><Info size={15} /> Como restaurar (recuperação de desastre)</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Baixe o backup desejado nesta tela (arquivo <code>.json.gz</code>). Guarde uma cópia mensal fora da nuvem (HD externo ou outra conta).</li>
          <li>Se o banco foi perdido, crie um projeto novo no Supabase e coloque a conexão dele no <code>DATABASE_URL</code> do <code>backend/.env</code>.</li>
          <li>Crie as tabelas: <code>node backend/scripts/migrate.js</code></li>
          <li>Confira o arquivo: <code>node backend/scripts/restaurar-backup.js arquivo.json.gz --conferir</code> (o SHA-256 mostrado deve ser igual ao desta tela).</li>
          <li>Simule sem gravar: <code>… --simular</code>. Se estiver tudo certo, restaure: <code>… --restaurar</code>.</li>
          <li>Registros que já existem no destino são mantidos; restaurar duas vezes não duplica.</li>
        </ol>
        <p className="text-[12px] text-gray-500">Os arquivos ficam no bucket privado <b>{data?.bucket || 'BACKUPS'}</b> do Supabase Storage, separado do banco. O link de download vale 10 minutos e cada download fica na Auditoria.</p>
      </div>
    </div>
  );
}

function FragmentoLinha({ children }) { return <>{children}</>; }

function Card({ icone: I, cor, titulo, valor, sub }) {
  return (
    <div className="card p-3 flex items-center gap-3 min-w-0">
      <div className={`w-11 h-11 rounded-lg ${cor} flex items-center justify-center shrink-0`}><I size={22} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-[12.5px] text-gray-600">{titulo}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight truncate">{valor}</p>
        <p className="text-[11.5px] text-gray-500 truncate">{sub}</p>
      </div>
    </div>
  );
}
