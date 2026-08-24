// ============================================================
// AS PEÇAS DA TELA 01 QUE NÃO EXISTIAM.
//
// Três coisas que o padrão aprovado pede e o cadastro não tinha:
//
//   ALTERNADOR Sim/Não — "Possui CNH?", "Possui filhos?". Não é enfeite:
//   é o que faz o bloco seguinte existir ou não. Marcar "Não" precisa
//   ESCONDER os campos, senão a pessoa preenche e o dado fica órfão.
//
//   STATUS DOS DOCUMENTOS — a coluna da direita CONSULTA a Tela 04, não
//   anexa nada. Ter dois lugares que sobem o mesmo arquivo é ter dois
//   arquivos diferentes com o mesmo nome, e ninguém sabe qual vale.
//
//   CAPTURA FACIAL — a foto sai da câmera do aparelho, com prévia e
//   chance de refazer. Registra data e hora: identificação de pessoa
//   sem data é identificação de quando?
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  Camera, RefreshCw, Check, X, ShieldCheck, FileText, Users, Baby,
  Home, Landmark, Loader2, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Sim / Não ───────────────────────────────────────────── */

export function SimNao({ label, valor, aoMudar, dica }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => aoMudar(true)}
          className={`w-11 h-6 rounded-full relative transition-colors ${valor ? 'bg-primary-600' : 'bg-gray-300'}`}
          aria-pressed={!!valor} aria-label={`${label} sim`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${valor ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
        <button type="button" onClick={() => aoMudar(true)}
          className={`text-sm ${valor ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>Sim</button>
        <button type="button" onClick={() => aoMudar(false)}
          className={`text-sm ml-2 ${!valor ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>Não</button>
      </div>
      {dica && <span className="text-[11px] text-gray-400">{dica}</span>}
    </div>
  );
}

/* ── Status dos documentos (somente leitura) ─────────────── */

const GRUPOS = [
  { chave: 'pessoais', icone: FileText, titulo: 'Documentos pessoais',
    sub: 'RG, CPF, comprovante de PIS, foto.',
    docs: ['rg', 'cpf', 'pis', 'foto', 'titulo_eleitor', 'reservista'] },
  { chave: 'cnh', icone: FileText, titulo: 'Documentos da CNH',
    sub: 'CNH frente e verso.', docs: ['cnh'], sePossuiCnh: true },
  { chave: 'conjuge', icone: Users, titulo: 'Documentos do cônjuge',
    sub: 'Certidão de casamento, RG/CPF.',
    docs: ['certidao_casamento', 'conjuge_documento'], seCasado: true },
  { chave: 'filhos', icone: Baby, titulo: 'Documentos dos filhos',
    sub: 'Certidão, RG e dados escolares.',
    docs: ['filho_certidao', 'filho_vacinacao', 'filho_escolar'], seTemFilhos: true },
  { chave: 'residencia', icone: Home, titulo: 'Comprovante de residência',
    sub: 'Conta de luz, água, etc.', docs: ['comprovante_residencia'] },
  { chave: 'bancario', icone: Landmark, titulo: 'Comprovante bancário',
    sub: 'Extrato, cartão ou contrato.', docs: ['comprovante_bancario'] },
];

/**
 * @param {object[]} anexos  o que a Tela 04 já guardou
 * @param {object}   f       o formulário, para saber quais grupos exibir
 */
export function StatusDocumentos({ anexos = [], f = {}, aoVer }) {
  const casado = /casad|uni/i.test(f.estado_civil || '');
  const temFilhos = Array.isArray(f.filhos) && f.filhos.length > 0;
  const possuiCnh = !!f.possui_cnh;

  const anexado = chaves => anexos.some(a =>
    chaves.includes(a.doc_key) || chaves.includes(a.type) ||
    chaves.some(k => String(a.doc_key || a.type || '').startsWith(k)));

  const visiveis = GRUPOS.filter(g =>
    (!g.seCasado || casado) && (!g.seTemFilhos || temFilhos) && (!g.sePossuiCnh || possuiCnh));

  return (
    <section className="card">
      <div className="card-header flex items-center gap-2">
        <ShieldCheck size={16} className="text-primary-600" />
        <h2 className="font-semibold text-gray-900 text-sm">Documentação</h2>
      </div>
      <div className="card-body space-y-2">
        {visiveis.map(g => {
          const ok = anexado(g.docs);
          const arquivo = anexos.find(a => g.docs.includes(a.doc_key) || g.docs.includes(a.type));
          return (
            <div key={g.chave}
              className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
                ok ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/30'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                ok ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                {ok ? <Check size={12} /> : <X size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-gray-800 leading-tight">{g.titulo}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{g.sub}</p>
                <p className={`text-[11px] mt-0.5 ${ok ? 'text-green-600' : 'text-red-500'}`}>
                  {ok ? 'Documento anexado' : 'Aguardando documento'}
                </p>
              </div>
              {ok && arquivo?.file_url && (
                <button type="button" title="Visualizar o arquivo"
                  onClick={() => (aoVer ? aoVer(arquivo) : window.open(arquivo.file_url, '_blank'))}
                  className="btn-ghost btn-sm shrink-0"><Eye size={13} /></button>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-gray-400 pt-1">
          Os arquivos são anexados na etapa 4. Aqui é só a conferência.
        </p>
      </div>
    </section>
  );
}

/* ── Captura facial ──────────────────────────────────────── */

/**
 * Tira a foto pela câmera do aparelho.
 *
 * A câmera é liberada assim que a prévia é confirmada ou descartada —
 * deixar o dispositivo ligado acende a luzinha no rosto de quem já
 * terminou, e é o tipo de coisa que assusta com razão.
 */
export function CapturaFacial({ foto, aoCapturar, aoRemover, capturadaEm }) {
  const [ligada, setLigada] = useState(false);
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState(null);
  const video = useRef(null);
  const fluxo = useRef(null);

  const desligar = () => {
    fluxo.current?.getTracks().forEach(t => t.stop());
    fluxo.current = null;
    setLigada(false);
  };
  useEffect(() => desligar, []);

  async function ligar() {
    setErro(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 720 } });
      fluxo.current = s;
      setLigada(true);
      setTimeout(() => { if (video.current) { video.current.srcObject = s; video.current.play(); } }, 50);
    } catch {
      setErro('Não consegui abrir a câmera. Verifique a permissão do navegador.');
    }
  }

  function tirar() {
    const v = video.current;
    if (!v) return;
    const c = document.createElement('canvas');
    // 3:4 é a proporção do card e da foto 3×4 do prontuário.
    const lado = Math.min(v.videoWidth, v.videoHeight * 0.75);
    c.width = lado; c.height = lado / 0.75;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);   // espelha: a pessoa se vê como no espelho
    ctx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - c.height) / 2, lado, c.height, 0, 0, c.width, c.height);
    setPrevia(c.toDataURL('image/jpeg', 0.9));
    desligar();
  }

  function confirmar() {
    aoCapturar(previa, new Date().toISOString());
    setPrevia(null);
    toast.success('Captura facial registrada');
  }

  const mostrando = previa || foto;

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-900 text-sm">Foto facial do colaborador</h2>
        <p className="text-[11px] text-gray-400">Capture pela câmera do aparelho.</p>
      </div>
      <div className="card-body">
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
          {ligada ? (
            <video ref={video} playsInline muted className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }} />
          ) : mostrando ? (
            <img src={mostrando} alt="Foto do colaborador" className="w-full h-full object-cover" />
          ) : (
            <Camera size={40} className="text-gray-300" />
          )}

          {!ligada && !previa && (
            <button type="button" onClick={ligar} title="Abrir a câmera"
              className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-primary-600 text-white
                         flex items-center justify-center shadow-lg hover:bg-primary-700">
              <Camera size={19} />
            </button>
          )}
        </div>

        {erro && <p className="text-[11px] text-red-500 mt-2">{erro}</p>}

        {ligada && (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={tirar} className="btn-primary btn-sm flex-1 justify-center">
              <Camera size={14} /> Capturar
            </button>
            <button type="button" onClick={desligar} className="btn-secondary btn-sm">Cancelar</button>
          </div>
        )}

        {previa && (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={confirmar} className="btn-primary btn-sm flex-1 justify-center">
              <Check size={14} /> Confirmar
            </button>
            <button type="button" onClick={() => { setPrevia(null); ligar(); }} className="btn-secondary btn-sm">
              <RefreshCw size={14} /> Refazer
            </button>
          </div>
        )}

        {!ligada && !previa && foto && (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={ligar} className="btn-secondary btn-sm flex-1 justify-center">
              <RefreshCw size={14} /> Refazer
            </button>
            <button type="button" onClick={aoRemover} className="btn-secondary btn-sm text-gray-400" title="Remover">
              <X size={14} />
            </button>
          </div>
        )}

        {foto && !previa && (
          <p className="text-[11px] text-green-600 mt-2 flex items-center gap-1">
            <Check size={12} /> Captura facial cadastrada
            {capturadaEm && (
              <span className="text-gray-400">
                · {new Date(capturadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
