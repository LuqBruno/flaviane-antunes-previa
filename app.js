// Dra. Flaviane Antunes — prévia conceitual (Bruno Luque). Ideia central: "Inteiro, não em pedaços."
// O retrato começa em recortes desalinhados e, com a rolagem, as partes se encaixam num rosto inteiro.
// O conteúdo funciona sem este arquivo: estados escondidos só existem depois de `motion-ready`.
//
// Motion em 3 camadas
//  ASSINATURA  hero: recortes que "respiram" uma vez ao carregar e respondem ao ponteiro;
//              cena presa "O encaixe": os recortes voltam ao lugar em 4 etapas, com mola.        [mosaic, adaptado]
//  NARRATIVA   o retrato inteiro desliza e ganha moldura (vira a moldura de "A avaliação");
//              a foto editorial abre como uma fenda horizontal; títulos em máscara de linhas.   [shared, split, line-mask]
//  INTERFACE   sublinhado vermelho nos botões e links, pressão com retorno, barra que viaja entre
//              os chips, copiar com troca de rótulo, CTA fixo no celular.                         [underline, press, ix-copy-confirm, ix-sticky-action]

const root = document.documentElement;
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
const wideMQ = matchMedia('(min-width: 900px)');
const reduce = reduceMQ.matches;
if (reduce) root.classList.add('reduce');

// ---- tokens de motion (espelham o CSS) ----
const EASE_OUT = [0.23, 1, 0.32, 1];
const EASE_IN_OUT = [0.77, 0, 0.175, 1];
const DUR = { press: 0.13, ctl: 0.2, panel: 0.32 };
const SPRING_FIT = { k: 150, c: 17 };   // encaixe: leve overshoot, como peça que assenta
const SPRING_UI = { type: 'spring', bounce: 0.18, duration: 0.42 };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const WA = 'https://wa.me/5548998533321';

const M = window.Motion || null;
if (!M) console.warn('Motion indisponível; página segue estática.');
const animated = !!M && !reduce;
const prog = (p) => (typeof p === 'number' ? p : p?.y?.progress ?? 0);

// mola 1D interrompível: preserva a velocidade quando o alvo muda; para em repouso e com a aba oculta
function spring1(apply, { k = SPRING_FIT.k, c = SPRING_FIT.c } = {}) {
  const s = { x: 0, v: 0, t: 0, raf: 0, last: 0 };
  const tick = (now) => {
    const dt = Math.min(0.032, (now - (s.last || now)) / 1000 || 0.016); s.last = now;
    s.v += (-k * (s.x - s.t) - c * s.v) * dt; s.x += s.v * dt;
    if (Math.abs(s.x - s.t) + Math.abs(s.v) > 0.0005 && !document.hidden) { apply(s.x); s.raf = requestAnimationFrame(tick); }
    else { s.x = s.t; s.v = 0; s.raf = 0; s.last = 0; apply(s.x); }
  };
  return {
    to(t) { s.t = t; if (!s.raf) s.raf = requestAnimationFrame(tick); },
    set(x) { cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0; s.x = s.t = x; s.v = 0; apply(x); },
    stop() { cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0; },
    get x() { return s.x; },
  };
}

/* ------------------------------------------------------------------ */
/* Topo, rolagem contínua (só roda do mouse) e âncoras                  */
/* ------------------------------------------------------------------ */
const top = $('[data-top]');
const onScrollTop = () => top.classList.toggle('is-solid', scrollY > 24);
addEventListener('scroll', onScrollTop, { passive: true }); onScrollTop();

let lenis = null;
function startLenis() {
  if (reduce || !window.Lenis || lenis || !fineMQ.matches) return;
  lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.95 });
  const raf = (t) => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
