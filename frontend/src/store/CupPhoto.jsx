import { useState, useEffect } from 'react';
import { cutout } from './cutout';

// Foto de copo sobre fundo escuro (topo e paleta). Mostra a foto original na
// hora e troca pelo recorte assim que ele fica pronto — o fundo branco, quando
// existe, some sem deixar o espaço vazio enquanto processa.
export default function CupPhoto({ src, alt = '', className = '', style }) {
  const [url, setUrl] = useState(src);

  useEffect(() => {
    let vivo = true;
    setUrl(src);
    if (src) cutout(src).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [src]);

  if (!url) return null;
  return <img src={url} alt={alt} loading="lazy" className={className} style={style} />;
}
