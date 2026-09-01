// ============================================================
// TELA 2 — OS MODELOS DE UMA FAMÍLIA.
//
// A MESMA TELA PARA TODAS AS FAMÍLIAS. Canecas, Long Drink, Taças e o
// que vier amanhã entram por aqui — a família muda no endereço, não no
// código. Uma página por família seria dez páginas para consertar
// quando o botão mudar de lugar.
//
// CADA CARD É UM MODELO DO CADASTRO. "Long Drink Tradicional 350 ml"
// é um card porque existe uma linha dele em Produtos.
//
// Já foi base × acabamento: treze cards saindo de um par de linhas do
// cadastro, com nomes — "Long Drink Degradê 350 ml" — que não existiam
// em lugar nenhum do sistema. Quem abria Produtos atrás de "Degradê"
// não achava nada, e com razão: degradê é ACABAMENTO, e se aplica na
// peça. Ele agora é escolhido dentro do configurador, junto com a cor.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Search, Loader2, ArrowLeft, ShoppingCart, ImageOff } from 'lucide-react';
import api from './api';
import { CatalogoShell, NEON, bordaNeon, corComAlfa, Campo, brl } from './ui';
import { useCarrinho } from './carrinhoContexto';

/**
 * As fotos do modelo, alternando.
 *
 * São as fotos do CADASTRO, uma por cor. Um modelo com 14 cores tem 14
 * fotos reais — mostrar só a primeira fazia a grade inteira parecer a
 * mesma caneca repetida. É o mesmo comportamento do card de categoria
 * da /loja.
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

  const modelos = data?.modelos || [];
  const nomeFamilia = data?.familia?.nome || '';

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return modelos;
    return modelos.filter(m => m.nome.toLowerCase().includes(t));
  }, [modelos, busca]);

  function abrir(m) {
    const query = m.acabamento_id ? `?acabamento=${m.acabamento_id}` : '';
    navigate(`/personalizados/configurar/${m.chave}${query}`);
  }

  return (
    <CatalogoShell
      titulo={nomeFamilia ? `Categoria: ${nomeFamilia}` : 'Categoria'}
      subtitulo="Escolha o modelo para configurar cores, acabamento e personalização."
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
            placeholder="Buscar modelo" aria-label="Buscar modelo" style={{ paddingLeft: 34 }} />
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
      ) : !filtrados.length ? (
        <p className="text-center py-20 text-sm" style={{ color: NEON.suave }}>
          {modelos.length ? 'Nenhum modelo com esse nome.' : 'Esta categoria ainda não tem modelos publicados.'}
        </p>
      ) : (
        <div className="grid gap-3.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtrados.map((m, i) => {
            const espectro = [NEON.ciano, NEON.azul, NEON.roxo, NEON.magenta];
            const cor = espectro[i % espectro.length];
            return (
              <button key={`${m.chave}-${m.acabamento_id || 'base'}`} type="button" onClick={() => abrir(m)}
                className="text-left p-3.5 flex flex-col transition-transform active:scale-[0.985] hover:-translate-y-0.5"
                style={bordaNeon(cor)}>

                {/* Fundo CLARO atrás da foto. Os PNGs dos copos são
                    recortados, sem fundo — sobre o azul-noite do catálogo
                    o copo preto sumia e o branco virava um borrão. É o
                    mesmo creme que a /loja usa atrás da mesma foto. */}
                <span className="relative h-28 rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                  style={{ background: '#FFF7F1' }}>
                  <FotoModelo imagens={m.imagens} imagem={m.imagem} alt={m.nome} />
                </span>

                <span className="block font-semibold text-[13.5px] leading-snug" style={{ color: NEON.texto }}>
                  {m.nome}
                </span>

                {/* O número de acabamentos entra aqui porque some da
                     grade: a vitrine encolheu de catorze cards para um,
                     e sem esta linha o cliente não fica sabendo que
                     degradê, jateado e bicolor continuam existindo —
                     agora dentro do configurador. */}
                <span className="block text-[11px] mt-1" style={{ color: NEON.fraco }}>
                  {[m.capacidade, `${m.cores} cores`,
                    m.acabamentos > 1 ? `${m.acabamentos} acabamentos` : null]
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
