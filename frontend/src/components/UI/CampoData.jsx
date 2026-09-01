// ============================================================
// UM CAMPO DE DATA QUE ACEITA O JEITO DE CADA UM.
//
// O campo antigo era só uma máscara: obrigava a digitar DD/MM/AAAA e não
// tinha calendário. Para data de nascimento isso é o pior dos mundos —
// ninguém escolhe 1978 num calendário rolando mês a mês, e quem digita
// rápido erra a barra.
//
// Aqui as três formas funcionam e chegam no mesmo lugar:
//
//   digitar 15/03/1978   as barras entram sozinhas
//   digitar 15031978     vira 15/03/1978 enquanto escreve
//   clicar no calendário abre o do próprio aparelho, já no ano certo
//
// O valor que sai é sempre AAAA-MM-DD, que é o que o banco guarda. Data
// impossível (31/02, ano 1200) não é aceita em silêncio: o campo avisa,
// porque data errada em cadastro é o tipo de erro que só aparece meses
// depois, quando alguém tenta usar.
// ============================================================
import { useRef, useId } from 'react';
import { CalendarDays } from 'lucide-react';

/**
 * "15031978" ou "15/03/1978" → "15/03/1978", enquanto digita.
 *
 * A versao anterior era so um encaixe de barras e deixava passar
 * "129/09" e "99/99/9999". Duas coisas faltavam:
 *
 *   1. DIA E MES COM TETO. Dia nao passa de 31 e mes nao passa de 12.
 *      Mostrar 99 na tela e so reclamar no fim e deixar a pessoa
 *      digitar o campo inteiro para depois dizer que nao servia.
 *
 *   2. O ZERO QUE SE COMPLETA SOZINHO. Digito inicial acima de 3 so
 *      pode ser dia 04..09 — nao existe dia 9X. Entao "9" vira "09" na
 *      hora, em vez de esperar um segundo digito que nunca faz sentido.
 *      Idem para o mes acima de 1. Assim "9/9/2026" sai de "992026".
 */
export const mascaraData = v => {
  let d = String(v || '').replace(/\D/g, '').slice(0, 8);
  if (!d) return '';

  let dia;
  if (d[0] > '3') { dia = '0' + d[0]; d = d.slice(1); }
  else            { dia = d.slice(0, 2); d = d.slice(2); }
  if (dia.length === 2 && +dia > 31) dia = '31';

  let mes = '';
  if (d.length) {
    if (d[0] > '1') { mes = '0' + d[0]; d = d.slice(1); }
    else            { mes = d.slice(0, 2); d = d.slice(2); }
    if (mes.length === 2 && +mes > 12) mes = '12';
  }

  return [dia, mes, d.slice(0, 4)].filter(Boolean).join('/');
};

/**
 * "15/03/1978" → "1978-03-15". Devolve null se a data não existir.
 *
 * Valida de verdade: 31/02/1990 tem o formato certo e não é uma data.
 * O `Date` do JavaScript aceita e "conserta" para 03/03 — por isso a
 * conferência campo a campo depois de montar.
 */
