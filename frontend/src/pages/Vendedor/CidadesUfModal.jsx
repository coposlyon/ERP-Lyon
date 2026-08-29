// ============================================================
// As cidades de um estado do território.
//
// Abre pelo olho ao lado do nome do estado, na lista de "Estados que
// mais compram" e no "Território atendido" — e também clicando no
// estado dentro do mapa.
//
// Existe porque "você atende o Paraná" não é uma instrução: são 399
// cidades, e a diferença entre Curitiba e Doutor Ulysses é a diferença
// entre uma rota de um dia e uma de uma semana. O que está aqui é o que
// se usa para montar rota e para ligar: tamanho da cidade, DDD, se é
// capital, se está em região metropolitana e quais distritos ela tem.
//
// Os dados são públicos (IBGE e BrasilAPI) e ficam guardados no banco —
// a tela não depende do IBGE estar no ar às nove da manhã de segunda.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, X, Search, Star, Building2, Phone, Users, Info } from 'lucide-react';
import api from '@/lib/api';
import { useVend, fmtUn, corUf } from './ui';

const UF_NOME = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function CidadesUfModal({ uf, onClose }) {
  const v = useVend();
  const [busca, setBusca] = useState('');
  const [soGrandes, setSoGrandes] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendedor-cidades', uf],
    queryFn: () => api.get(`/vendedor/territorio/${uf}/cidades`),
    enabled: !!uf,
    // Geografia não muda entre uma aberta e outra. Buscar de novo a cada
    // clique só faria o vendedor esperar duas vezes pela mesma lista.
    staleTime: 1000 * 60 * 60 * 24,
  });

  const cor = corUf(uf);
  const cidades = data?.cidades || [];

  const visiveis = useMemo(() => {
    const termo = semAcento(busca).trim();
    return cidades.filter(c => {
      if (soGrandes && (c.population || 0) < 50000) return false;
      if (!termo) return true;
      return semAcento(c.name).includes(termo)
        || (c.ddd || '').includes(termo)
        || semAcento(c.metro || '').includes(termo);
    });
  }, [cidades, busca, soGrandes]);

  const habitantesVisiveis = visiveis.reduce((s, c) => s + (c.population || 0), 0);

  if (!uf) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl my-auto" style={v.card}>

        {/* ── Cabeçalho ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
              style={{ background: cor.chip, color: cor.text, border: `1px solid ${cor.stroke}` }}>
              {uf}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold truncate" style={{ color: v.textPrimary }}>
                Cidades de {UF_NOME[uf] || uf}
              </h2>
              <p className="text-sm" style={{ color: v.textSubtle }}>
                {isLoading
                  ? 'Carregando…'
                  : `${fmtUn(data?.total || 0)} municípios · ${fmtUn(data?.habitantes || 0)} habitantes`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 shrink-0" style={{ color: v.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            {/* A primeira abertura de cada estado baixa a lista do IBGE.
                Dizer isso evita o "travou" de quem espera cinco segundos
                sem explicação. */}
            <p className="text-xs" style={{ color: v.textSubtle }}>
              Primeira consulta deste estado — buscando no IBGE.
            </p>
          </div>
        ) : error || data?.tabela_ausente ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: '#f87171' }}>
              {data?.tabela_ausente
                ? 'A tabela de municípios ainda não existe no banco: falta rodar a migração 073.'
                : (error?.error || 'Não foi possível carregar as cidades.')}
            </p>
          </div>
        ) : (
          <>
            {/* ── Filtros ───────────────────────────────────── */}
            <div className="px-5 py-3 flex flex-wrap items-center gap-3"
              style={{ borderBottom: `1px solid ${v.divider}` }}>
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: v.textMuted }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Cidade, DDD ou região metropolitana"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: v.inputBg || 'rgba(255,255,255,0.06)', color: v.textPrimary, border: `1px solid ${v.divider}` }} />
              </div>
              <button onClick={() => setSoGrandes(s => !s)}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={soGrandes
                  ? { background: cor.chip, color: cor.text, border: `1px solid ${cor.stroke}` }
                  : { color: v.textMuted, border: `1px solid ${v.divider}` }}>
                Só acima de 50 mil habitantes
              </button>
              <span className="text-xs ml-auto" style={{ color: v.textSubtle }}>
                {fmtUn(visiveis.length)} de {fmtUn(cidades.length)} · {fmtUn(habitantesVisiveis)} habitantes
              </span>
            </div>

            {/* ── Lista ─────────────────────────────────────── */}
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: v.headerBg || '#16204a' }}>
                    {['Cidade', 'Situação', 'Distritos', 'CEP', 'DDD', 'Habitantes'].map((h, i) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: v.textMuted, textAlign: i >= 4 ? 'right' : 'left', borderBottom: `1px solid ${v.divider}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(c => (
                    <tr key={c.ibge_code} style={{ borderBottom: `1px solid ${v.divider}` }}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {c.capital && <Star size={13} className="shrink-0" style={{ color: '#f5e25c' }} fill="#f5e25c" />}
                          <span style={{ color: v.textPrimary, fontWeight: c.capital ? 700 : 400 }}>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.capital && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: 'rgba(245,226,92,0.18)', color: '#f5e25c' }}>CAPITAL</span>
                          )}
                          {c.metro ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: cor.chip, color: cor.text }}
                              title={c.metro}>
                              METROPOLITANA
                            </span>
                          ) : (!c.capital && (
                            <span className="text-[11px]" style={{ color: v.textSubtle }}>Interior</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {/* O IBGE conta a sede como distrito e toda cidade
                            tem a sua. Repetir isso não informa nada — o que
                            importa é o distrito separado, o povoado a 40 km
                            que só aparece quando a entrega volta. */}
                        {c.districts?.length ? (
                          <span style={{ color: v.textMuted }} title={c.districts.join(', ')}>
                            {c.districts.length === 1
                              ? c.districts[0]
                              : `${c.districts.length} distritos`}
                          </span>
                        ) : (
                          <span style={{ color: v.textSubtle }}>Só a sede</span>
                        )}
                      </td>
                      {/* TRÊS ESTADOS, E O NÚMERO É O MESMO NOS DOIS PRIMEIROS.
                          Quem preenche etiqueta quer LER O CEP, e nao decifrar
                          uma faixa: por isso "83490-000 a 83490-999" virou
                          "83490-000" com um selo. O selo e que carrega a
                          diferenca, para quem precisa dela:

                            unico  a cidade inteira usa este numero
                            geral  o CEP da localidade; as ruas variam depois
                                   do trace, dentro do mesmo prefixo
                            em branco  a cidade tem faixa de verdade (o CEP
                                   muda de bairro para bairro) e nao existe um
                                   numero que a represente

                          Mostrar so a faixa escondia o CEP no meio dela; e
                          mostrar so o numero, sem o selo, faria "83490-000"
                          parecer o endereco exato de todo mundo. */}
                      <td className="px-4 py-2.5 tabular-nums"
                        style={{ color: c.cep_start ? v.textMuted : v.textSubtle }}>
                        {!c.cep_start ? '—' : (() => {
                          const faixa = c.cep_end && c.cep_end !== c.cep_start;
                          return (
                            <span className="inline-flex items-center gap-1.5"
                              title={faixa
                                ? `CEP geral de ${c.name}. As ruas usam de ${c.cep_start} a ${c.cep_end}.`
                                : 'A cidade inteira usa este CEP'}>
                              {c.cep_start}
                              {faixa && (
                                <span className="text-[9px] px-1 py-0.5 rounded"
                                  style={{ background: 'rgba(96,165,250,0.16)', color: '#93c5fd' }}>geral</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-right" style={{ color: c.ddd ? cor.text : v.textSubtle }}>
                        {c.ddd ? `(${c.ddd})` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums"
                        style={{ color: v.textPrimary, fontWeight: (c.population || 0) >= 100000 ? 700 : 400 }}>
                        {c.population != null ? fmtUn(c.population) : '—'}
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: v.empty }}>
                        Nenhuma cidade com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Rodapé: de onde vêm os dados ──────────────── */}
            <div className="px-5 py-3 space-y-1.5" style={{ borderTop: `1px solid ${v.divider}` }}>
              <div className="flex items-start gap-2 text-[11px]" style={{ color: '#fbbf24' }}>
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>
                  Número limpo = a cidade inteira usa aquele CEP. Com o selo
                  <b> geral</b> = as ruas mudam depois do traço, mas todas dentro do
                  mesmo prefixo, e aquele é o CEP da localidade. Em branco = a cidade
                  tem FAIXA de verdade (o CEP muda de bairro para bairro) e não existe
                  um número que a represente — faixa por município só sai do DNE dos
                  Correios, que é pago. Continua em branco de propósito: melhor vazio
                  do que um CEP chutado virando etiqueta errada.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: v.textSubtle }}>
                <span className="flex items-center gap-1"><MapPin size={11} /> Municípios, distritos e regiões metropolitanas: IBGE</span>
                <span className="flex items-center gap-1"><Users size={11} /> Habitantes: Censo 2022</span>
                <span className="flex items-center gap-1"><Phone size={11} /> DDD: BrasilAPI</span>
                <span className="flex items-center gap-1"><Building2 size={11} /> Somente consulta — o território quem define é o Administrativo</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