if (window.Lenis) startLenis(); else addEventListener('load', startLenis, { once: true });
reduceMQ.addEventListener('change', () => { if (reduceMQ.matches && lenis) { lenis.destroy(); lenis = null; } });
const goTo = (y, instant) => {
  if (lenis) lenis.scrollTo(y, { duration: instant ? 0 : 1.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else scrollTo({ top: y, behavior: reduce || instant ? 'auto' : 'smooth' });
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const target = id === '#inicio' ? document.body : $(id);
  if (!target) return;
  e.preventDefault();
  const pinnedScene = id === '#encaixe' && root.classList.contains('pinned');
  const y = id === '#inicio' ? 0 : target.getBoundingClientRect().top + scrollY - (pinnedScene ? 0 : top.offsetHeight + 8);
  goTo(y);
  if (id !== '#inicio') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
});

/* ------------------------------------------------------------------ */
/* Recortes: mosaico visível em cada retrato (12 no desktop, 9 no celular) */
/* ------------------------------------------------------------------ */
const visibleTiles = (portrait) => {
  const m = $$('.mosaic', portrait).find((x) => getComputedStyle(x).display !== 'none');
  return m ? { mosaic: m, tiles: $$('.tile', m) } : { mosaic: null, tiles: [] };
};
const setS = (tile, s) => {
  const v = s.toFixed(4);
  if (tile._s === v) return;
  tile._s = v;
  tile.style.setProperty('--s', v);
  tile.classList.toggle('is-set', Math.abs(s) < 0.05);
};
// destaque ao passar o ponteiro (só ponteiro fino; nunca necessário para ler a página)
function hoverable(portrait, enabled = () => true) {
  if (!fineMQ.matches) return;
  portrait.addEventListener('pointerover', (e) => {
    const t = e.target.closest('.tile');
    if (!t || !enabled()) return;
    const m = t.parentElement;
    $$('.tile', m).forEach((x) => x.classList.toggle('is-hot', x === t));
    m.classList.add('is-dim');
  });
  portrait.addEventListener('pointerleave', () => {
    $$('.tile.is-hot', portrait).forEach((x) => x.classList.remove('is-hot'));
    $$('.mosaic', portrait).forEach((m) => m.classList.remove('is-dim'));
  });
}

/* ---- ASSINATURA 1 · hero: os recortes respiram uma vez ---- */
const heroPortrait = $('[data-portrait="hero"]');
if (heroPortrait) {
  hoverable(heroPortrait);
  if (animated) {
    const { tiles } = visibleTiles(heroPortrait);
    tiles.forEach((t, i) => {
      setS(t, 1.42);
      M.animate(1.42, 1, { type: 'spring', stiffness: 90, damping: 10, mass: 1, delay: 0.25 + i * 0.035, onUpdate: (v) => setS(t, v) });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Chips (tablist com teclado) e barra que viaja                        */
/* ------------------------------------------------------------------ */
const chipsBox = $('[data-chips]');
if (chipsBox) {
  const tabs = $$('.chip', chipsBox);
  const panels = tabs.map((t) => $('#' + t.getAttribute('aria-controls')));
  const bar = $('[data-chip-bar]', chipsBox);
  let cur = 0, barAnim = null, panelAnim = null;
  const placeBar = (anim) => {
    if (!bar) return;
    const r = tabs[cur].getBoundingClientRect(), pr = chipsBox.getBoundingClientRect();
    const to = { transform: `translate(${(r.left - pr.left + 18).toFixed(1)}px, ${(r.bottom - pr.bottom).toFixed(1)}px)`, width: `${(r.width - 36).toFixed(1)}px` };
    if (barAnim) barAnim.stop();
    if (anim && animated) barAnim = M.animate(bar, to, SPRING_UI);
    else Object.assign(bar.style, to);
  };
  const select = (i, focus) => {
    if (i !== cur) {
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      panels[cur].hidden = true; panels[i].hidden = false;
      const dir = i > cur ? 1 : -1;
      cur = i;
      if (panelAnim) panelAnim.stop();
      if (animated) panelAnim = M.animate(panels[i], { opacity: [0, 1], transform: [`translateX(${14 * dir}px)`, 'translateX(0px)'] }, { duration: DUR.panel, ease: EASE_OUT });
      placeBar(true);
    }
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  chipsBox.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); select((cur + k + tabs.length) % tabs.length, true); }
    else if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    else if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
  });
  placeBar(false);
  addEventListener('resize', () => placeBar(false));
  document.fonts?.ready.then(() => placeBar(false));
}

/* ------------------------------------------------------------------ */
/* Contato: mensagem pré-preenchida, WhatsApp e copiar                  */
/* ------------------------------------------------------------------ */
const composer = $('[data-composer]');
if (composer) {
  const ta = $('textarea', composer), ok = $('[data-copy-ok]', composer), lab = $('[data-copy-label]', composer);
  let t = 0;
  const say = (m) => { ok.textContent = m; clearTimeout(t); t = setTimeout(() => { ok.textContent = ''; lab.classList.remove('is-done'); }, 2400); };
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = ta.value.trim();
    if (!v) { say('Escreva uma mensagem curta.'); ta.focus(); return; }
    window.open(`${WA}?text=${encodeURIComponent(v)}`, '_blank', 'noopener');
  });
  $('[data-copy]', composer).addEventListener('click', async () => {
    const v = ta.value.trim();
    if (!v) { say('Escreva uma mensagem curta.'); ta.focus(); return; }
    let done = false;
    try { await navigator.clipboard.writeText(v); done = true; }
    catch { ta.select(); try { done = document.execCommand('copy'); } catch { done = false; } }
    if (done) { lab.classList.add('is-done'); say('Mensagem copiada.'); } else say('Selecione o texto e copie.');
  });
}

