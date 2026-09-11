/**
 * 약수의 짝 — √n 에서 접히는 그림.
 *
 * 1..n 을 한 줄에 깔고, 작은 쪽부터 짚어 올라간다. 약수를 만나면 **그 짝(n/d)이
 * 제자리에서 떠올라 작은 쪽 위로 날아와 앉고**, 떠난 자리에는 자국만 남는다.
 * 날아오는 거리는 짝이 가까워질수록 줄어 √n 에서 정확히 0 이 된다 — 그 칸이
 * 자기 자신과 짝을 이루는 자리이고, 접히는 자리다. 그래서 마지막에 √n 너머를
 * 덮어도 잃는 짝이 없다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 주므로 칸 폭은 거기서 역산하고, 세로는
 * 그림이 정하는 값이라 여기 상수로 둔다 (S-view · S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로. 짝이 앉는 줄 · 수직선 · 캡션 두 줄이 정한 값이다. */
const H = 196;

const CELL_H = 26;
/** 칸 폭의 **상한**만 상수로 둔다. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 24;
const SIDE_MIN = 12;

const DOCK_TOP = 60;
const STRIP_TOP = 106;
const AXIS_TOP = 52;
const AXIS_BOTTOM = 146;
const ROOT_LABEL_Y = 160;
const CAPTION_TOP = 176;
const CAPTION_LINE = 15;
const CAPTION_SIZE = 12;
const ROOT_SIZE = 11;
const CURSOR_GAP = 4;
const CURSOR_H = 8;
const CURSOR_HALF = 5;

const FRAME_MS = 16;
const PROBE_MS = 200;
const MISS_MS = 260;
const FLIGHT_MIN = 240;
const FLIGHT_MAX = 580;
const AXIS_MS = 280;
const COVER_MS = 460;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** 한글·가나·한자는 글자 폭이 글자 크기와 거의 같고, 라틴은 그 절반쯤이다. */
function charWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60);
  return size * (wide ? 1 : 0.52);
}

/**
 * 캡션을 두 줄까지 감는다.
 *
 * 열 언어 중에는 라틴 계열이 한 줄을 넘기는 것이 있어 고정 한 줄로 두면 잘린다.
 * 실측이 없는 환경(happy-dom)에서도 같은 결과가 나오도록 글자 폭을 어림한다 —
 * 재는 것이 아니라 감는 자리를 정할 뿐이다.
 */
function wrapCaption(text: string, maxWidth: number, size: number): string[] {
  if (text === '') return [];
  const lines: string[] = [];
  let line = '';
  let width = 0;
  let breakAt = -1; // 마지막으로 띄어쓰기가 있던 자리
  for (const ch of text) {
    const w = charWidth(ch, size);
    if (width + w > maxWidth && line !== '') {
      if (lines.length === 1) break; // 두 줄까지만
      if (breakAt > 0) {
        lines.push(line.slice(0, breakAt));
        line = line.slice(breakAt + 1);
        width = [...line].reduce((a, c) => a + charWidth(c, size), 0);
      } else {
        lines.push(line);
        line = '';
        width = 0;
      }
      breakAt = -1;
    }
    if (ch === ' ') breakAt = line.length;
    line += ch;
    width += w;
  }
  if (line !== '') lines.push(line);
  return lines.slice(0, 2);
}

export type DivisorScene = {
  /** 약수를 찾을 수. 2 보다 작으면 그릴 것이 없다. */
  n: number;
};

/**
 * `initialData` 를 좁히는 자리는 여기 하나뿐이다 (S-piece). projector 는 걸음마다
 * 오는 payload 만 좁히므로 이 함수를 다시 부르지 않는다.
 */
export function readScene(initialData: Record<string, unknown> | undefined): DivisorScene {
  const n = initialData?.['n'];
  return {
    n: typeof n === 'number' && Number.isFinite(n) && n >= 2 ? Math.floor(n) : 0,
  };
}

type CellState = 'idle' | 'probe' | 'divisor' | 'gone';
type CellNodes = { base: SVGRectElement; tint: SVGRectElement; label: SVGTextElement };

