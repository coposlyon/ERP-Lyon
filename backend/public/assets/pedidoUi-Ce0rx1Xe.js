const o={cinza:"#94a3b8",amarelo:"#facc15",laranja:"#fb923c",azul:"#60a5fa",roxo:"#c084fc",rosa:"#f472b6",ciano:"#22d3ee",verde:"#4ade80",vermelho:"#f87171"},e=a=>o[a]||o.cinza,t={normal:{cor:"#22c55e",titulo:"No prazo"},atencao:{cor:"#facc15",titulo:"Atenção — 2 dias do prazo com pendência"},critico:{cor:"#ef4444",titulo:"Crítico — menos de 24h com pendência em aberto"}},c=`
  @keyframes atencaoPisca  { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
  @keyframes atencaoSirene { 0%,100% { opacity: 1; transform: rotate(-8deg) }
                             50%     { opacity: .45; transform: rotate(8deg) } }
  @media (prefers-reduced-motion: reduce) {
    [style*="atencaoPisca"], [style*="atencaoSirene"] { animation: none !important }
  }
`,n=a=>`PV-${String(a??"").padStart(4,"0")}`,r=a=>a==null?null:String(a).padStart(4,"0");export{c as C,t as N,r as a,e as b,n as c};
