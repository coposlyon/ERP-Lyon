// ============================================================
// TELA 2 — COMO ESTA PEÇA PODE SER FEITA.
//
// A vitrine (tela 1) passou a ser uma PEÇA E UM TAMANHO — "Caneca Slim
// 400 ml". Aqui vem a pergunta seguinte, que é o acabamento: Tradicional,
// Degradê, Bicolor, Jateado, Preto Fosco, Borda Metalizada, Degradê com
// Borda. A cor fica para o configurador, que é onde ela pode ser vista
// no copo.
//
// ANTES ESTA TELA MOSTRAVA AS CORES, e por isso a decisão vinha ao
// contrário: trinta e cinco cards de cor, e o acabamento escondido lá
// dentro. Quem queria "a caneca jateada" tinha de escolher uma cor
// primeiro para descobrir se jateado existia.
//
// DUAS NATUREZAS NA MESMA LISTA, de propósito. Um acabamento pode ser
// uma CATEGORIA de verdade (peça própria, foto e código próprios) ou uma
// regra da matriz de compatibilidade (serviço aplicado sobre a peça).
// A diferença é de cadastro, não da cliente — para ela as duas
// respondem "como esse copo pode ser feito?", e é o servidor que junta.
//
// A MESMA TELA ATENDE LINK ANTIGO. Endereço de categoria ou de família
// mandado por WhatsApp mês passado continua abrindo, e cai na grade de
// cores de sempre — o servidor devolve `modelos` em vez de
// `acabamentos`, e a tela desenha o que veio.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, ArrowLeft, ShoppingCart, ImageOff } from 'lucide-react';
import api from './api';
import { CatalogoShell, NEON, bordaNeon, corComAlfa, Campo, brl } from './ui';
import { useCarrinho } from './carrinhoContexto';

/**
 * As fotos, alternando.
 *
 * São as do CADASTRO, uma por cor. Um acabamento com 14 cores tem 14
 * fotos reais — mostrar só a primeira faria a grade inteira parecer a
 * mesma caneca repetida.
 */
function FotoModelo({ imagens, imagem, alt }) {
  const fotos = (imagens && imagens.length ? imagens : [imagem]).filter(Boolean);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (fotos.length <= 1) return undefined;
    const t = setInterval(() => setI(v => (v + 1) % fotos.length), 2600);
    return () => clearInterval(t);
  }, [fotos.length]);

  if (!fotos.length) return <ImageOff size={22} style={{ color: NEON.fraco }} />;
  return (
    <>
      {fotos.map((src, k) => (
        <img key={src + k} src={src} alt={alt} loading="lazy"
          className="absolute inset-0 h-full w-full object-contain p-1 transition-opacity duration-500"
          style={{ opacity: k === i ? 1 : 0 }}
          onError={e => { e.target.style.display = 'none'; }} />
      ))}
    </>
  );
}

const ESPECTRO = [NEON.ciano, NEON.azul, NEON.roxo, NEON.magenta];

