// Identidade anônima do visitante da loja — usada só para as curtidas das
// promoções: é o que impede a mesma pessoa de contar duas vezes e o que
// acende o coração de volta quando ela retorna. Não tem login, não tem
// cadastro, não vai para lugar nenhum além da tabela de curtidas.

const CHAVE = 'lyon_visitante';

function novo() {
  try { return crypto.randomUUID(); } catch { /* contexto sem crypto */ }
  return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

let memoria = null;

export function visitorId() {
  try {
    let v = localStorage.getItem(CHAVE);
    if (!v) { v = novo(); localStorage.setItem(CHAVE, v); }
    return v;
  } catch {
    // navegação anônima ou storage bloqueado: curte agora, esquece ao recarregar
    return (memoria ||= novo());
  }
}
