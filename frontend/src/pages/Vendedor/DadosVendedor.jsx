// ============================================================
// Dados do vendedor.
//
// Aberta pelo bloco do usuário no rodapé da lateral. É leitura: quem
// define território, plano de metas e acessos é o Administrativo — o
// vendedor precisa saber o que vale para ele, não mudar.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { UserCog, MapPin, Target, ShieldCheck, LogOut } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useVend, fmtBRL, fmtUn, fmtPct } from './ui';

const UF_NOME = {
  AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão',
  MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará',
  PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro',
  RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima',
  SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins',
};

export default function DadosVendedor() {
  const v = useVend();
  const { user, logout, sectorName } = useAuth();

  const { data: config } = useQuery({
    queryKey: ['vendedor-config-proprio', user?.id],
    queryFn: () => api.get(`/vendedor/config/${user.id}`),
    enabled: !!user?.id,
  });

  const { data: painel } = useQuery({
    queryKey: ['vendedor-dashboard-resumo'],
    queryFn: () => api.get('/vendedor/dashboard'),
  });

  const plano = painel?.plan;
  const territorio = config?.territory || [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Dados do vendedor</h1>
        <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
          O que está cadastrado para você. Alterações são feitas pelo Administrativo.
        </p>
      </div>

      {/* Identificação */}
      <div style={{ ...v.card, padding: '1.25rem' }} className="flex items-center gap-4">
        <span className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
          style={{ background: '#2563eb', color: 'white' }}>
          {(user?.name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold truncate" style={{ color: v.textPrimary }}>{user?.name}</p>
          <p className="text-sm truncate" style={{ color: v.textMuted }}>{user?.email}</p>
          <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#60a5fa' }}>
            <UserCog size={12} /> {sectorName || 'Vendas'}
          </p>
        </div>
      </div>

      {/* Território */}
      <div style={{ ...v.card, padding: '1.25rem' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2"
          style={{ color: v.textSubtle }}>
          <MapPin size={13} /> Território atendido
        </p>
        {territorio.length === 0 ? (
          <p className="text-sm" style={{ color: v.empty }}>
            Nenhuma UF definida ainda. Fale com o Administrativo.
          </p>
        ) : (
          <>
            {config?.region_label && (
              <p className="text-sm mb-2" style={{ color: v.textPrimary }}>Região: <b>{config.region_label}</b></p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {territorio.map(uf => (
                <span key={uf} className="text-[12px] px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>
                  {uf} — {UF_NOME[uf] || uf}
                </span>
              ))}
            </div>
          </>
        )}
        <p className="text-[11px] mt-2" style={{ color: v.textSubtle }}>
          Carteira configurada para Top {config?.top_clients || 10} clientes.
        </p>
      </div>

      {/* Plano de metas */}
      <div style={{ ...v.card, padding: '1.25rem' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2"
          style={{ color: v.textSubtle }}>
          <Target size={13} /> Plano de metas vigente
        </p>
        {!plano ? (
          <p className="text-sm" style={{ color: v.empty }}>Nenhuma faixa cobre o mês atual.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Dado v={v} rotulo="Faixa"          valor={plano.name} />
            <Dado v={v} rotulo="Meta do mês"    valor={`${fmtUn(plano.monthly_goal)} un`} />
            <Dado v={v} rotulo="Comissão"       valor={fmtPct(plano.commission_pct)} />
            <Dado v={v} rotulo="Bônus do ciclo" valor={fmtBRL(plano.cycle_bonus)} />
          </div>
        )}
      </div>

      {/* Acessos */}
      <div style={{ ...v.card, padding: '1.25rem' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2"
          style={{ color: v.textSubtle }}>
          <ShieldCheck size={13} /> O que você acessa
        </p>
        <p className="text-sm" style={{ color: v.textMuted }}>
          Dashboard, Pedidos de Venda da sua carteira, Site/Catálogo, Agenda e Comunicação com o gerente.
          Módulos administrativos, financeiros, de estoque, produção e logística não fazem parte do seu
          acesso — quando houver problema em algum deles, use o botão <b>Comunicar Gerente</b> na coluna
          Atenção do pedido.
        </p>
      </div>

      <button onClick={logout} className="btn-secondary">
        <LogOut size={15} /> Sair do sistema
      </button>
    </div>
  );
}

function Dado({ v, rotulo, valor }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: v.textSubtle }}>{rotulo}</p>
      <p className="font-semibold" style={{ color: v.textPrimary }}>{valor}</p>
    </div>
  );
}
