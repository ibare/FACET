/**
 * pattern-to-instruction 의 그림.
 *
 * 동사 "덮어 삼킨다" — 고르는 걸음에는 무늬가 왼쪽 목록의 제 자리에서 떠올라 나무 위 마디로 내려앉고,
 * 삼킨 마디들을 한 덩이로 감싼다. 덮이지 않은 아래 가지는 점선으로 남는다.
 * 내는 걸음에는 덮인 조각의 뿌리 마디에서 명령 한 줄이 떨어져 아래 명령 열의 제 칸에 앉는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate } from '@ffacet/core/runtime';
import { instrText, nodeText, patternText, tileSize } from './algorithm.js';
import type { PatternToInstructionScene } from './scene.js';

const H = 500;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
/** 고정폭 글자 한 칸의 폭 (글자 크기에 대한 비). */
const MONO_RATIO = 0.6;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

type Attrs = Record<string, string | number>;

function el(tag: string, attrs: Attrs, parent: Element, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 대략의 글자 폭 — 한글 · 한자 폭 글자는 한 칸, 나머지는 반 칸 남짓. */
function approxWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c >= 0x1100 && c !== 0x2014 ? px : px * 0.56;
  }
  return w;
}

/**
 * 캡션을 줄로 나눈다. 먼저 문장 · 구획(': ' · '. ' · ' · ') 경계에서 끊고, 그래도 넘치는 토막만 낱말에서 끊는다 —
 * 명령 글자(`load t2, [t1+16]`)가 두 줄로 갈리지 않게.
 */
