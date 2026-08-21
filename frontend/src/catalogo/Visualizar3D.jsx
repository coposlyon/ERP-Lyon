// ============================================================
// VISUALIZAR EM 3D — o copo de verdade, girando.
//
// A PERGUNTA QUE ESTA TELA RESPONDE é uma só: "é isso que vai chegar na
// minha festa?". Uma projeção chapada com um degradê não responde —
// ela mostra um desenho de copo, e desenho de copo qualquer um duvida.
// Aqui é geometria, material físico, ambiente de estúdio e sombra: o
// mesmo motor que o estúdio do ERP já usava para fechar arte.
//
// O PESO NÃO ATRAPALHA A LOJA. O three.js são ~600 KB e eles só entram
// quando o cliente APERTA "Visualizar em 3D" — `import()` dentro do
// efeito, não no topo do arquivo. Quem nunca clicar nunca baixa.
//
// E SE O APARELHO NÃO TIVER WEBGL, cai na projeção chapada de antes
// (Visualizar3DPlano), que continua no repositório justamente para
// isso. Celular velho em festa é o caso mais comum do nosso cliente;
// tela preta com "seu navegador não suporta" seria perder a venda.
//
// O QUE É DESENHADO SAI DO CADASTRO. A forma vem da categoria, as cores
// vêm do que o cliente escolheu no configurador e a arte é o mesmo vetor
// que ele aprovou no editor — não uma segunda versão feita para a foto.
// ============================================================
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { X, RotateCcw, Loader2, MousePointer2, Play, Pause } from 'lucide-react';
import { NEON, corComAlfa } from './ui';
import { corDe } from './CopoPreview';
import { svgParaImagem } from './arte';

const Visualizar3DPlano = lazy(() => import('./Visualizar3DPlano'));

/**
 * A forma 3D de cada família.
 *
 * Lê a categoria do cadastro, que é onde a informação já existe. Sem
 * correspondência cai no long drink — errar a curva do copo é bem menos
 * grave que não mostrar copo nenhum.
 */
function formaDaCategoria(categoria) {
  const t = String(categoria || '').toUpperCase();
  if (/CANECA\s+SLIM/.test(t)) return 'slim';
  if (/CANECA/.test(t)) return 'caneca';
  if (/TA[ÇC]A/.test(t)) return 'taca';
  if (/TWISTER/.test(t)) return 'twister';
  if (/SQUEEZE|GARRAFA|ACQUA/.test(t)) return 'garrafa';
  return 'longdrink';
}

/** Copo transparente é vidro; vidro pede material de transmissão. */
const ehVidro = opcao => /transparente|cristal|translucido|translúcido/i.test(String(opcao?.name || ''));

/**
 * O acabamento do material, deduzido do que o cliente escolheu.
 *
 * Jateado é fosco, metalizado é metal, transparente é vidro, o resto é
 * plástico brilhante. Deduzir aqui e não pedir ao cliente é de
 * propósito: ele escolheu "Jateado" no configurador; perguntar de novo
 * "e o acabamento do material?" seria a mesma pergunta com outro nome.
 */
function acabamentoDoMaterial(acabamento, corBase) {
  if (acabamento?.requer?.jateamento) return 'opaco';
  if (/metaliz/i.test(acabamento?.nome || '')) return 'metalico';
  if (ehVidro(corBase)) return 'translucido';
  return 'brilhante';
}

