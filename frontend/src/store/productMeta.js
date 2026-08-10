// Helpers compartilhados entre a loja e o Estúdio 3D para ler um produto do
// catálogo (qual forma 3D ele representa e qual é o rótulo curto da cor).

// Descobre qual modelo 3D representa o produto (pelo nome/categoria/grupo).
export function modelKeyFor(product) {
  const s = `${product?.name || ''} ${product?.category || ''} ${product?.group || ''}`.toLowerCase();
  if (/twist/.test(s)) return 'twister';
  if (/long\s*drink/.test(s)) return 'longdrink';
  if (/slim/.test(s)) return 'slim';
  if (/caneca/.test(s)) return 'caneca';
  if (/ta[çc]a/.test(s)) return 'taca';
  if (/garrafa/.test(s)) return 'garrafa';
  return 'shaker';
}

// Rótulo curto da cor: tira o nome do modelo e o volume do fim.
// (quando store_color não está preenchido, o label vem como o nome inteiro)
export function shortColor(label, group) {
  let s = String(label || '');
  if (group && s.toUpperCase().startsWith(group.toUpperCase())) s = s.slice(group.length);
  s = s.replace(/^[\s\-–—]+/, '').replace(/\s*\d+\s*ml\s*$/i, '').trim();
  return s || String(label || '');
}