export const divisorPairsSqrtStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const svg = params.canvas;
    const { n } = readScene(params.initialData);

    // 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const cellW = n >= 2 ? Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n)) : CELL_MAX_W;
    const tileW = Math.max(1, cellW - 1.5);
    const originX = Math.round((W - cellW * Math.max(n, 0)) / 2);
    const labelSize = Math.max(8, Math.min(12, Math.round(cellW * 0.62)));

    const cellX = (v: number): number => originX + (v - 1) * cellW;
    const cellCx = (v: number): number => originX + (v - 0.5) * cellW;

    // ── 층 순서: 덮개 → 수직선 → 줄 → 앉은 짝 → 나는 짝 → 커서 → 캡션
    const gWash = el('g', {});
    const gAxis = el('g', {});
    const gStrip = el('g', {});
    const gDock = el('g', {});
    const gFly = el('g', {});
    const gCursor = el('g', {});
    const gCaption = el('g', {});
    for (const g of [gWash, gAxis, gStrip, gDock, gFly, gCursor, gCaption]) svg.appendChild(g);

    /** √n 너머를 덮는 옅은 중성 색지. 영역 tint 이므로 region 어휘를 쓴다 (S-view). */
    const wash = el('rect', {
      x: originX,
      y: STRIP_TOP - 5,
      width: 0,
      height: CELL_H + 10,
      rx: 3,
      fill: colors.subtreeShadeLeft,
      opacity: 0,
    });
    gWash.appendChild(wash);

    const axis = el('line', {
      x1: originX,
      y1: STRIP_TOP + CELL_H / 2,
      x2: originX,
      y2: STRIP_TOP + CELL_H / 2,
      stroke: colors.accent,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    gAxis.appendChild(axis);

    const rootLabel = el('text', {
      x: originX,
      y: ROOT_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': ROOT_SIZE,
      fill: colors.text,
      opacity: 0,
    });
    gAxis.appendChild(rootLabel);

    const cells: CellNodes[] = [];
    for (let v = 1; v <= n; v += 1) {
      const x = cellX(v);
      const base = el('rect', {
        x: x + 0.75,
        y: STRIP_TOP,
        width: tileW,
        height: CELL_H,
        rx: 2,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const tint = el('rect', {
        x: x + 0.75,
        y: STRIP_TOP,
        width: tileW,
        height: CELL_H,
        rx: 2,
        fill: colors.itemPivot,
        opacity: 0,
      });
      const label = el('text', {
        x: x + cellW / 2,
        y: STRIP_TOP + CELL_H / 2 + labelSize * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': labelSize,
        fill: colors.textMuted,
      });
      label.textContent = String(v);
      gStrip.appendChild(base);
      gStrip.appendChild(tint);
      gStrip.appendChild(label);
      cells.push({ base, tint, label });
    }

    /** 짚는 자리를 가리키는 삼각 커서. 1 부터 위로 훑는 움직임이 여기서 보인다. */
    const cursorY = STRIP_TOP + CELL_H + CURSOR_GAP;
    const cursorCx = n >= 2 ? cellCx(1) : W / 2;
    const cursor = el('polygon', {
      points: [
        `${cursorCx - CURSOR_HALF},${cursorY + CURSOR_H}`,
        `${cursorCx},${cursorY}`,
        `${cursorCx + CURSOR_HALF},${cursorY + CURSOR_H}`,
      ].join(' '),
      fill: colors.itemComparing,
      opacity: 0,
      transform: 'translate(0 14)',
    });
    gCursor.appendChild(cursor);

    const captionLines: SVGTextElement[] = [0, 1].map((i) => {
      const t = el('text', {
        x: W / 2,
        y: CAPTION_TOP + i * CAPTION_LINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': CAPTION_SIZE,
        fill: colors.text,
      });
      gCaption.appendChild(t);
      return t;
    });

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한자리에서 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(ms: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return;
          const t = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          onFrame(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function paint(v: number, state: CellState): void {
      const c = cells[v - 1];
      if (!c) return;
      if (state === 'gone') {
        // 짝이 떠난 자리 — 자국만 남는다.
        c.base.setAttribute('fill', 'none');
        c.base.setAttribute('stroke', colors.ghostOutline);
        c.base.setAttribute('stroke-dasharray', '2 2');
        c.tint.setAttribute('opacity', '0');
        c.label.setAttribute('fill', colors.textMuted);
        c.label.setAttribute('opacity', '0.45');
        return;
      }
      c.base.setAttribute('fill', colors.itemDefault);
      c.base.setAttribute('stroke', colors.border);
      c.base.setAttribute('stroke-dasharray', 'none');
      c.label.setAttribute('opacity', '1');
      if (state === 'idle') {
        c.tint.setAttribute('opacity', '0');
        c.label.setAttribute('fill', colors.textMuted);
        return;
      }
      c.tint.setAttribute('fill', state === 'probe' ? colors.itemComparing : colors.itemPivot);
      c.tint.setAttribute('opacity', '1');
      c.label.setAttribute('fill', colors.stateInk);
    }

    function makeTile(text: string, x: number, y: number): SVGGElement {
      const g = el('g', {});
      const rect = el('rect', {
        x: x + 0.75,
        y,
        width: tileW,
        height: CELL_H,
        rx: 2,
        fill: colors.itemPivot,
        stroke: colors.itemPivot,
        'stroke-width': 1,
      });
      const label = el('text', {
        x: x + cellW / 2,
        y: y + CELL_H / 2 + labelSize * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': labelSize,
        fill: colors.stateInk,
      });
      label.textContent = text;
      g.appendChild(rect);
      g.appendChild(label);
      return g;
    }

    let cursorX = 0;
    let cursorShown = false;

    async function probe(d: number): Promise<void> {
      if (d < 1 || d > n) return;
      const toX = (d - 1) * cellW;
      const fromX = cursorShown ? cursorX : toX;
      const fromY = cursorShown ? 0 : 14;
      cursor.setAttribute('opacity', '1');
      await animate(PROBE_MS, (t) => {
        const e = easeInOut(t);
        const x = fromX + (toX - fromX) * e;
        const y = fromY * (1 - e);
        cursor.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      });
      cursorX = toX;
      cursorShown = true;
      paint(d, 'probe');
    }

    async function miss(d: number): Promise<void> {
      const c = cells[d - 1];
      if (!c) return;
      await animate(MISS_MS, (t) => c.tint.setAttribute('opacity', (1 - t).toFixed(3)));
      paint(d, 'idle');
    }

    async function growAxis(d: number): Promise<void> {
      const cx = cellCx(d);
      const midY = STRIP_TOP + CELL_H / 2;
      axis.setAttribute('x1', String(cx));
      axis.setAttribute('x2', String(cx));
      axis.setAttribute('opacity', '1');
      rootLabel.setAttribute('x', String(cx));
      rootLabel.textContent = `√${n} = ${d}`;
      await animate(AXIS_MS, (t) => {
        const e = easeInOut(t);
        axis.setAttribute('y1', (midY + (AXIS_TOP - midY) * e).toFixed(2));
        axis.setAttribute('y2', (midY + (AXIS_BOTTOM - midY) * e).toFixed(2));
      });
      rootLabel.setAttribute('opacity', '1');
    }

    /**
     * 짝이 날아와 앉는다.
     *
     * 가는 거리가 곧 이 조각의 주장이다 — 짝이 가까울수록 짧아지고 √n 에서는
     * 0 이 되어 제자리에서 떠오르기만 한다.
     */
    async function pairTo(d: number, q: number): Promise<void> {
      if (d < 1 || d > n || q < 1 || q > n) return;
      const fromX = cellX(q);
      const toX = cellX(d);
      const dx = toX - fromX;
      const dy = DOCK_TOP - STRIP_TOP;
      const span = Math.abs(dx);
      const widest = Math.max(1, cellW * (n - 1));
      const lift = 10 + Math.min(40, span * 0.14);
      const ms = FLIGHT_MIN + Math.round((FLIGHT_MAX - FLIGHT_MIN) * (span / widest));

      paint(q, 'gone');
      const tile = makeTile(String(q), fromX, STRIP_TOP);
      gFly.appendChild(tile);
      await animate(ms, (t) => {
        const e = easeInOut(t);
        const x = dx * e;
        const y = dy * e - lift * Math.sin(Math.PI * t);
        tile.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      });
      if (tile.parentNode) tile.parentNode.removeChild(tile);
      gDock.appendChild(makeTile(String(q), toX, DOCK_TOP));
      paint(d, 'divisor');
      // 자기 자신과 짝을 이룬 칸이 곧 접히는 자리다.
      if (d === q) await growAxis(d);
    }

    async function coverBeyond(from: number): Promise<void> {
      if (n < 2) return;
      const start = Math.min(Math.max(from, 1), n + 1);
      const x0 = cellX(start);
      const full = Math.max(0, originX + n * cellW - x0);
      wash.setAttribute('x', String(x0));
      wash.setAttribute('opacity', '1');
      await animate(COVER_MS, (t) => wash.setAttribute('width', (full * easeOut(t)).toFixed(2)));
    }

    function setCaption(text: string): void {
      const lines = wrapCaption(text, W - 28, CAPTION_SIZE);
      captionLines.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    function rewind(): void {
      for (let v = 1; v <= n; v += 1) paint(v, 'idle');
      while (gDock.firstChild) gDock.removeChild(gDock.firstChild);
      while (gFly.firstChild) gFly.removeChild(gFly.firstChild);
      axis.setAttribute('opacity', '0');
      rootLabel.setAttribute('opacity', '0');
      wash.setAttribute('opacity', '0');
      wash.setAttribute('width', '0');
      cursor.setAttribute('opacity', '0');
      cursor.setAttribute('transform', 'translate(0 14)');
      cursorX = 0;
      cursorShown = false;
      setCaption('');
    }

    return {
      probe,
      pairTo,
      miss,
      coverBeyond,
      setCaption,
      rewind,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id); // 걸어 둔 것을 먼저 거두고
        timers.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
