// ============================================================
// TELA 1 — CATÁLOGO DE PRODUTOS PERSONALIZADOS.
//
// O índice das famílias, e nada mais. Quem abre o link do vendedor
// precisa responder uma pergunta só: "que tipo de copo eu quero?".
// Mostrar modelo, cor e preço aqui seria responder três perguntas antes
// de a primeira ser feita.
//
// AS FAMÍLIAS SÃO CADASTRO. Nenhuma está escrita aqui. Família nova é
// linha em CATALOGO_FAMILIAS e aparece sozinha; família sem produto não
// aparece, porque card que leva a uma tela vazia é pior que card
// nenhum.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as Icones from 'lucide-react';
import { Search, Package, Loader2, ArrowRight, ShoppingCart } from 'lucide-react';
import api from './api';
import { CatalogoShell, NEON, bordaNeon, corComAlfa, Campo } from './ui';
import { useCarrinho } from './carrinhoContexto';

/**
 * O ícone que o Administrativo escolheu, pelo nome.
 *
 * Nome errado no cadastro não pode quebrar a tela: cai no ícone padrão.
 * Uma família sem card por causa de um typo é o tipo de bug que ninguém
 * relaciona com o cadastro.
 */
function IconeDaFamilia({ nome, ...props }) {
  const Escolhido = (nome && Icones[nome]) || Package;
  return <Escolhido {...props} />;
}

export default function Familias() {
  const navigate = useNavigate();
  const carrinho = useCarrinho();
  const [busca, setBusca] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['catalogo', 'familias'],
    queryFn: () => api.get('/familias'),
    staleTime: 5 * 60 * 1000,
  });

  const familias = data?.familias || [];

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return familias;
    return familias.filter(f => f.nome.toLowerCase().includes(t));
  }, [familias, busca]);

  return (
    <CatalogoShell
      largura="max-w-6xl"
      titulo="Catálogo de Produtos Personalizados"
      subtitulo="Escolha uma categoria para visualizar os modelos disponíveis."
      trilha={[{ nome: 'Catálogo' }]}>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: NEON.ciano }} />
          <Campo value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar categorias" aria-label="Buscar categorias"
            className="pl-9" style={{ paddingLeft: 34 }} />
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
      ) : !familias.length ? (
        <p className="text-center py-20 text-sm" style={{ color: NEON.suave }}>
          O catálogo ainda está sendo montado. Fale com um de nossos atendentes.
        </p>
      ) : !filtradas.length ? (
        <p className="text-center py-20 text-sm" style={{ color: NEON.suave }}>
          Nenhuma categoria com esse nome.
        </p>
      ) : (
        <div className="grid gap-3.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtradas.map((f, i) => {
            // O tom de cada card acompanha o espectro da logo, da esquerda
            // para a direita — a grade inteira vira o degradê da marca em
            // vez de vinte cartões azuis iguais.
            const espectro = [NEON.ciano, NEON.azul, NEON.roxo, NEON.magenta];
            const cor = espectro[i % espectro.length];
            return (
              <button key={f.id} type="button"
                onClick={() => navigate(`/personalizados/${f.slug}`)}
                className="text-left p-4 transition-transform active:scale-[0.985] hover:-translate-y-0.5"
                style={bordaNeon(cor)}>

                {/* A MESMA foto que a /loja mostra na categoria. O ícone
                    ficou de reserva: categoria sem produto fotografado
                    ainda precisa de um card reconhecível. */}
                <span className="h-32 rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                  style={{ background: f.imagem ? '#FFF7F1' : corComAlfa(cor, 0.16),
                           border: `1px solid ${corComAlfa(cor, 0.25)}` }}>
                  {f.imagem
                    ? <img src={f.imagem} alt="" loading="lazy" className="h-full w-full object-contain p-2"
                        onError={e => { e.target.style.display = 'none'; }} />
                    : <IconeDaFamilia nome={f.icone} size={26} style={{ color: cor }} />}
                </span>

                <span className="block font-semibold text-[15px] leading-snug" style={{ color: NEON.texto }}>
                  {f.nome}
                </span>
                <span className="block text-[11px] mt-0.5" style={{ color: NEON.fraco }}>
                  {f.modelos} {f.modelos === 1 ? 'modelo' : 'modelos'}
                </span>

                <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: cor }}>
                  Ver catálogo <ArrowRight size={13} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </CatalogoShell>
  );
}