function wrap(s: string, px: number, maxW: number): string[] {
  const chunks = s.split(/(?<=: |\. |。|: )|(?= · )/u);
  const lines: string[] = [];
  let cur = '';
  for (const chunk of chunks) {
    const next = cur + chunk;
    if (cur !== '' && approxWidth(next, px) > maxW) {
      lines.push(cur.trimEnd());
      cur = chunk.replace(/^ · /u, '');
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur.trimEnd());
  return lines.flatMap((line) => (approxWidth(line, px) > maxW ? wrapWords(line, px, maxW) : [line]));
}

function wrapWords(s: string, px: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : `${cur} ${w}`;
    if (cur !== '' && approxWidth(next, px) > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Pt = { x: number; y: number };

type Geometry = {
  shelfX: number;
  shelfW: number;
  treeX: number;
  treeW: number;
  shelfRowY: number[];
  shelfRowH: number;
  nodeC: Pt[];
  nodeW: number[];
  codeY: number[];
};

const NODE_H = 22;

function geometry(scene: PatternToInstructionScene): Geometry {
  const W = PIECE_CANVAS_W;
  const shelfX = 8;
  const shelfW = Math.round(W * 0.3);
  const treeX = shelfX + shelfW + 16;
  const treeW = W - 8 - treeX;

  const shelfTop = 78;
  const shelfBottom = 330;
  const n = scene.order.length;
  const shelfRowH = n > 0 ? Math.min(30, (shelfBottom - shelfTop) / n) : 30;
  const shelfRowY = scene.order.map((_, i) => shelfTop + i * shelfRowH);

  // 나무 — 잎은 왼쪽부터 칸 하나씩, 속 마디는 첫 · 끝 아래 마디의 가운데.
  const leafCount = scene.nodes.filter((nd) => nd.kids.length === 0).length;
  const slotW = leafCount > 0 ? treeW / leafCount : treeW;
  const xs: number[] = scene.nodes.map(() => 0);
  let slot = 0;
  const place = (id: number): number => {
    const nd = scene.nodes[id];
    if (nd === undefined) throw new Error(`그림: 없는 마디 ${id}`);
    if (nd.kids.length === 0) {
      xs[id] = treeX + slotW * (slot + 0.5);
      slot += 1;
      return xs[id]!;
    }
    const kx = nd.kids.map(place);
    xs[id] = (kx[0]! + kx[kx.length - 1]!) / 2;
    return xs[id]!;
  };
  if (scene.nodes.length > 0) place(0);
  const maxDepth = scene.nodes.reduce((m, nd) => Math.max(m, nd.depth), 0);
  const treeTop = 94;
  const treeBottom = 300;
  const levelH = maxDepth > 0 ? Math.min(52, (treeBottom - treeTop) / maxDepth) : 0;
  const nodeC = scene.nodes.map((nd) => ({ x: xs[nd.id]!, y: treeTop + nd.depth * levelH }));
  const nodeW = scene.nodes.map((nd) => nodeText(nd).length * XS * MONO_RATIO + 14);

  const codeTop = 362;
  const rows = Math.max(1, scene.picks.length, scene.emits.length);
  const codeRowH = Math.min(22, (H - 12 - codeTop) / rows);
  const codeY = scene.emits.map((_, i) => codeTop + i * codeRowH);

  return { shelfX, shelfW, treeX, treeW, shelfRowY, shelfRowH, nodeC, nodeW, codeY };
}

type Handles = { blob: SVGElement | null; row: SVGElement | null };

function drawStatic(
  canvas: SVGSVGElement,
  scene: PatternToInstructionScene,
  c: Palette,
  t: Translate,
): { g: Geometry; handles: Handles } {
  canvas.textContent = '';
  const g = geometry(scene);
  const W = PIECE_CANVAS_W;
  const tileColors = categorical(scene.tiles.length, 'vivid');
  const colorOf = (tile: number): string => {
    const col = tileColors[tile];
    if (col === undefined) throw new Error(`그림: 무늬 ${tile} 의 색이 없다`);
    return col;
  };
  const step = scene.step;
  const curPick = step.kind === 'pick' ? step.pick : step.kind === 'emit' ? scene.emits[step.emit]!.pick : -1;
  const handles: Handles = { blob: null, row: null };

  // ── 캡션 ──
  let captionKey = 'caption.start';
  let vars: Record<string, string | number> = {};
  if (step.kind === 'pick') {
    const pk = scene.picks[step.pick]!;
    const nd = scene.nodes[pk.at]!;
    vars = { node: nodeText(nd), tile: scene.tiles[pk.tile]!.name, size: pk.covered.length, missed: pk.missed.length };
    if (pk.missed.length === 0) {
      captionKey = 'caption.pickFirst';
    } else {
      captionKey = 'caption.pick';
    }
  } else if (step.kind === 'emit') {
    const em = scene.emits[step.emit]!;
    const pk = scene.picks[em.pick]!;
    vars = { tile: scene.tiles[pk.tile]!.name, ins: instrText(em.instr) };
    const coveredAll = scene.picks.reduce((s, p) => s + p.covered.length, 0);
    if (em.pick === 0 && scene.emits.length === scene.picks.length && coveredAll === scene.nodes.length) {
      captionKey = 'caption.done';
      vars = { ...vars, nodes: scene.nodes.length, n: scene.emits.length };
    } else if (pk.holes.length === 0) {
      captionKey = 'caption.emitLeaf';
    } else {
      captionKey = 'caption.emit';
    }
  }
  let caption: string;
  if (captionKey === 'caption.done') {
    caption = t('caption.done', 'The root tile {tile} comes out last: {ins}. Nodes: {nodes} · Instructions: {n}', vars);
  } else if (captionKey === 'caption.emitLeaf') {
    caption = t('caption.emitLeaf', 'The {tile} tile has nothing left below it and emits at once: {ins}', vars);
  } else if (captionKey === 'caption.emit') {
    caption = t('caption.emit', 'Everything below is out, so the {tile} tile now emits its line: {ins}', vars);
  } else if (captionKey === 'caption.pick') {
    caption = t('caption.pick', 'At {node}, the largest tile that fits is {tile}. Nodes swallowed: {size} · Tried first and missed: {missed}', vars);
  } else if (captionKey === 'caption.pickFirst') {
    caption = t('caption.pickFirst', 'At {node}, the first tile tried already fits: {tile}. Nodes swallowed: {size}', vars);
  } else {
    caption = t('caption.start', 'Start at the root. At each node, try the largest tile first and take the first one that fits.');
  }
  let capPx = MD;
  let lines = wrap(caption, capPx, W - 16);
  if (lines.length > 2) {
    capPx = SM;
    lines = wrap(caption, capPx, W - 16);
  }
  lines.forEach((line, i) => {
    el('text', { x: 8, y: 20 + i * (capPx + 6), fill: c.text, 'font-family': fonts.body, 'font-size': capPx }, canvas, line);
  });

  // ── 머리 ──
  const headY = 64;
  el('text', { x: g.shelfX, y: headY, fill: c.textMuted, 'font-family': fonts.body, 'font-size': SM }, canvas,
    t('label.tiles', 'Tiles, largest first'));
  el('text', { x: g.shelfX + g.shelfW, y: headY, fill: c.textMuted, 'font-family': fonts.body, 'font-size': XS, 'text-anchor': 'end' }, canvas,
    t('label.size', 'size'));
  el('text', { x: g.treeX, y: headY, fill: c.textMuted, 'font-family': fonts.body, 'font-size': SM }, canvas,
    t('label.tree', 'IR tree'));
  el('text', { x: g.treeX + g.treeW, y: headY, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': XS, 'text-anchor': 'end' }, canvas,
    scene.source);
  el('line', { x1: g.shelfX, y1: headY + 6, x2: W - 8, y2: headY + 6, stroke: c.border, 'stroke-width': 1 }, canvas);

  // ── 무늬 목록 (대 보는 차례) ──
  const used = new Set(scene.picks.map((p) => p.tile));
  const cur = step.kind === 'pick' ? scene.picks[step.pick]! : null;
  const missedNow = new Set(cur?.missed ?? []);
  const shelf = el('g', {}, canvas);
  scene.order.forEach((ti, i) => {
    const tile = scene.tiles[ti]!;
    const y = g.shelfRowY[i]!;
    const chosen = cur !== null && cur.tile === ti;
    const missed = missedNow.has(ti);
    if (chosen) {
      el('rect', { x: g.shelfX - 4, y: y - 3, width: g.shelfW + 8, height: g.shelfRowH - 2, rx: 4, fill: c.accent, 'fill-opacity': 0.35 }, shelf);
    }
    const col = colorOf(ti);
    el('rect', {
      x: g.shelfX + 1, y: y + 2, width: 10, height: 10, rx: 2,
      fill: used.has(ti) ? col : c.bg, stroke: col, 'stroke-width': 1.5,
    }, shelf);
    const ink = missed ? c.textMuted : c.text;
    el('text', { x: g.shelfX + 18, y: y + 11, fill: ink, 'font-family': fonts.mono, 'font-size': SM, 'font-weight': chosen ? 700 : 400 }, shelf, tile.name);
    el('text', { x: g.shelfX + g.shelfW, y: y + 11, fill: ink, 'font-family': fonts.mono, 'font-size': SM, 'text-anchor': 'end' }, shelf,
      String(tileSize(tile.pattern)));
    const pat = patternText(tile.pattern);
    el('text', { x: g.shelfX + 18, y: y + 24, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': XS }, shelf, pat);
    if (missed) {
      const w = tile.name.length * SM * MONO_RATIO;
      el('line', { x1: g.shelfX + 16, y1: y + 7, x2: g.shelfX + 20 + w, y2: y + 7, stroke: c.danger, 'stroke-width': 1.5 }, shelf);
    }
  });

  // ── 자취 셈 ──
  const tally = [
    t('label.covered', 'Nodes covered: {covered} of {total}', {
      covered: scene.picks.reduce((s, p) => s + p.covered.length, 0),
      total: scene.nodes.length,
    }),
    t('label.tileCount', 'Tiles placed: {n}', { n: scene.picks.length }),
    t('label.instrCount', 'Instructions out: {n}', { n: scene.emits.length }),
  ];
  tally.forEach((line, i) => {
    el('text', { x: g.shelfX, y: 372 + i * 20, fill: c.text, 'font-family': fonts.body, 'font-size': SM }, canvas, line);
  });

  // ── 나무: 가지 ──
  const edges = el('g', {}, canvas);
  for (const nd of scene.nodes) {
    for (const k of nd.kids) {
      const a = g.nodeC[nd.id]!;
      const b = g.nodeC[k]!;
      el('line', { x1: a.x, y1: a.y + NODE_H / 2, x2: b.x, y2: b.y - NODE_H / 2, stroke: c.border, 'stroke-width': 1.5 }, edges);
    }
  }

  // ── 나무: 내려앉은 무늬 덩이 ──
  scene.picks.forEach((pk, pi) => {
    const col = colorOf(pk.tile);
    const inSet = new Set(pk.covered);
    const blob = el('g', { opacity: pi === curPick ? 0.6 : 0.3 }, canvas);
    for (const id of pk.covered) {
      const nd = scene.nodes[id]!;
      if (nd.parent !== null && inSet.has(nd.parent)) {
        const a = g.nodeC[nd.parent]!;
        const b = g.nodeC[id]!;
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: col, 'stroke-width': NODE_H, 'stroke-linecap': 'round' }, blob);
      }
      const p = g.nodeC[id]!;
      const w = g.nodeW[id]!;
      el('rect', { x: p.x - w / 2 - 6, y: p.y - NODE_H / 2 - 6, width: w + 12, height: NODE_H + 12, rx: 10, fill: col }, blob);
    }
    if (step.kind === 'pick' && pi === step.pick) handles.blob = blob;
  });

  // ── 나무: 아직 덮지 않은 가지 (점선) ──
  const landed = new Set(scene.picks.map((p) => p.at));
  for (const pk of scene.picks) {
    for (const h of pk.holes) {
      if (landed.has(h)) continue; // 이미 덮인 가지는 점선을 두지 않는다
      const p = g.nodeC[h]!;
      const w = g.nodeW[h]!;
      el('rect', {
        x: p.x - w / 2 - 5, y: p.y - NODE_H / 2 - 5, width: w + 10, height: NODE_H + 10, rx: 8,
        fill: 'none', stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '4 3',
      }, canvas);
    }
  }

  // ── 나무: 마디 ──
  const curAt = cur !== null ? cur.at : -1;
  for (const nd of scene.nodes) {
    const p = g.nodeC[nd.id]!;
    const w = g.nodeW[nd.id]!;
    el('rect', {
      x: p.x - w / 2, y: p.y - NODE_H / 2, width: w, height: NODE_H, rx: 4,
      fill: c.bg, stroke: nd.id === curAt ? c.text : c.border, 'stroke-width': nd.id === curAt ? 2 : 1,
    }, canvas);
    el('text', {
      x: p.x, y: p.y + XS * 0.36, fill: c.text, 'font-family': fonts.mono, 'font-size': XS, 'text-anchor': 'middle',
    }, canvas, nodeText(nd));
  }

  // ── 나무: 조각이 낸 값의 이름 ──
  for (const em of scene.emits) {
    if (em.instr.dst === null) continue; // store 는 값을 만들지 않는다
    const pk = scene.picks[em.pick]!;
    const p = g.nodeC[pk.at]!;
    const w = g.nodeW[pk.at]!;
    const tw = em.instr.dst.length * XS * MONO_RATIO + 8;
    const x = p.x + w / 2 - 6;
    const y = p.y - NODE_H / 2 - 9;
    el('rect', { x, y, width: tw, height: 14, rx: 7, fill: c.bg, stroke: colorOf(pk.tile), 'stroke-width': 1.5 }, canvas);
    el('text', { x: x + tw / 2, y: y + 10.5, fill: c.text, 'font-family': fonts.mono, 'font-size': XS, 'text-anchor': 'middle' }, canvas,
      em.instr.dst);
  }

  // ── 명령 열 ──
  el('text', { x: g.treeX, y: 340, fill: c.textMuted, 'font-family': fonts.body, 'font-size': SM }, canvas,
    t('label.code', 'Instructions'));
  el('line', { x1: g.treeX, y1: 346, x2: W - 8, y2: 346, stroke: c.border, 'stroke-width': 1 }, canvas);
  const curEmit = step.kind === 'emit' ? step.emit : -1;
  scene.emits.forEach((em, i) => {
    const y = g.codeY[i]!;
    const pk = scene.picks[em.pick]!;
    el('text', { x: g.treeX, y: y + 12, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': XS }, canvas, `L${i + 1}`);
    const row = el('g', {}, canvas);
    const text = instrText(em.instr);
    const tx = g.treeX + 40;
    if (i === curEmit) {
      el('rect', {
        x: tx - 6, y: y - 2, width: text.length * SM * MONO_RATIO + 24, height: 18, rx: 4, fill: c.accent, 'fill-opacity': 0.35,
      }, row);
    }
    el('rect', { x: tx - 2, y: y + 3, width: 8, height: 8, rx: 2, fill: colorOf(pk.tile) }, row);
    el('text', { x: tx + 12, y: y + 12, fill: c.text, 'font-family': fonts.mono, 'font-size': SM, 'font-weight': i === curEmit ? 700 : 400 },
      row, text);
    if (i === curEmit) handles.row = row;
  });

  return { g, handles };
}

export const patternToInstructionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const canvas = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const cancels = new Set<() => void>();
    const waiters = new Set<() => void>();

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let finished = false;
        let handle: ReturnType<typeof setTimeout> | number | null = null;
        const useRaf = typeof requestAnimationFrame === 'function';
        const cancel = (): void => {
          if (handle === null) return;
          if (useRaf) cancelAnimationFrame(handle as number);
          else clearTimeout(handle as ReturnType<typeof setTimeout>);
          handle = null;
        };
        const finish = (): void => {
          if (finished) return;
          finished = true;
          cancel();
          cancels.delete(cancel);
          waiters.delete(finish);
          resolve();
        };
        cancels.add(cancel);
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          handle = null;
          if (destroyed) return finish();
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          handle = useRaf ? requestAnimationFrame(tick) : setTimeout(tick, 16);
        };
        handle = useRaf ? requestAnimationFrame(tick) : setTimeout(tick, 16);
      });
    }

    async function render(
      next: PatternToInstructionScene,
      prev: PatternToInstructionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const { g, handles } = drawStatic(canvas, next, c, t);
      if (!opts.animate || prev === null) return;
      const step = next.step;

      if (step.kind === 'pick' && next.picks.length === prev.picks.length + 1 && handles.blob !== null) {
        // 무늬가 목록의 제 줄에서 떠올라 마디 위로 내려앉는다.
        const pk = next.picks[step.pick]!;
        const row = next.order.indexOf(pk.tile);
        const rowY = row < 0 ? undefined : g.shelfRowY[row];
        if (rowY === undefined) throw new Error(`그림: 무늬 ${pk.tile} 가 목록에 없다`);
        const from: Pt = { x: g.shelfX + 6, y: rowY + 7 };
        const to = g.nodeC[pk.at]!;
        const blob = handles.blob;
        const frame = (p: number): void => {
          const e = ease(p);
          const lift = Math.sin(Math.PI * p) * 36;
          const s = 0.55 + 0.45 * e;
          const x = (from.x - to.x) * (1 - e);
          const y = (from.y - to.y) * (1 - e) - lift;
          blob.setAttribute(
            'transform',
            `translate(${r2(to.x + x)} ${r2(to.y + y)}) scale(${r2(s)}) translate(${r2(-to.x)} ${r2(-to.y)})`,
          );
        };
        frame(0);
        await tween(MOVE_MS, frame);
      } else if (step.kind === 'emit' && next.emits.length === prev.emits.length + 1 && handles.row !== null) {
        // 명령 한 줄이 조각의 뿌리 마디에서 떨어져 명령 열의 제 칸에 앉는다.
        const em = next.emits[step.emit]!;
        const at = g.nodeC[next.picks[em.pick]!.at]!;
        const codeY = g.codeY[step.emit];
        if (codeY === undefined) throw new Error(`그림: 명령 ${step.emit} 의 칸이 없다`);
        const dest: Pt = { x: g.treeX + 40, y: codeY + 8 };
        const row = handles.row;
        const frame = (p: number): void => {
          const e = ease(p);
          const dx = (at.x - 20 - dest.x) * (1 - e);
          const dy = (at.y - dest.y) * (1 - e);
          row.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
        };
        frame(0);
        await tween(MOVE_MS, frame);
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(canvas, next, c, t);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const cancel of [...cancels]) cancel();
        cancels.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