/* ------------------------------------------------------------------ */
/* CTA fixo no celular: aparece depois do hero, some no contato         */
/* ------------------------------------------------------------------ */
const sticky = $('[data-sticky]');
if (sticky) {
  let pastHero = false, inContact = false;
  const upd = () => sticky.classList.toggle('is-on', pastHero && !inContact);
  new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; upd(); }, { threshold: 0.05 }).observe($('[data-hero]'));
  new IntersectionObserver(([e]) => { inContact = e.isIntersecting; upd(); }, { threshold: 0.1 }).observe($('[data-contato]'));
}

/* ------------------------------------------------------------------ */
/* ASSINATURA 2 · O encaixe                                             */
/* ------------------------------------------------------------------ */
const scene = $('[data-scene]');
const stage = $('[data-stage]');
const scenePortrait = $('[data-portrait="scene"]');
const base = scenePortrait && $('.portrait__base', scenePortrait);
const guides = scenePortrait ? $$('.guides path', scenePortrait) : [];
const frame = scenePortrait && $('.frame', scenePortrait);
const steps = $$('[data-step]');
const stepBtns = $$('[data-goto]');
const wordA = $('.word__a'), wordB = $('.word__b');
const STEP_A = [0, 0.4, 1, 1];          // quanto o retrato está montado em cada etapa
let pinned = false, cancelScroll = null, activeStep = -1, curTiles = [], tailDX = 0;
let view = { pos: 0, tail: 0 };

function setActive(i) {
  if (i === activeStep) return;
  activeStep = i;
  steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  stepBtns.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
}
const aAt = (pos) => { const i = Math.min(2, Math.floor(pos)); return lerp(STEP_A[i], STEP_A[i + 1], pos - i); };

// desenha o retrato para um grau de montagem `a` (0 = recortes; 1 = inteiro). a > 1 ou < 0 = overshoot da mola
function renderTiles(a) {
  const n = curTiles.length, span = 3.2;
  const lin = clamp(a);
  const over = a > 1 ? -(a - 1) * 1.6 : a < 0 ? -a * 1.6 : 0;
  curTiles.forEach((t) => {
    const o = Number(t.style.getPropertyValue('--o')) || 0;
    const local = clamp((lin * (n + span) - o) / span);
    setS(t, 1 - local + over);
  });
  if (base) base.classList.toggle('is-whole', lin > 0.985 && Math.abs(a - 1) < 0.02);
}
const fit = spring1((a) => renderTiles(a));