export default function Visualizar3D({ escolha = {}, faces = {}, gabarito, modelo, onFechar }) {
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [girando, setGirando] = useState(true);
  const palco = useRef(null);
  const cena = useRef({});

  // Esc fecha: quem abre um visualizador em tela cheia tenta o Esc antes
  // de procurar o X.
  useEffect(() => {
    const tecla = e => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFechar]);

  const { acabamento, campos = {} } = escolha;
  const corBase = campos.cor_base || campos.cor_produto || null;
  const corTopo = campos.cor_topo || null;
  const corBorda = campos.cor_borda || null;
  const corJateado = campos.cor_jateado || null;
  const corArte = campos.cor_personalizacao || null;

  // ── A cena ────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    let limpar = () => {};

    (async () => {
      let THREE, OrbitControls, cenario;
      try {
        [THREE, { OrbitControls }, cenario] = await Promise.all([
          import('three'),
          import('three/addons/controls/OrbitControls.js'),
          import('@/pages/Studio/scene'),
        ]);
      } catch {
        if (vivo) { setErro('lib'); setCarregando(false); }
        return;
      }
      if (!vivo || !palco.current) return;

      const { buildModel, bodyMaterial, capMaterial, composeBodyTexture, disposeObject } = cenario;
      const mount = palco.current;
      const w = mount.clientWidth || 640;
      const h = mount.clientHeight || 520;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        if (vivo) { setErro('webgl'); setCarregando(false); }
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();

      // ESTÚDIO DE FOTO, SEM ARQUIVO EXTERNO. São painéis de luz numa
      // cena auxiliar convertida em mapa de ambiente: é o que produz os
      // realces alongados de catálogo, em vez do brilho de bolinha que
      // uma luz pontual faz. Mesmo enquadramento de luz do estúdio do
      // ERP — o copo tem que parecer o mesmo copo nos dois lugares.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x2b3350);
      const softbox = (sw, sh, pos, intensidade, cor = 0xffffff) => {
        const mat = new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide });
        mat.color.multiplyScalar(intensidade);
        mat.toneMapped = false;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
        p.position.set(pos[0], pos[1], pos[2]);
        p.lookAt(0, 0, 0);
        envScene.add(p);
      };
      softbox(14, 14, [0, 12, 2], 2.6);
      softbox(4, 16, [-9, 2, 5], 3.4);
      softbox(4, 16, [9, 2, 5], 2.2);
      softbox(16, 8, [0, 1, 11], 1.1);
      // Contraluz nas cores da marca: é o que amarra o copo ao neon da
      // tela em volta em vez de parecer recortado de outro site.
      softbox(12, 12, [-7, 3, -10], 1.5, 0x22d3ee);
      softbox(12, 12, [7, 3, -10], 1.5, 0xec4899);
      scene.environment = pmrem.fromScene(envScene, 0.02).texture;
      scene.environmentIntensity = 1.05;
      envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

      const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
      camera.position.set(0, 0.7, 6.6);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 3.4;
      controls.maxDistance = 11;
      controls.target.set(0, 0.1, 0);
      controls.maxPolarAngle = Math.PI * 0.86;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.6;
      // Girar sozinho até a pessoa encostar. Parar no primeiro toque é o
      // que faz o giro automático virar apresentação em vez de briga com
      // quem está tentando olhar um lado específico.
      controls.addEventListener('start', () => { controls.autoRotate = false; setGirando(false); });

      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3350, 0.55));
      const luz = new THREE.DirectionalLight(0xffffff, 2.2);
      luz.position.set(3, 6, 4);
      luz.castShadow = true;
      luz.shadow.mapSize.set(2048, 2048);
      luz.shadow.camera.near = 1; luz.shadow.camera.far = 20;
      luz.shadow.camera.left = -4; luz.shadow.camera.right = 4;
      luz.shadow.camera.top = 5; luz.shadow.camera.bottom = -4;
      luz.shadow.bias = -0.0008;
      scene.add(luz);
      scene.add(new THREE.DirectionalLight(0xa5b4fc, 0.5).translateX(-5));

      // O CHÃO É O QUE TIRA O COPO DE "ADESIVO FLUTUANDO". Recebe a
      // sombra e some no fundo — só a sombra fica.
      const chao = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.ShadowMaterial({ opacity: 0.42 }));
      chao.rotation.x = -Math.PI / 2;
      chao.position.y = -1.62;
      chao.receiveShadow = true;
      scene.add(chao);

      // ── O copo ──────────────────────────────────────────────
      const forma = formaDaCategoria(modelo?.categoria);
      const grupo = buildModel(forma);
      grupo.position.y = forma === 'taca' ? -1.5 : 0;
      scene.add(grupo);

      const hexBase = corDe(corBase, '#c9d4ea');
      const hexTopo = corTopo ? corDe(corTopo, hexBase) : hexBase;
      const temDegrade = !!corTopo && hexTopo !== hexBase;
      const material = acabamentoDoMaterial(acabamento, corBase);

      // A arte, rasterizada na cor da tinta que o cliente escolheu.
      const tintaHex = corDe(corArte, '#ffffff');
      const [imgFrente, imgVerso] = await Promise.all([
        svgParaImagem(faces.frente, { cor: tintaHex, largura: 768 }),
        svgParaImagem(faces.verso, { cor: tintaHex, largura: 768 }),
      ]);
      if (!vivo) { renderer.dispose(); return; }

      // O rótulo desenrolado é 0→1 da esquerda para a direita dando a
      // volta no copo. Frente a 1/4, verso a 3/4: meia volta entre as
      // duas, que é exatamente onde a gráfica imprime.
      const artes = [];
      if (imgFrente) artes.push({ kind: 'image', _img: imgFrente, x: 0.25, y: 0.52, scale: 0.72 });
      if (imgVerso) artes.push({ kind: 'image', _img: imgVerso, x: 0.75, y: 0.52, scale: 0.72 });

      const textura = composeBodyTexture({
        color1: hexBase,
        color2: temDegrade ? hexTopo : hexBase,
        gradient: temDegrade,
        arts: artes,
        pattern: forma === 'twister' ? 'twist' : null,
      });

      for (const [i, mesh] of (grupo.userData.bodyMeshes || []).entries()) {
        mesh.material?.dispose();
        // Só a primeira malha é o corpo pintável; alça, haste e base do
        // pé recebem a cor lisa. Esticar o rótulo na alça da caneca
        // faria o nome do casal aparecer torto no cabo.
        mesh.material = i === 0
          ? bodyMaterial(material, { map: textura })
          : bodyMaterial(material, { color: hexBase });
      }

      // A BORDA SÓ EXISTE SE O ACABAMENTO PEDIR. Sem isso todo copo
      // ganharia um anel metálico que o cliente não comprou.
      const temBorda = !!acabamento?.requer?.borda || !!corBorda;
      for (const mesh of grupo.userData.capMeshes || []) {
        mesh.material?.dispose();
        mesh.material = temBorda
          ? capMaterial(corDe(corBorda, '#d4af37'))
          : bodyMaterial(material, { color: hexBase });
      }

      // Jateado: véu claro por cima do corpo, que é o que o jato de areia
      // faz de verdade — deixa a peça leitosa sem trocar a cor dela.
      if (acabamento?.requer?.jateamento) {
        const veu = new THREE.Mesh(
          grupo.userData.bodyMeshes[0].geometry.clone(),
          new THREE.MeshPhysicalMaterial({
            color: corDe(corJateado, '#e8edf5'),
            roughness: 0.95, metalness: 0, transparent: true, opacity: 0.38,
            side: THREE.DoubleSide, depthWrite: false,
          }));
        veu.scale.setScalar(1.004);
        veu.position.copy(grupo.userData.bodyMeshes[0].position);
        grupo.add(veu);
      }

      setCarregando(false);

      let quadro;
      const desenhar = () => {
        quadro = requestAnimationFrame(desenhar);
        controls.update();
        renderer.render(scene, camera);
      };
      desenhar();

      // ResizeObserver e não `window.resize`: o palco pode nascer com
      // altura zero (o diálogo ainda entrando na tela) e nunca disparar
      // um resize de janela — o copo ficaria esticado no tamanho de
      // reserva para sempre. E ainda cobre o celular girando de pé para
      // deitado, que é como metade dos nossos clientes olha isso.
      const redimensionar = () => {
        const lw = mount.clientWidth, lh = mount.clientHeight;
        if (!lw || !lh) return;
        camera.aspect = lw / lh;
        camera.updateProjectionMatrix();
        renderer.setSize(lw, lh);
      };
      const observador = new ResizeObserver(redimensionar);
      observador.observe(mount);
      redimensionar();

      cena.current = { controls, camera, renderer };

      limpar = () => {
        cancelAnimationFrame(quadro);
        observador.disconnect();
        controls.dispose();
        disposeObject(scene);
        textura.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => { vivo = false; limpar(); };
    // A cena é montada uma vez por abertura: o cliente abre o 3D depois
    // de escolher, e reconstruir a cada tecla derrubaria o giro no meio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternarGiro = useCallback(() => {
    const c = cena.current.controls;
    if (!c) return;
    c.autoRotate = !c.autoRotate;
    setGirando(c.autoRotate);
  }, []);

  const enquadrar = useCallback(() => {
    const { controls, camera } = cena.current;
    if (!controls || !camera) return;
    camera.position.set(0, 0.7, 6.6);
    controls.target.set(0, 0.1, 0);
    controls.update();
  }, []);

  // ── Aparelho sem WebGL: cai na projeção chapada ───────────
  if (erro) {
    return (
      <Suspense fallback={null}>
        <Visualizar3DPlano escolha={escolha} faces={faces} gabarito={gabarito} onFechar={onFechar} />
      </Suspense>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true"
      aria-label="Visualização 3D do copo"
      style={{ background: 'radial-gradient(1200px 800px at 50% 30%, #16205c 0%, #0a0f2c 55%, #04060f 100%)' }}>

      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="min-w-0">
          <p className="font-semibold text-[15px] truncate" style={{ color: NEON.texto }}>
            {modelo?.nome || 'Seu copo'}
          </p>
          <p className="text-[11.5px] truncate" style={{ color: NEON.suave }}>
            {[
              acabamento?.nome,
              corBase && `Base: ${corBase.name}`,
              corTopo && `Boca: ${corTopo.name}`,
              corBorda && `Borda: ${corBorda.name}`,
            ].filter(Boolean).join(' · ') || 'Gire para ver todos os lados'}
          </p>
        </div>

        <button type="button" onClick={onFechar} aria-label="Fechar visualização"
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
          <X size={18} style={{ color: NEON.texto }} />
        </button>
      </header>

      <div ref={palco} className="flex-1 min-h-0 relative">
        {carregando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 size={30} className="animate-spin" style={{ color: NEON.ciano }} />
            <p className="text-[12px]" style={{ color: NEON.suave }}>montando seu copo…</p>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[11.5px] flex items-center gap-1.5 mr-2" style={{ color: NEON.fraco }}>
          <MousePointer2 size={13} /> Arraste para girar · role para aproximar
        </span>

        <Controle icone={girando ? Pause : Play} onClick={alternarGiro}
          rotulo={girando ? 'Parar o giro' : 'Girar sozinho'} cor={NEON.ciano} />
        <Controle icone={RotateCcw} onClick={enquadrar} rotulo="Reenquadrar" cor={NEON.azul} />
      </footer>
    </div>
  );
}

function Controle({ icone: Icone, rotulo, onClick, cor }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-lg px-3 py-2 text-[12.5px] font-medium flex items-center gap-1.5"
      style={{
        background: corComAlfa(cor, 0.1),
        border: `1px solid ${corComAlfa(cor, 0.45)}`,
        color: cor,
      }}>
      <Icone size={14} /> {rotulo}
    </button>
  );
}
