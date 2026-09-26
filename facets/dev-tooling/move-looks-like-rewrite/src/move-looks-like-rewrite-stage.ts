import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { MoveLooksLikeRewriteScene, SceneMove, ScenePair } from './scene.js';

/**
 * 같은 두 파일을 두 눈으로 본다.
 *
 * 위: 두 파일을 왼쪽(옮기기 전) · 오른쪽(옮긴 뒤)에 세우고, 그 틈에 두 눈이 긋는 것을 둔다.
 *   사람의 눈은 덩이 하나가 건너가며 남긴 띠 하나, 줄의 눈은 줄마다 잇는 선.
 * 아래: 두 눈이 센 손질을 담는 칸 둘. 사람의 칸에는 덩이 하나, 줄의 칸에는 따로 떨어진 줄 넷.
 */

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Box = { x: number; y: number; w: number; h: number };

type Geometry = {
  w: number;
  pad: number;
  colW: number;
  ax0: number;
  ax1: number;
  bx0: number;
  bx1: number;
  headerY: number;
  rowTop: number;
  rowH: number;
  boxH: number;
  human: Box;
  line: Box;
  chipH: number;
  charW: number;
};

function geometry(rows: number): Geometry {
  const w = PIECE_CANVAS_W;
  const pad = 16;
  const colW = Math.min(210, Math.round(w * 0.3));
  const headerY = 64;
  const rowTop = 74;
  const panelTop = 218;
  const rowH = Math.min(26, (panelTop - 12 - rowTop) / Math.max(1, rows));
  const gap = 12;
  const humanW = Math.round((w - 2 * pad - gap) * 0.36);
  const panelH = H - panelTop - 8;
  const charW = parseFloat(fontSizes.sm) * 0.6;
  return {
    w,
    pad,
    colW,
    ax0: pad,
    ax1: pad + colW,
    bx0: w - pad - colW,
    bx1: w - pad,
    headerY,
    rowTop,
    rowH,
    boxH: rowH - 4,
    human: { x: pad, y: panelTop, w: humanW, h: panelH },
    line: { x: pad + humanW + gap, y: panelTop, w: w - 2 * pad - humanW - gap, h: panelH },
    chipH: 22,
    charW,
  };
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  style: { size: string; fill: string; mono?: boolean; weight?: number; anchor?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill: style.fill,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    'text-anchor': style.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (style.weight !== undefined) node.setAttribute('font-weight', String(style.weight));
  if (style.mono === true) node.setAttribute('style', 'white-space: pre');
  node.textContent = content;
  return node;
}

/** 글자 폭 짐작 — 넓은 글자(한글 · 가나 · 한자 등)는 한 글자 크기, 나머지는 반 남짓. */
function roughWidth(s: string, px: number): number {
  let wsum = 0;
  for (const ch of s) wsum += ch.charCodeAt(0) >= 0x2e80 ? px : px * 0.56;
  return wsum;
}

/** 캡션이 폭을 넘으면 가운데 가까운 빈칸에서 두 줄로 나눈다. */
function splitCaption(s: string, px: number, maxW: number): string[] {
  if (roughWidth(s, px) <= maxW) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (let k = 0; k < s.length; k += 1) {
    if (s[k] === ' ' && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
  }
  // 문장 끝(. ? !) 뒤의 빈칸이 두 줄 모두 폭 안에 들면 그 자리를 먼저 쓴다
  let sentence = -1;
  for (let k = 1; k < s.length; k += 1) {
    if (s[k] !== ' ' || !'.?!。？！'.includes(s[k - 1]!)) continue;
    if (roughWidth(s.slice(0, k), px) > maxW || roughWidth(s.slice(k + 1), px) > maxW) continue;
    if (sentence < 0 || Math.abs(k - mid) < Math.abs(sentence - mid)) sentence = k;
  }
  if (sentence >= 0) best = sentence;
  if (best < 0) return [s];
  return [s.slice(0, best), s.slice(best + 1)];
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 선분 P0→P1 과 Q0→Q1 이 만나는 자리 (P 쪽 비율 t). 만나지 않으면 던진다. */
function crossAt(
  p0: [number, number],
  p1: [number, number],
  q0: [number, number],
  q1: [number, number],
): { t: number; x: number; y: number } {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const ex = q1[0] - q0[0];
  const ey = q1[1] - q0[1];
  const den = dx * ey - dy * ex;
  if (den === 0) throw new Error('crossAt: 나란한 두 선은 엇갈리지 않는다');
  const t = ((q0[0] - p0[0]) * ey - (q0[1] - p0[1]) * ex) / den;
  const s = ((q0[0] - p0[0]) * dy - (q0[1] - p0[1]) * dx) / den;
  if (t < 0 || t > 1 || s < 0 || s > 1) throw new Error('crossAt: 엇갈린다던 두 선이 틈 안에서 만나지 않는다');
  return { t, x: p0[0] + dx * t, y: p0[1] + dy * t };
}

/** 이 조각은 옮김 하나만 그린다. 아직 없으면 null, 하나가 아니면 던진다. */
function onlyMove(s: MoveLooksLikeRewriteScene): SceneMove | null {
  if (s.moves === null) return null;
  const m = s.moves[0];
  if (s.moves.length !== 1 || m === undefined) {
    throw new Error(`stage: 옮김이 ${s.moves.length} 개다 — 이 조각은 한 번 옮긴 것만 그린다`);
  }
  return m;
}

/** 이 걸음에 있어야 할 자취가 없으면 던진다. */
function need<T>(v: T | null, what: string): T {
  if (v === null) throw new Error(`stage: ${what} 걸음에 자취가 없다`);
  return v;
}

type Handles = {
  ribbon: SVGPolygonElement | null;
  keepLines: { ln: SVGLineElement; x1: number; y1: number; x2: number; y2: number }[];
  tries: { a: SVGLineElement; b: SVGLineElement; marks: SVGGElement; p0: [number, number]; p1: [number, number]; tMin: number; tMax: number; gap: number }[];
  delChips: { g: SVGGElement; dx: number; dy: number }[];
  insChips: { g: SVGGElement; dx: number; dy: number }[];
  units: SVGRectElement[];
  motion: SVGGElement | null;
};

export const moveLooksLikeRewriteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const [delC, insC] = categorical(2, 'vivid');
    const keepC = c.primary;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function rowY(g: Geometry, k: number): number {
      return g.rowTop + k * g.rowH;
    }
    function rowMid(g: Geometry, k: number): number {
      return rowY(g, k) + g.boxH / 2;
    }

    function drawChip(parent: Element, g: Geometry, x: number, y: number, w: number, mark: string, text: string, stroke: string): SVGGElement {
      const grp = el(parent, 'g', {});
      el(grp, 'rect', { x, y, width: w, height: g.chipH, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 });
      label(grp, x + 9, y + g.chipH / 2, mark, { size: fontSizes.sm, fill: stroke, mono: true, weight: 700 });
      label(grp, x + 22, y + g.chipH / 2, text, { size: fontSizes.sm, fill: c.text, mono: true });
      return grp;
    }

    function drawStatic(s: MoveLooksLikeRewriteScene): Handles {
      svg.textContent = '';
      const g = geometry(Math.max(s.a.length, s.b.length));
      const move = onlyMove(s);
      const kept: readonly ScenePair[] = s.pairs === null ? [] : s.pairs; // 아직 남김 걸음 전
      const keptA = new Set(kept.map((p) => p[0]));
      const keptB = new Set(kept.map((p) => p[1]));
      const delA = new Set(s.deleted === null ? [] : s.deleted);
      const insB = new Set(s.inserted === null ? [] : s.inserted);
      const handles: Handles = {
        ribbon: null,
        keepLines: [],
        tries: [],
        delChips: [],
        insChips: [],
        units: [],
        motion: null,
      };

      // 캡션 — 지금 일어나는 일만
      const cap = captionOf(s);
      const lines = splitCaption(cap, parseFloat(fontSizes.md), g.w - 2 * g.pad);
      lines.forEach((ln, k) => {
        label(svg, g.pad, 20 + k * 20, ln, { size: fontSizes.md, fill: c.text });
      });

      // 파일 머리
      label(svg, g.ax0, g.headerY, t('label.a', 'Before the move'), { size: fontSizes.sm, fill: c.textMuted, weight: 600 });
      label(svg, g.bx0, g.headerY, t('label.b', 'After the move'), { size: fontSizes.sm, fill: c.textMuted, weight: 600 });

      // 사람의 눈 — 덩이가 건너간 띠 (선 아래에 깐다)
      const back = el(svg, 'g', {});
      if (move !== null) {
        const aTop = rowY(g, move.from) - 2;
        const aBot = rowY(g, move.from + move.count - 1) + g.boxH + 2;
        const bTop = rowY(g, move.to) - 2;
        const bBot = rowY(g, move.to + move.count - 1) + g.boxH + 2;
        handles.ribbon = el(back, 'polygon', {
          points: `${r2(g.ax1)},${r2(aTop)} ${r2(g.bx0)},${r2(bTop)} ${r2(g.bx0)},${r2(bBot)} ${r2(g.ax1)},${r2(aBot)}`,
          fill: c.accent,
          'fill-opacity': s.step === 'move' ? 0.4 : 0.16,
        });
      }

      // 두 파일의 줄
      const drawFile = (lines2: readonly string[], x0: number, side: 'a' | 'b') => {
        lines2.forEach((text, k) => {
          const y = rowY(g, k);
          let stroke = c.border;
          let mark = '';
          if (side === 'a' && keptA.has(k)) { stroke = keepC; mark = s.marks.keep; }
          if (side === 'b' && keptB.has(k)) { stroke = keepC; mark = s.marks.keep; }
          if (side === 'a' && delA.has(k)) { stroke = delC!; mark = s.marks.del; }
          if (side === 'b' && insB.has(k)) { stroke = insC!; mark = s.marks.ins; }
          const fallen = (side === 'a' && delA.has(k)) || (side === 'b' && insB.has(k));
          el(svg, 'rect', {
            x: x0, y, width: g.colW, height: g.boxH, rx: 4,
            fill: fallen ? c.bgSubtle : c.bg, stroke, 'stroke-width': stroke === c.border ? 1 : 1.8,
          });
          label(svg, x0 + 10, y + g.boxH / 2, String(k + 1), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
          if (mark !== '') label(svg, x0 + 24, y + g.boxH / 2, mark, { size: fontSizes.sm, fill: stroke, mono: true, weight: 700 });
          label(svg, x0 + 36, y + g.boxH / 2, text, { size: fontSizes.sm, fill: fallen ? c.textMuted : c.text, mono: true });
        });
      };
      drawFile(s.a, g.ax0, 'a');
      drawFile(s.b, g.bx0, 'b');

      // 덩이 테두리 — 두 파일 모두에서 옮긴 두 줄을 한 덩이로 묶는다
      if (move !== null) {
        for (const [x0, k0] of [[g.ax0, move.from], [g.bx0, move.to]] as const) {
          el(svg, 'rect', {
            x: x0 - 3, y: rowY(g, k0) - 3, width: g.colW + 6,
            height: rowY(g, k0 + move.count - 1) + g.boxH - rowY(g, k0) + 6,
            rx: 6, fill: 'none', stroke: c.accent, 'stroke-width': 2.2,
          });
        }
      }

      // 줄의 눈 — 남긴 짝
      const xa = g.ax1 + 4;
      const xb = g.bx0 - 4;
      for (const [i, j] of kept) {
        const ln = el(svg, 'line', {
          x1: xa, y1: rowMid(g, i), x2: xb, y2: rowMid(g, j),
          stroke: keepC, 'stroke-width': 2, 'stroke-linecap': 'round',
        });
        handles.keepLines.push({ ln, x1: xa, y1: rowMid(g, i), x2: xb, y2: rowMid(g, j) });
      }

      // 줄의 눈 — 이으려다 끊긴 짝
      for (const tr0 of s.tries === null ? [] : s.tries) {
        const p0: [number, number] = [xa, rowMid(g, tr0.a)];
        const p1: [number, number] = [xb, rowMid(g, tr0.b)];
        const hits = tr0.crosses.map(([pi, pj]) => crossAt(p0, p1, [xa, rowMid(g, pi)], [xb, rowMid(g, pj)]));
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const gap = 9 / len;
        const tMin = Math.min(...hits.map((h) => h.t));
        const tMax = Math.max(...hits.map((h) => h.t));
        el(svg, 'line', {
          x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1],
          stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 4', 'stroke-opacity': 0.7,
        });
        const at = (tt: number): [number, number] => [lerp(p0[0], p1[0], tt), lerp(p0[1], p1[1], tt)];
        const aEnd = at(tMin - gap);
        const bStart = at(tMax + gap);
        const la = el(svg, 'line', { x1: p0[0], y1: p0[1], x2: aEnd[0], y2: aEnd[1], stroke: c.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' });
        const lb = el(svg, 'line', { x1: bStart[0], y1: bStart[1], x2: p1[0], y2: p1[1], stroke: c.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' });
        const marks = el(svg, 'g', {});
        for (const h of hits) {
          el(marks, 'path', {
            d: `M${r2(h.x - 4)},${r2(h.y - 4)} L${r2(h.x + 4)},${r2(h.y + 4)} M${r2(h.x - 4)},${r2(h.y + 4)} L${r2(h.x + 4)},${r2(h.y - 4)}`,
            stroke: c.danger, 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none',
          });
        }
        handles.tries.push({ a: la, b: lb, marks, p0, p1, tMin, tMax, gap });
      }

      // 아래 칸 — 사람의 눈
      const hb = g.human;
      el(svg, 'rect', { x: hb.x, y: hb.y, width: hb.w, height: hb.h, rx: 6, fill: 'none', stroke: c.border });
      label(svg, hb.x + 10, hb.y + 15, t('label.human', 'Human eye'), { size: fontSizes.sm, fill: c.textMuted, weight: 600 });
      const chipTop = hb.y + 28;
      if (move !== null) {
        label(svg, hb.x + hb.w - 10, hb.y + 15, t('count.moves', 'Moves: {n}', { n: need(s.moves, 'move').length }), {
          size: fontSizes.sm, fill: c.text, anchor: 'end', weight: 600,
        });
        const bw = hb.w - 20;
        el(svg, 'rect', {
          x: hb.x + 10 - 3, y: chipTop - 3, width: bw + 6, height: 2 * g.chipH + 4 + 6,
          rx: 6, fill: 'none', stroke: c.accent, 'stroke-width': 2.2,
        });
        for (let k = 0; k < move.count; k += 1) {
          const text = s.a[move.from + k];
          if (text === undefined) throw new Error(`stage: 옮긴 덩이의 줄 A${move.from + k + 1} 이 없다`);
          const y = chipTop + k * (g.chipH + 4);
          el(svg, 'rect', { x: hb.x + 10, y, width: bw, height: g.chipH, rx: 3, fill: c.bg, stroke: c.border });
          label(svg, hb.x + 22, y + g.chipH / 2, text, { size: fontSizes.sm, fill: c.text, mono: true });
        }
      }

      // 아래 칸 — 줄의 눈
      const lb0 = g.line;
      el(svg, 'rect', { x: lb0.x, y: lb0.y, width: lb0.w, height: lb0.h, rx: 6, fill: 'none', stroke: c.border });
      label(svg, lb0.x + 10, lb0.y + 15, t('label.line', 'Line eye'), { size: fontSizes.sm, fill: c.textMuted, weight: 600 });
      const cw = (lb0.w - 20 - 10) / 2;
      const colX = [lb0.x + 10, lb0.x + 10 + cw + 10];
      if (s.deleted !== null) {
        label(svg, colX[0]! + cw, lb0.y + 15, t('count.deletes', 'Deletes: {n}', { n: s.deleted.length }), {
          size: fontSizes.sm, fill: c.text, anchor: 'end', weight: 600,
        });
        s.deleted.forEach((i, k) => {
          const text = s.a[i];
          if (text === undefined) throw new Error(`stage: 지운 줄 A${i + 1} 이 없다`);
          const x = colX[0]!;
          const y = chipTop + k * (g.chipH + 4);
          const grp = drawChip(svg, g, x, y, cw, s.marks.del, text, delC!);
          handles.delChips.push({ g: grp, dx: g.ax0 - x, dy: rowY(g, i) - y });
        });
      }
      if (s.inserted !== null) {
        label(svg, colX[1]! + cw, lb0.y + 15, t('count.inserts', 'Inserts: {n}', { n: s.inserted.length }), {
          size: fontSizes.sm, fill: c.text, anchor: 'end', weight: 600,
        });
        s.inserted.forEach((j, k) => {
          const text = s.b[j];
          if (text === undefined) throw new Error(`stage: 넣은 줄 B${j + 1} 이 없다`);
          const x = colX[1]!;
          const y = chipTop + k * (g.chipH + 4);
          const grp = drawChip(svg, g, x, y, cw, s.marks.ins, text, insC!);
          handles.insChips.push({ g: grp, dx: g.bx0 - x, dy: rowY(g, j) - y });
        });
      }

      // 견줌 — 두 칸 바닥에 손질 하나마다 한 칸
      if (s.tally !== null) {
        const unitY = hb.y + hb.h - 20;
        const drawUnits = (box: Box, fills: readonly string[]) => {
          fills.forEach((fill, k) => {
            handles.units.push(el(svg, 'rect', { x: box.x + 10 + k * 20, y: unitY, width: 14, height: 12, rx: 2, fill }));
          });
          label(svg, box.x + box.w - 10, unitY + 6, t('count.edits', 'Edits: {n}', { n: fills.length }), {
            size: fontSizes.sm, fill: c.text, anchor: 'end', weight: 700,
          });
        };
        drawUnits(hb, new Array<string>(s.tally.moves).fill(c.accent));
        drawUnits(lb0, [
          ...new Array<string>(s.tally.deletes).fill(delC!),
          ...new Array<string>(s.tally.inserts).fill(insC!),
        ]);
      }

      handles.motion = el(svg, 'g', {});
      return handles;
    }

    function captionOf(s: MoveLooksLikeRewriteScene): string {
      switch (s.step) {
        case 'start':
          return t('caption.start', 'The same lines, before and after a move. How many edits apart are the two files?');
        case 'move': {
          const m = need(onlyMove(s), 'move');
          return t('caption.move', 'Human eye: the block A {from}–{last} travels in one piece to B {to}. Moves: {n}', {
            from: m.from + 1, last: m.from + m.count, to: m.to + 1, n: need(s.moves, 'move').length,
          });
        }
        case 'keep':
          return t('caption.keep', 'Line eye: link equal lines, as many as possible, with no two links crossing. Kept: {n}', {
            n: need(s.pairs, 'keep').length,
          });
        case 'cross': {
          const n = need(s.tries, 'cross').reduce((acc, x) => acc + x.crosses.length, 0);
          return t('caption.cross', 'The moved lines have word-for-word twins across, but linking them crosses the kept links, so they snap. Crossings: {n}', { n });
        }
        case 'delete':
          return t('caption.delete', 'On the A side the snapped lines fall out as deletions. Deletes: {n}', { n: need(s.deleted, 'delete').length });
        case 'insert':
          return t('caption.insert', 'On the B side the same text comes back as insertions. Inserts: {n}', { n: need(s.inserted, 'insert').length });
        case 'compare': {
          if (s.tally === null) throw new Error('stage: compare 걸음에 셈이 없다');
          return t('caption.compare', 'Edits by the human eye: {h} · Edits by the line eye: {l}', {
            h: s.tally.moves, l: s.tally.deletes + s.tally.inserts,
          });
        }
      }
    }

    /** 한 시계 — ms 동안 draw(p) 를 부르고, 다 흐르거나 거둬지면 풀린다. */
    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) { resolve(); return; }
        draw(0);
        const start = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) { finish(); return; }
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) { finish(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
          timers.add(id);
        };
        const id0 = setTimeout(() => { timers.delete(id0); tick(); }, 16);
        timers.add(id0);
      });
    }

    async function playMove(mine: number, s: MoveLooksLikeRewriteScene, h: Handles): Promise<void> {
      const m = onlyMove(s);
      if (m === null || h.ribbon === null) throw new Error('stage: move 걸음에 덩이가 없다');
      const g = geometry(Math.max(s.a.length, s.b.length));
      const aTop = rowY(g, m.from);
      const bTop = rowY(g, m.to);
      const ribbon = h.ribbon;
      const aT = aTop - 2;
      const aB = rowY(g, m.from + m.count - 1) + g.boxH + 2;
      const bT = bTop - 2;
      const bB = rowY(g, m.to + m.count - 1) + g.boxH + 2;
      // 건너가는 덩이 — 두 줄이 한 테두리 안에서 함께 간다
      if (h.motion === null) throw new Error('stage: 운동 층이 없다');
      const flyer = el(h.motion, 'g', {});
      el(flyer, 'rect', {
        x: -3, y: -3, width: g.colW + 6, height: rowY(g, m.count - 1) - rowY(g, 0) + g.boxH + 6,
        rx: 6, fill: c.bg, stroke: c.accent, 'stroke-width': 2.2,
      });
      for (let k = 0; k < m.count; k += 1) {
        const text = s.a[m.from + k];
        if (text === undefined) throw new Error(`stage: 옮긴 줄 A${m.from + k + 1} 이 없다`);
        label(flyer, 36, k * g.rowH + g.boxH / 2, text, { size: fontSizes.sm, fill: c.text, mono: true });
      }
      await tween(mine, 700, (p) => {
        const x = lerp(g.ax0, g.bx0, p);
        const y = lerp(aTop, bTop, p);
        flyer.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
        const ex = lerp(g.ax1, g.bx0, p);
        ribbon.setAttribute('points',
          `${r2(g.ax1)},${r2(aT)} ${r2(ex)},${r2(lerp(aT, bT, p))} ${r2(ex)},${r2(lerp(aB, bB, p))} ${r2(g.ax1)},${r2(aB)}`);
      });
    }

    async function playKeep(mine: number, h: Handles): Promise<void> {
      const ends = h.keepLines;
      await tween(mine, 600, (p) => {
        for (const e of ends) {
          e.ln.setAttribute('x2', String(r2(lerp(e.x1, e.x2, p))));
          e.ln.setAttribute('y2', String(r2(lerp(e.y1, e.y2, p))));
        }
      });
    }

    async function playCross(mine: number, h: Handles): Promise<void> {
      await tween(mine, 800, (p) => {
        for (const tr0 of h.tries) {
          const at = (tt: number) => [lerp(tr0.p0[0], tr0.p1[0], tt), lerp(tr0.p0[1], tr0.p1[1], tt)] as const;
          const mid = (tr0.tMin + tr0.tMax) / 2;
          let aEnd: number;
          let bStart: number;
          if (p < 0.55) {
            // 잇는 선이 건너편으로 뻗는다
            aEnd = p / 0.55;
            bStart = 1;
            tr0.marks.setAttribute('opacity', '0');
          } else {
            // 엇갈린 자리에서 끊겨 양 끝으로 물러난다
            const q = (p - 0.55) / 0.45;
            aEnd = lerp(mid, tr0.tMin - tr0.gap, q);
            bStart = lerp(mid, tr0.tMax + tr0.gap, q);
            tr0.marks.removeAttribute('opacity');
          }
          const [ax, ay] = at(aEnd);
          const [bx, by] = at(bStart);
          tr0.a.setAttribute('x2', String(r2(ax)));
          tr0.a.setAttribute('y2', String(r2(ay)));
          tr0.b.setAttribute('x1', String(r2(bx)));
          tr0.b.setAttribute('y1', String(r2(by)));
          if (p < 0.55) {
            // 뻗는 동안은 한 줄 — 끊기기 전까지 B 쪽 토막은 A 쪽 끝에 붙어 있다
            tr0.b.setAttribute('x1', String(r2(ax)));
            tr0.b.setAttribute('y1', String(r2(ay)));
            tr0.b.setAttribute('x2', String(r2(ax)));
            tr0.b.setAttribute('y2', String(r2(ay)));
          } else {
            tr0.b.setAttribute('x2', String(r2(tr0.p1[0])));
            tr0.b.setAttribute('y2', String(r2(tr0.p1[1])));
          }
        }
      });
    }

    async function playFall(mine: number, chips: Handles['delChips']): Promise<void> {
      await tween(mine, 650, (p) => {
        for (const ch of chips) {
          ch.g.setAttribute('transform', `translate(${r2(ch.dx * (1 - p))},${r2(ch.dy * (1 - p))})`);
        }
      });
    }

    async function playCompare(mine: number, h: Handles): Promise<void> {
      const n = h.units.length;
      await tween(mine, 600, (p) => {
        h.units.forEach((u, k) => {
          const local = Math.max(0, Math.min(1, p * n - k * 0.6));
          u.setAttribute('width', String(r2(14 * local)));
        });
      });
    }

    return {
      async render(next: MoveLooksLikeRewriteScene, prev: MoveLooksLikeRewriteScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || prev.step === next.step) return;
        switch (next.step) {
          case 'move': await playMove(mine, next, h); break;
          case 'keep': await playKeep(mine, h); break;
          case 'cross': await playCross(mine, h); break;
          case 'delete': await playFall(mine, h.delChips); break;
          case 'insert': await playFall(mine, h.insChips); break;
          case 'compare': await playCompare(mine, h); break;
          case 'start': break;
        }
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