export default function Modelos() {
  const { familia } = useParams();
  const navigate = useNavigate();
  const carrinho = useCarrinho();
  const [busca, setBusca] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['catalogo', 'familia', familia],
    queryFn: () => api.get(`/familia/${familia}`),
    staleTime: 5 * 60 * 1000,
  });

  const acabamentos = data?.acabamentos || [];
  const modelos = data?.modelos || [];
  const nomeFamilia = data?.familia?.nome || '';
  // Acabamento é o caminho novo; a grade de cores só aparece para os
  // links antigos, que o servidor continua atendendo.
  const porAcabamento = acabamentos.length > 0;

  const lista = useMemo(() => {
    const base = porAcabamento ? acabamentos : modelos;
    const t = busca.trim().toLowerCase();
    if (!t) return base;
    return base.filter(m => String(m.nome || '').toLowerCase().includes(t));
  }, [porAcabamento, acabamentos, modelos, busca]);

  /**
   * Abre o configurador já no que a cliente escolheu.
   *
   * O acabamento vai no endereço porque foi ELE que ela clicou — chegar
   * no configurador e ter de escolher de novo é perguntar duas vezes a
   * mesma coisa. A cor vai junto quando o card é uma cor (link antigo).
   */
  function abrir(m) {
    const q = new URLSearchParams();
    if (m.acabamento_id) q.set('acabamento', m.acabamento_id);
    if (m.cor) q.set('cor', m.cor);
    const query = q.toString() ? `?${q}` : '';
    navigate(`/personalizados/configurar/${m.chave}${query}`);
  }

  return (
    <CatalogoShell
      titulo={nomeFamilia || 'Catálogo'}
      subtitulo={porAcabamento
        ? 'Escolha o acabamento. A cor você escolhe na tela seguinte, vendo o copo.'
        : 'Escolha o modelo para configurar cores, acabamento e personalização.'}
      trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: nomeFamilia || '…' }]}>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link to="/personalizados"
          className="rounded-lg px-3.5 py-2.5 text-[13px] flex items-center gap-2 shrink-0"
          style={{ ...bordaNeon(NEON.azul), color: NEON.azul }}>
          <ArrowLeft size={15} /> Voltar
        </Link>

        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: NEON.ciano }} />
          <Campo value={busca} onChange={e => setBusca(e.target.value)}
            placeholder={porAcabamento ? 'Buscar acabamento' : 'Buscar modelo'}
            aria-label="Buscar" style={{ paddingLeft: 34 }} />
        </div>

        {carrinho.pecas > 0 && (
          <button type="button" onClick={() => navigate('/personalizados/carrinho')}
            className="rounded-lg px-4 py-2.5 text-[13px] font-medium flex items-center gap-2 shrink-0"
            style={{ ...bordaNeon(NEON.rosa), color: NEON.rosa }}>
            <ShoppingCart size={15} /> Carrinho · {carrinho.pecas} un
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 size={30} className="animate-spin" style={{ color: NEON.azul }} />
        </div>
      ) : error ? (
        <p className="text-center py-20 text-sm" style={{ color: '#fca5a5' }}>{error.message}</p>
      ) : !lista.length ? (
        <p className="text-center py-20 text-sm" style={{ color: NEON.suave }}>
          {(porAcabamento ? acabamentos.length : modelos.length)
            ? 'Nada com esse nome.'
            : 'Esta peça ainda não tem acabamento liberado. Fale com um atendente.'}
        </p>
      ) : (
        <div className={`grid gap-3.5 ${porAcabamento
          // MENOS CARDS E MAIORES: são seis ou sete acabamentos, não
          // trinta e cinco cores. Uma grade de cinco colunas para seis
          // itens deixa a peça pequena justamente na tela em que ela é
          // a decisão.
          ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
          {lista.map((m, i) => {
            const cor = ESPECTRO[i % ESPECTRO.length];
            return (
              <button key={m.id || m.produto_id || `${m.chave}-${i}`} type="button" onClick={() => abrir(m)}
                className="text-left p-3.5 flex flex-col transition-transform active:scale-[0.985] hover:-translate-y-0.5"
                style={bordaNeon(cor)}>

                {/* Fundo CLARO atrás da foto: os PNGs são recortados, e
                    sobre o azul-noite o copo preto some e o branco vira
                    um borrão. É o mesmo creme da /loja. */}
                <span className={`relative rounded-lg mb-3 flex items-center justify-center overflow-hidden ${
                  porAcabamento ? 'h-36' : 'h-28'}`}
                  style={{ background: '#FFF7F1' }}>
                  <FotoModelo imagens={m.imagens} imagem={m.imagem} alt={m.nome} />
                </span>

                <span className="block font-semibold text-[13.5px] leading-snug" style={{ color: NEON.texto }}>
                  {m.nome}
                </span>

                <span className="block text-[11px] mt-1" style={{ color: NEON.fraco }}>
                  {porAcabamento
                    ? `${m.cores} ${m.cores === 1 ? 'cor' : 'cores'}`
                    : [m.codigo, m.acabamentos > 1 ? `${m.acabamentos} acabamentos` : null]
                        .filter(Boolean).join(' · ')}
                </span>

                <span className="mt-auto pt-3 flex items-baseline justify-between gap-2">
                  {m.preco_de > 0 && (
                    <span className="text-[11px]" style={{ color: NEON.suave }}>
                      a partir de <b style={{ color: NEON.texto }}>{brl(m.preco_de)}</b>
                    </span>
                  )}
                  <span className="text-[12px] font-medium ml-auto shrink-0" style={{ color: cor }}>
                    Selecionar
                  </span>
                </span>

                {m.qtd_minima > 1 && (
                  <span className="block text-[10px] mt-1.5 px-2 py-0.5 rounded-full w-fit"
                    style={{ background: corComAlfa(cor, 0.14), color: NEON.suave }}>
                    mínimo {m.qtd_minima} un
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </CatalogoShell>
  );
}
