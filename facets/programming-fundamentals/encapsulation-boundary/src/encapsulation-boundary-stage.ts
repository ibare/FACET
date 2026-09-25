/**
 * encapsulation-boundary 무대 — 클래스 몸을 벽으로 두르고, 멤버에 닿는 자리마다 손을 뻗는다.
 *
 * 클래스 몸은 벽 안에 있다. 벽의 `public` 멤버 줄에는 문이 뚫려 있고, `private` 칸 앞은 막혀 있다.
 * 안의 손은 오른쪽 기둥을 타고 올라 `private` 칸에 곧장 닿는다. 밖의 손은 왼쪽 골목을 타고 올라
 * 문을 지나 `public` 멤버에 닿거나, `private` 칸 앞의 벽에 부딪혀 되돌아온다.
 *
 * 프로그램은 돌지 않는다 — 값은 그리지 않는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Reach } from './algorithm.js';
import type { CheckedLine, EncapsulationBoundaryScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
/** 막힌 손이 벽에서 물러나는 길이 */
const RECOIL = 10;
/** 부딪히기까지가 운동의 몇 할인가 */
const HIT_AT = 0.65;
const PAD = 12;
const LANE_GAP = 10;
const CAPTION_LH = 18;
const BOX_PAD = 8;
const BLOCK_GAP = 18;

type StageLine = { indent: number; text: string; k: string; vis: string | null };

function readLines(initialData: unknown): StageLine[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const raw = (initialData as Record<string, unknown>).lines;
  if (!Array.isArray(raw)) return [];
  const out: StageLine[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return [];
    const rec = item as Record<string, unknown>;
    const stmt = rec.stmt;
    if (typeof rec.indent !== 'number' || typeof rec.text !== 'string') return [];
    if (typeof stmt !== 'object' || stmt === null) return [];
    const s = stmt as Record<string, unknown>;
    if (typeof s.k !== 'string') return [];
    out.push({ indent: rec.indent, text: rec.text, k: s.k, vis: typeof s.vis === 'string' ? s.vis : null });
  }
  return out;
}

const DEFINITION = new Set(['class', 'interface', 'field', 'function', 'signature']);