function renderScene() {
  const { pos, tail } = view;
  // guias de proporção: aparecem ao planejar, somem depois de equilibrar
  const g = clamp((pos - 0.35) / 0.65), gOut = 1 - clamp(pos - 2);
  guides.forEach((p, i) => { p.style.strokeDashoffset = (1 - clamp(g * 1.3 - i * 0.1)).toFixed(3); p.style.opacity = gOut.toFixed(3); });
  // moldura: nasce no acompanhamento e assenta quando o retrato desliza
  const fr = clamp((pos - 2.3) / 0.7);
  if (frame) frame.style.setProperty('--fr', fr.toFixed(3));
  // palavra: "partes" se espalha e cede para "equilíbrio"
  if (wordA) {
    const spread = 1 - clamp(aAt(pos));
    wordA.style.opacity = (1 - clamp((pos - 1.35) / 0.55)).toFixed(3);
    wordA.style.letterSpacing = `${(spread * 0.22).toFixed(3)}em`;
    wordB.style.opacity = (clamp((pos - 1.65) / 0.55) * (1 - tail)).toFixed(3);
  }
  // o retrato inteiro desliza para a coluna da direita: é ali que "A avaliação" o recebe emoldurado
  if (scenePortrait) scenePortrait.style.transform = tail ? `translate3d(${(tail * tailDX).toFixed(1)}px,0,0)` : '';
  setActive(clamp(Math.round(pos), 0, 3));
}

function onSceneScroll(q) {
  const P = 0.8;                                    // fração das etapas; o resto é a saída
  const s = clamp(q / P) * 4, i = Math.min(3, Math.floor(s)), l = s - i;
  // detentes: em cada etapa a cena descansa e só avança no fim da zona
  const pos = i < 3 ? i + smooth(clamp((l - 0.55) / 0.45)) : 3;
  const tail = smooth(clamp((q - P) / (1 - P - 0.03)));
  view = { pos, tail };
  fit.to(aAt(pos));
  renderScene();
}
const measureTail = () => {
  if (!wordA || !scenePortrait) return;
  scenePortrait.style.transform = '';
  // alvo: o centro da moldura de "A avaliação", para que o retrato pareça seguir para a seção seguinte
  const pr = scenePortrait.getBoundingClientRect(), fig = $('[data-frame]');
  const fr = fig && fig.getBoundingClientRect();
  tailDX = fr && fr.width ? Math.max(0, fr.left + fr.width / 2 - (pr.left + pr.width / 2)) : 0;
};

function pinOn() {
  if (pinned) return;
  pinned = true;
  root.classList.add('pinned');
  curTiles = visibleTiles(scenePortrait).tiles;
  measureTail();
  fit.set(0);
  cancelScroll = M.scroll((p) => onSceneScroll(prog(p)), { target: scene, offset: ['start start', 'end end'] });
  onSceneScroll(0);
}
function pinOff() {
  if (!pinned) return;
  pinned = false;
  cancelScroll && cancelScroll(); cancelScroll = null;
  root.classList.remove('pinned');
  if (scenePortrait) scenePortrait.style.transform = '';
  guides.forEach((p) => { p.style.strokeDashoffset = ''; p.style.opacity = ''; });
  if (frame) frame.style.removeProperty('--fr');
}

// modo lista (celular, tela baixa): o retrato se encaixa ao entrar na tela; tocar uma etapa mostra o estado dela
let listArmed = false, stopInView = null;
function listOn() {
  pinOff();
  curTiles = visibleTiles(scenePortrait).tiles;
  $$('.tile', scenePortrait).forEach((t) => { if (!curTiles.includes(t)) setS(t, 0); });
  if (!animated) { setActive(-1); return; }
  if (!listArmed) {
    listArmed = true;
    fit.set(0); setActive(0);
    stopInView = M.inView(stage, () => {
      // as quatro etapas em sequência, com pausa curta em cada uma
      [0, 1, 2, 3].forEach((k) => setTimeout(() => { if (!pinned) { fit.to(STEP_A[k]); setActive(k); } }, 250 + k * 520));
      stopInView && stopInView();
    }, { amount: 0.55 });
  } else fit.set(1);
}