export function paraISO(br) {
  const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, ano] = m;
  const dt = new Date(`${ano}-${mes}-${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== +ano || dt.getMonth() + 1 !== +mes || dt.getDate() !== +d) return null;
  return `${ano}-${mes}-${d}`;
}

/** "1978-03-15" → "15/03/1978". */
export const paraBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * @param value     AAAA-MM-DD (ou vazio)
 * @param onChange  recebe AAAA-MM-DD, ou '' enquanto a data estiver incompleta
 * @param maxHoje   true impede data futura (nascimento não é no futuro)
 */
export default function CampoData({
  value, onChange, maxHoje = false, className = 'input', ...props
}) {
  const escondido = useRef(null);
  const id = useId();

  const texto = paraBR(value);
  const hoje = new Date().toISOString().slice(0, 10);

  // Só avisa quando a pessoa terminou de digitar: reclamar de "15/0"
  // enquanto ela escreve é ruído.
  const digitado = useRef('');
  const completo = digitado.current.length === 10;
  const invalido = completo && !paraISO(digitado.current);

  function digitar(e) {
    const br = mascaraData(e.target.value);
    digitado.current = br;

    // A MASCARA SE APLICA SEMPRE.
    //
    // Antes ela so era escrita de volta quando o texto ja tinha 9 ou 10
    // caracteres. Em todo o resto do caminho o campo guardava o que foi
    // digitado, CRU — e era por isso que "129/09" aparecia na tela: a
    // mascara tinha calculado "12/90/9" e nao escrevia.
    e.target.value = br;

    // Manda '' enquanto não fechar uma data válida: meia data gravada é
    // pior que nenhuma.
    onChange(paraISO(br) || '');
  }

  /**
   * SAIU DO CAMPO COM "31/09" — O ANO E O DESTE ANO.
   *
   * Digitar dia e mes e pular o ano e o jeito normal de escrever data
   * de um pedido: quase tudo acontece no ano corrente, e repetir "2026"
   * a cada campo e trabalho que a maquina faz melhor. Antes, sair assim
   * deixava o campo vazio — a data digitada simplesmente sumia, porque
   * meia data nao vira valor.
   *
   * So completa quando FALTA APENAS o ano. "3" ou "31/" continuam
   * incompletos e continuam sem valor: adivinhar mes tambem seria
   * inventar.
   *
   * E QUANDO COMPLETA, O onBlur DE FORA NAO RODA.
   *
   * O PDV usa o blur para empurrar para o ano seguinte qualquer data
   * anterior a data da operacao. As duas regras se atropelaram: com a
   * operacao em 01/09/2026, digitar "31/08" virava 31/08/2026 e o blur
   * de fora bumpava para 2027 — o ano automatico existia por um
   * instante e era desfeito antes de aparecer.
   *
   * Quem acabou de digitar dia e mes quer ESTE ano. A regra de empurrar
   * continua valendo para data escrita por inteiro ou escolhida no
   * calendario, onde o ano foi uma decisao e nao um preenchimento.
   */
  function completarAno(e) {
    const br = digitado.current || '';
    const m = /^(\d{2})\/(\d{2})\/?$/.exec(br);
    if (m) {
      const cheio = `${m[1]}/${m[2]}/${new Date().getFullYear()}`;
      digitado.current = cheio;
      e.target.value = cheio;
      const iso = paraISO(cheio);
      // Data que nao existe (31/09) continua sem valor, e o aviso
      // abaixo do campo aparece — completar o ano nao e validar.
      if (iso) { onChange(iso); return; }
    }
    props.onBlur?.(e);
  }

  function abrirCalendario() {
    const el = escondido.current;
    if (!el) return;
    // showPicker é o jeito moderno; onde não existe, o clique no input
    // nativo resolve. Nunca deixa o botão sem efeito.
    if (typeof el.showPicker === 'function') { try { el.showPicker(); return; } catch { /* segue */ } }
    el.focus();
    el.click();
  }

  return (
    <div>
      <div className="relative">
        <input
          {...props}
          type="text"
          inputMode="numeric"
          className={`${className} pr-10`}
          placeholder="DD/MM/AAAA"
          maxLength={10}
          defaultValue={texto}
          key={texto}
          onChange={digitar}
          onBlur={completarAno}
        />

        <button type="button" onClick={abrirCalendario} tabIndex={-1}
          aria-label="Abrir calendário"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded hover:opacity-70"
          style={{ color: 'rgba(147,197,253,0.85)' }}>
          <CalendarDays size={16} />
        </button>

        {/* O calendário nativo do aparelho, escondido atrás do ícone: no
            celular ele é MUITO melhor que qualquer coisa que eu desenhe,
            e no computador dá o seletor de ano, que é o que falta para
            data de nascimento. */}
        <input
          ref={escondido}
          id={id}
          type="date"
          value={value || ''}
          max={maxHoje ? hoje : undefined}
          onChange={e => { digitado.current = paraBR(e.target.value); onChange(e.target.value); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {invalido && (
        <p className="text-[11px] mt-1" style={{ color: '#f87171' }}>
          Essa data não existe. Confira o dia e o mês.
        </p>
      )}
    </div>
  );
}