type Layout = {
  charW: number;
  rowH: number;
  rowTop: number[];
  lineX: number[];
  inClass: boolean[];
  outRank: number[];
  inRank: number[];
  nOut: number;
  wall: number;
  right: number;
  boxTop: number;
  boxBottom: number;
  railStart: number;
  railGap: number;
  captionTop: number;
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function layout(lines: StageLine[]): Layout {
  const W = PIECE_CANVAS_W;
  const fontPx = parseFloat(fontSizes.md);
  const charW = fontPx * 0.6;

  // 클래스 몸 — 클래스 줄과 그보다 깊은 뒤따르는 줄들
  const inClass: boolean[] = [];
  let open: number | null = null;
  for (const ln of lines) {
    if (open !== null && ln.indent <= open) open = null;
    if (ln.k === 'class') open = ln.indent;
    inClass.push(open !== null);
  }

  const outRank: number[] = [];
  const inRank: number[] = [];
  let nOut = 0;
  let nIn = 0;
  lines.forEach((ln, i) => {
    outRank.push(inClass[i] ? -1 : nOut);
    if (!inClass[i]) nOut += 1;
    const judged = inClass[i] && !DEFINITION.has(ln.k);
    inRank.push(judged ? nIn : -1);
    if (judged) nIn += 1;
  });

  const captionTop = H - PAD - CAPTION_LH * 2;
  let transitions = 0;
  for (let i = 1; i < lines.length; i += 1) if (inClass[i] !== inClass[i - 1]) transitions += 1;
  const pads = (inClass.some(Boolean) ? 2 * BOX_PAD : 0) + transitions * BLOCK_GAP;
  const avail = captionTop - 10 - PAD - pads;
  const rowH = lines.length > 0 ? Math.min(26, avail / lines.length) : 26;

  const rowTop: number[] = [];
  let y = PAD + (inClass[0] ? BOX_PAD : 0);
  let boxTop = PAD;
  let boxBottom = PAD;
  lines.forEach((_, i) => {
    if (i > 0 && inClass[i] !== inClass[i - 1]) y += BLOCK_GAP + BOX_PAD;
    if (inClass[i] && (i === 0 || !inClass[i - 1])) boxTop = y - BOX_PAD;
    rowTop.push(y);
    y += rowH;
    if (inClass[i] && (i === lines.length - 1 || !inClass[i + 1])) boxBottom = y + BOX_PAD;
  });

  const wall = PAD + 8 + Math.max(0, nOut - 1) * LANE_GAP + 8;
  const codeX = wall + 16;
  const indentW = 4 * charW;
  const lineX = lines.map((ln) => codeX + ln.indent * indentW);
  const right = W - 10;

  let maxEnd = codeX;
  lines.forEach((ln, i) => {
    if (inClass[i]) maxEnd = Math.max(maxEnd, (lineX[i] ?? codeX) + ln.text.length * charW);
  });
  const railStart = maxEnd + 18;
  const nRails = Math.max(1, nIn * 2);
  const railGap = nRails > 1 ? Math.min(14, (right - 14 - railStart) / (nRails - 1)) : 0;

  return {
    charW,
    rowH,
    rowTop,
    lineX,
    inClass,
    outRank,
    inRank,
    nOut,
    wall,
    right,
    boxTop,
    boxBottom,
    railStart,
    railGap,
    captionTop,
  };
}

type Pt = { x: number; y: number };

function rowCenter(L: Layout, i: number): number {
  return (L.rowTop[i] ?? 0) + L.rowH / 2;
}

function baseline(L: Layout, i: number): number {
  return rowCenter(L, i) + parseFloat(fontSizes.md) * 0.35;
}

/** 손이 지나는 꺾은선 — 닿는 자리의 밑줄에서 출발해 멤버까지. 막힌 손은 벽에서 끝난다. */
function handPoints(L: Layout, c: CheckedLine, r: Reach, idx: number): Pt[] {
  const yu = baseline(L, c.line) + 4 + idx * 3;
  const x0 = (L.lineX[c.line] ?? 0) + r.col * L.charW;
  const x1 = x0 + r.len * L.charW;
  if (c.inside) {
    const rank = Math.max(0, L.inRank[c.line] ?? 0);
    const rail = L.railStart + (rank * 2 + Math.min(idx, 1)) * L.railGap;
    const top = L.rowTop[r.decl] ?? 0;
    const ty = r.decl < c.line ? top + L.rowH - 2 : top + 2;
    return [
      { x: x0, y: yu },
      { x: x1, y: yu },
      { x: rail, y: yu },
      { x: rail, y: ty },
    ];
  }
  const k = Math.max(0, L.outRank[c.line] ?? 0);
  const lane = L.wall - 8 - k * LANE_GAP;
  const ty = rowCenter(L, r.decl) + ((L.nOut - 1) / 2 - k) * 2.5;
  const endX = r.ok ? (L.lineX[r.decl] ?? 0) - 4 : L.wall - 1.5;
  return [
    { x: x1, y: yu },
    { x: x0, y: yu },
    { x: lane, y: yu },
    { x: lane, y: ty },
    { x: endX, y: ty },
  ];
}

function pathLength(pts: Pt[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** 꺾은선의 앞 `len` 만큼을 path 글자로. */
function partialD(pts: Pt[], len: number): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M${r2(first.x)},${r2(first.y)}`;
  let left = Math.max(0, len);
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) break;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= seg) {
      d += ` L${r2(b.x)},${r2(b.y)}`;
      left -= seg;
      continue;
    }
    const f = seg > 0 ? left / seg : 0;
    d += ` L${r2(a.x + (b.x - a.x) * f)},${r2(a.y + (b.y - a.y) * f)}`;
    break;
  }
  return d;
}

function staticLength(pts: Pt[], ok: boolean): number {
  const full = pathLength(pts);
  return ok ? full : Math.max(0, full - RECOIL);
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return 1 - (1 - q) * (1 - q);
}

type HandHandle = {
  pts: Pt[];
  ok: boolean;
  path: SVGPathElement;
  end: SVGElement | null;
  mark: SVGElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function modeWord(tr: Translate, mode: Reach['mode']): string {
  if (mode === 'w') return tr('mode.w', 'write');
  if (mode === 'r') return tr('mode.r', 'read');
  return tr('mode.call', 'call');
}

function captionLines(tr: Translate, scene: EncapsulationBoundaryScene): { text: string; bad: boolean }[] {
  const step = scene.step;
  if (!step) return [{ text: tr('caption.start', 'Nothing has run yet. Each reach into a member is checked first.'), bad: false }];
  if (step.kind === 'verdict') {
    if (step.refused > 0) {
      return [
        {
          text: tr('caption.verdict', 'Reached: {ok} · Refused: {no}. Not a single line runs.', {
            ok: step.reached,
            no: step.refused,
          }),
          bad: true,
        },
      ];
    }
    return [
      {
        text: tr('caption.verdictPass', 'Reached: {ok} · Refused: {no}. The program may run.', {
          ok: step.reached,
          no: step.refused,
        }),
        bad: false,
      },
    ];
  }
  const c = scene.checked.find((x) => x.line === step.line);
  if (!c) return [];
  return c.reaches.map((r) => {
    const vars = { mode: modeWord(tr, r.mode), member: r.member, vis: r.vis, cls: c.cls ?? '' };
    if (c.inside && r.ok) return { text: tr('caption.inside', 'From inside {cls}: {mode} {member} ({vis}) — reached.', vars), bad: false };
    if (r.ok) return { text: tr('caption.through', 'From outside: {mode} {member} ({vis}) — through the door.', vars), bad: false };
    return { text: tr('caption.blocked', 'From outside: {mode} {member} ({vis}) — stopped at the wall.', vars), bad: true };
  });
}

export const encapsulationBoundaryStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const C: Palette = getColors(params.theme);
    const lines = readLines(params.initialData);
    const L = layout(lines);
    const codePx = fontSizes.md;
    const capPx = fontSizes.sm;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: EncapsulationBoundaryScene): HandHandle[] {
      svg.textContent = '';
      if (lines.length === 0) return [];
      const step = scene.step;
      const activeLine = step && step.kind === 'check' ? step.line : -1;
      const refusedLines = new Set<number>();
      if (scene.verdict) {
        for (const c of scene.checked) if (c.reaches.some((r) => !r.ok)) refusedLines.add(c.line);
      }

      const back = el('g', {}, svg);
      const codeG = el('g', {}, svg);
      const handG = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      const front = el('g', {}, svg);

      // 줄 바탕 — 지금 판정하는 줄, 판정 걸음에서는 거부된 줄
      lines.forEach((_, i) => {
        const x = L.inClass[i] ? L.wall + 3 : (L.lineX[i] ?? 0) - 6;
        const w = L.right - x - (L.inClass[i] ? 3 : 0);
        if (i === activeLine) {
          el('rect', { x, y: L.rowTop[i] ?? 0, width: w, height: L.rowH, fill: C.accent, 'fill-opacity': 0.18 }, back);
        }
        if (refusedLines.has(i)) {
          el('rect', { x, y: L.rowTop[i] ?? 0, width: w, height: L.rowH, fill: C.danger, 'fill-opacity': 0.12 }, back);
        }
      });

      // 벽 안 — 위 · 오른쪽 · 아래는 가는 테두리, 왼쪽은 문이 뚫린 두꺼운 벽
      if (L.inClass.some(Boolean)) {
        el(
          'path',
          {
            d: `M${r2(L.wall)},${r2(L.boxTop)} H${r2(L.right)} V${r2(L.boxBottom)} H${r2(L.wall)}`,
            fill: 'none',
            stroke: C.border,
            'stroke-width': 1,
          },
          back,
        );
        const gaps: [number, number][] = [];
        lines.forEach((ln, i) => {
          if (!L.inClass[i]) return;
          const member = ln.k === 'field' || ln.k === 'function';
          const pub = member && (ln.vis ?? (ln.k === 'function' ? 'public' : null)) === 'public';
          if (pub) {
            const cy = rowCenter(L, i);
            gaps.push([cy - L.rowH * 0.4, cy + L.rowH * 0.4]);
          }
        });
        let from = L.boxTop;
        for (const [a, b] of gaps) {
          el('line', { x1: L.wall, y1: from, x2: L.wall, y2: a, stroke: C.text, 'stroke-width': 3 }, back);
          el('line', { x1: L.wall - 4, y1: a, x2: L.wall + 4, y2: a, stroke: C.text, 'stroke-width': 1.5 }, back);
          el('line', { x1: L.wall - 4, y1: b, x2: L.wall + 4, y2: b, stroke: C.text, 'stroke-width': 1.5 }, back);
          from = b;
        }
        el('line', { x1: L.wall, y1: from, x2: L.wall, y2: L.boxBottom, stroke: C.text, 'stroke-width': 3 }, back);

        const inY = L.boxTop + 14;
        el(
          'text',
          { x: L.right - 6, y: inY, 'text-anchor': 'end', fill: C.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
          front,
        ).textContent = tr('label.inside', 'inside');
      }
      const firstOut = L.inClass.findIndex((v) => !v);
      if (firstOut >= 0) {
        el(
          'text',
          {
            x: L.right - 6,
            y: baseline(L, firstOut),
            'text-anchor': 'end',
            fill: C.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          },
          front,
        ).textContent = tr('label.outside', 'outside');
      }

      // private 칸 — 선언 줄을 칸으로 두른다
      lines.forEach((ln, i) => {
        if (!L.inClass[i] || ln.k !== 'field' || ln.vis !== 'private') return;
        const x = (L.lineX[i] ?? 0) - 6;
        el(
          'rect',
          {
            x,
            y: (L.rowTop[i] ?? 0) + 2,
            width: L.right - 8 - x,
            height: L.rowH - 4,
            rx: 4,
            fill: C.bgSubtle,
            stroke: C.textMuted,
            'stroke-width': 1,
          },
          back,
        );
      });

      // 코드 글자
      lines.forEach((ln, i) => {
        el(
          'text',
          {
            x: L.lineX[i] ?? 0,
            y: baseline(L, i),
            fill: C.text,
            'font-family': fonts.mono,
            'font-size': codePx,
            'xml:space': 'preserve',
          },
          codeG,
        ).textContent = ln.text;
      });

      // 손 — 판정을 마친 자리 전부. 이번 걸음의 손은 굵게
      const handles: HandHandle[] = [];
      for (const c of scene.checked) {
        const active = c.line === activeLine;
        c.reaches.forEach((r, idx) => {
          const pts = handPoints(L, c, r, idx);
          const color = r.ok ? C.success : C.danger;
          const path = el(
            'path',
            {
              d: partialD(pts, staticLength(pts, r.ok)),
              stroke: color,
              'stroke-width': active ? 2.5 : 1.5,
              'stroke-opacity': active ? 1 : 0.6,
            },
            handG,
          );
          const last = pts[pts.length - 1];
          let end: SVGElement | null = null;
          let mark: SVGElement | null = null;
          if (last && r.ok) {
            end = el('circle', { cx: last.x, cy: last.y, r: active ? 3.5 : 2.5, fill: color }, front);
          }
          if (last && !r.ok) {
            mark = el(
              'line',
              {
                x1: L.wall,
                y1: last.y - 7,
                x2: L.wall,
                y2: last.y + 7,
                stroke: C.danger,
                'stroke-width': 5,
                'stroke-linecap': 'round',
              },
              front,
            );
          }
          if (active) handles.push({ pts, ok: r.ok, path, end, mark });
        });
      }

      // 캡션
      captionLines(tr, scene).forEach((cap, i) => {
        el(
          'text',
          {
            x: PAD,
            y: L.captionTop + CAPTION_LH * (i + 1) - 4,
            fill: cap.bad ? C.danger : C.text,
            'font-family': fonts.body,
            'font-size': capPx,
          },
          front,
        ).textContent = cap.text;
      });

      return handles;
    }

    function frame(): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, 16);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function applyHand(h: HandHandle, p: number): void {
      const full = pathLength(h.pts);
      if (h.ok) {
        h.path.setAttribute('d', partialD(h.pts, full * ease(p)));
        if (h.end) {
          if (p < 1) h.end.setAttribute('opacity', '0');
          else h.end.removeAttribute('opacity');
        }
        return;
      }
      if (p < HIT_AT) {
        h.path.setAttribute('d', partialD(h.pts, full * ease(p / HIT_AT)));
        h.mark?.setAttribute('opacity', '0');
        return;
      }
      const q = (p - HIT_AT) / (1 - HIT_AT);
      h.path.setAttribute('d', partialD(h.pts, full - RECOIL * ease(q)));
      h.mark?.removeAttribute('opacity');
    }

    async function render(
      next: EncapsulationBoundaryScene,
      _prev: EncapsulationBoundaryScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || handles.length === 0) return;
      for (const h of handles) applyHand(h, 0);
      const start = performance.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (performance.now() - start) / MOTION_MS);
        for (const h of handles) applyHand(h, p);
        if (p >= 1) break;
        await frame();
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
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