// etapas por botão e por teclado (setas) — em ambos os modos
function goStep(i) {
  i = clamp(i, 0, 3);
  if (pinned) {
    const P = 0.8, q = i < 3 ? ((i + 0.3) / 4) * P : 0.7;
    const r = scene.getBoundingClientRect();
    goTo(r.top + scrollY + q * (scene.offsetHeight - innerHeight));
  } else if (animated) { fit.to(STEP_A[i]); setActive(i); }
  else setActive(i);
}
stepBtns.forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.goto))));
if (stage) {
  stage.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const cur = Math.max(0, activeStep);
    if (k) { e.preventDefault(); goStep(cur + k); }
    else if (e.key === 'Home') { e.preventDefault(); goStep(0); }
    else if (e.key === 'End') { e.preventDefault(); goStep(3); }
  });
}
if (scenePortrait) hoverable(scenePortrait, () => (pinned ? view.pos < 0.5 : activeStep <= 0) && fit.x < 0.2);

const canPin = () => animated && wideMQ.matches && innerHeight >= 660;
function applyMode() {
  if (!scene || !scenePortrait) return;
  if (canPin()) { if (pinned) { curTiles = visibleTiles(scenePortrait).tiles; measureTail(); renderScene(); } else pinOn(); }
  else listOn();
}
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(applyMode, 140); });

/* ------------------------------------------------------------------ */
/* Motion: entradas e narrativa                                         */
/* ------------------------------------------------------------------ */
if (animated) {
  const { animate, scroll, inView, stagger } = M;
  root.classList.add('motion-ready');

  /* ---- hero: texto não espera a cena ---- */
  animate('.hero__title .line > span', { transform: ['translateY(112%)', 'translateY(0%)'] }, { duration: 1, delay: stagger(0.1, { startDelay: 0.05 }), ease: EASE_OUT });
  animate('.hero__lead, .hero__actions, .hero__cap', { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] }, { duration: 0.75, delay: stagger(0.1, { startDelay: 0.4 }), ease: EASE_OUT });

  /* ---- NARRATIVA 1 · a moldura de "A avaliação" assenta ---- */
  const frameFig = $('[data-frame]');
  if (frameFig) {
    const img = $('img', frameFig), line = $('.aval__line', frameFig);
    scroll((p) => {
      const t = smooth(clamp(prog(p)));
      img.style.clipPath = `inset(${((1 - t) * 7).toFixed(2)}% round 0)`;
      line.style.transform = `scaleY(${t.toFixed(3)})`;
    }, { target: frameFig, offset: ['start end', 'center 0.55'] });
  }

  /* ---- NARRATIVA 2 · a foto editorial abre como uma fenda ---- */
  const editFig = $('[data-edit-fig]');
  if (editFig) {
    const img = $('img', editFig), red = $('.edit__red');
    scroll((p) => {
      const t = smooth(clamp(prog(p)));
      const cy = ((1 - t) * 36).toFixed(2);
      img.style.clipPath = `inset(${cy}% 0 ${cy}% 0)`;
      img.style.transform = `scale(${(1.12 - 0.12 * t).toFixed(4)})`;
      red.style.transform = `scaleY(${t.toFixed(3)})`;
    }, { target: editFig, offset: ['start end', 'center 0.6'] });
    red.style.transformOrigin = 'top';
  }

  /* ---- títulos: máscara de linhas ---- */
  $$('[data-mask]').forEach((h) => {
    const spans = $$('.line > span', h);
    inView(h, () => { animate(spans, { transform: ['translateY(112%)', 'translateY(0%)'] }, { duration: 0.95, delay: stagger(0.09), ease: EASE_OUT }); }, { amount: 0.4 });
  });
}

applyMode();
addEventListener('load', () => { if (pinned) { measureTail(); renderScene(); } });
