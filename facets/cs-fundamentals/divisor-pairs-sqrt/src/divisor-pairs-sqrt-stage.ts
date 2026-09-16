/**
 * 약수의 짝 — √n 에서 접히는 그림.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세운다 (S-scene). 되돌릴 명령이 없으므로 늘 비우고 다시 짓는다.
 *
 * 1..n 을 한 줄에 깔고, 작은 쪽부터 짚어 올라간다. 약수를 만나면 **그 짝(n/d)이
 * 제자리에서 떠올라 작은 쪽 위로 날아와 앉고**, 떠난 자리에는 자국만 남는다.
 * 날아오는 거리는 짝이 가까워질수록 줄어 √n 에서 정확히 0 이 된다 — 그 칸이
 * 자기 자신과 짝을 이루는 자리이고, 접히는 자리다. 그래서 마지막에 √n 너머를
 * 덮어도 잃는 짝이 없다.
 *
 * ── 두 축을 가른다 (프로토콜 4 절)
 *
 *   **채움 = 값의 형편** — 약수가 아닌가 · 지금 짚어 보는 중인가 · 약수인가 ·
 *   약수인데 그 값이 짝으로 날아가 앉았는가.
 *   **테두리 = 짚음의 표식** — 이 자리를 짚어 보았나 · 짚지 않았는데 짝으로
 *   덮였나 · 아무 일도 없었나.
 *
 * 둘을 한 축에 실으면 "짚었는데 약수가 아니었던 5" 와 "아예 안 본 7" 이 같은
 * 모양이 되어 이 조각의 주장이 사라진다 — 옮기기 전 화면이 정확히 그랬다.
 * 다 끝난 화면에서 **테두리가 있는 칸을 세면 그것이 √n 번**이고, 테두리가 없는
 * 칸이 곧 끝내 안 봐도 되었던 자리다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 가로는 러너가 `PIECE_CANVAS_W` 로
 * 주므로 칸 폭은 거기서 역산하고, 세로는 그림이 정하는 값이라 여기 상수로 둔다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { sqrtLimit } from './algorithm.js';
import {
  axisShown,
  captionOf,
  cellsOf,
  lastProbed,
  pairsOf,
  type CellFill,
  type CellMark,
  type DivisorCaption,
  type DivisorPairsSqrtScene,
} from './scene.js';

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
/** 커서가 줄 아래에서 떠오르는 높이. 첫 짚기의 출발 자리다. */
const CURSOR_RISE = 14;

const FRAME_MS = 16;
const PROBE_MS = 200;
const MISS_MS = 260;
const FLIGHT_MIN = 240;
const FLIGHT_MAX = 580;
const AXIS_MS = 280;
const COVER_MS = 460;

/** 짚음의 표식이 쓰는 테두리 굵기. 값의 형편(채움)과 부딪히지 않는다. */
const MARK_WIDTH = '1.8';
const COVER_DASH = '3 2';

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

/** 한글·가나는 글자 폭이 글자 크기와 거의 같고, 라틴은 그 절반쯤이다. */
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

/**
 * 캔버스에서 역산한 자리. 바탕(n)이 정하므로 그릴 때마다 다시 잰다.
 *
 * 이름이 `Scene` 이 아니라 `Layout` 인 것은 장면과 갈라 두기 위해서다 —
 * 옮기기 전 이 파일에는 `DivisorScene` 이라는 다른 뜻의 이름이 있었다.
 */
type Layout = {
  n: number;
  cellW: number;
  tileW: number;
  labelSize: number;
  originX: number;
  cellX: (v: number) => number;
  cellCx: (v: number) => number;
};

function layoutOf(scene: DivisorPairsSqrtScene): Layout {
  const n = scene.base.n;
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(n, 1)));
  const originX = Math.round((W - cellW * n) / 2);
  return {
    n,
    cellW,
    tileW: Math.max(1, cellW - 1.5),
    labelSize: Math.max(8, Math.min(12, Math.round(cellW * 0.62))),
    originX,
    cellX: (v: number): number => originX + (v - 1) * cellW,
    cellCx: (v: number): number => originX + (v - 0.5) * cellW,
  };
}

export const divisorPairsSqrtStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const svg = params.canvas;
    svg.textContent = '';
    // 장면 방식에서는 문안을 stage 가 만든다 — 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한자리에서 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 세대 빗장. `render` 가 새로 오면 앞 세대의 운동은 화면에 손대지 않고 물러난다.
     *
     * 정적 그리기가 칸을 매번 새로 짓지만 **손잡이 배열을 다시 채우므로**, 앞
     * 세대가 `await` 뒤에 그 배열을 읽으면 살아 있는 화면에 옛 프레임을 쓴다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * rAF 대신 타이머 보간. CSS transition 은 되짚은 뒤에도 혼자 흘러간다 (MUST NOT).
     *
     * **프레임마다 세대를 본다.** 되짚기가 운동 도중에 끼어들면 앞 세대의 남은
     * 프레임들이 이미 새로 선 화면에 옛 값을 쓴다.
     */
    function animate(ms: number, mine: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || !alive(mine)) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed || !alive(mine)) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          onFrame(raw);
          if (raw >= 1) {
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

    // ── 층 순서: 줄 → 덮개 → 수직선 → 앉은 짝 → 커서 → 캡션
    //
    // 덮개를 줄 **위**에 둔다. 아래에 깔면 칸이 통째로 가려 영역 tint 가 보이지
    // 않는다 — 옮기기 전 화면이 그랬다.
    //
    // 날아오는 짝을 담던 층은 없앴다. 정적 그리기가 짝을 이미 앉혀 두므로 운동은
    // **앉은 그 타일을 뒤로 물렸다 놓는 것**이라 따로 담을 자리가 필요 없다.
    const gStrip = el('g', {});
    const gWash = el('g', {});
    const gAxis = el('g', {});
    const gDock = el('g', {});
    const gCursor = el('g', {});
    const gCaption = el('g', {});
    const layers = [gStrip, gWash, gAxis, gDock, gCursor, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 정적 그리기가 매번 다시 채우는 손잡이들
    let cellRects: SVGRectElement[] = [];
    let cellTints: SVGRectElement[] = [];
    let cellLabels: SVGTextElement[] = [];
    let dockTiles: SVGGElement[] = [];
    let washRect: SVGRectElement | null = null;
    let axisLine: SVGLineElement | null = null;
    let rootLabel: SVGTextElement | null = null;

    /** 늘 비우고 시작한다. 레이어 자신의 속성도 되돌린다 — 자식을 비워도 남는다. */
    function rewind(): void {
      for (const g of layers) {
        g.textContent = '';
        g.removeAttribute('opacity');
        g.removeAttribute('transform');
      }
      cellRects = [];
      cellTints = [];
      cellLabels = [];
      dockTiles = [];
      washRect = null;
      axisLine = null;
      rootLabel = null;
    }

    // ── 두 축. 서로 다른 속성에 실려 한 화면에 함께 선다.

    /** 채움이 말하는 것 — 이 수가 약수인가, 그 값이 아직 여기 있는가. */
    function paintFill(v: number, fill: CellFill): void {
      const rect = cellRects[v - 1];
      const tint = cellTints[v - 1];
      const label = cellLabels[v - 1];
      if (!rect || !tint || !label) return;
      const moved = fill === 'moved';
      rect.setAttribute('fill', moved ? 'none' : c.itemDefault);
      label.setAttribute('opacity', moved ? '0.45' : '1');
      if (fill === 'probing' || fill === 'divisor') {
        tint.setAttribute('fill', fill === 'probing' ? c.itemComparing : c.itemPivot);
        tint.setAttribute('opacity', '1');
        label.setAttribute('fill', c.stateInk);
        return;
      }
      tint.setAttribute('fill', c.itemPivot);
      tint.setAttribute('opacity', '0');
      label.setAttribute('fill', c.textMuted);
    }

    /** 테두리가 말하는 것 — 이 자리를 짚어 보았나, 짝으로 덮였나. */
    function paintMark(v: number, mark: CellMark): void {
      const rect = cellRects[v - 1];
      if (!rect) return;
      if (mark === 'probed') {
        rect.setAttribute('stroke', c.text);
        rect.setAttribute('stroke-width', MARK_WIDTH);
        rect.setAttribute('stroke-dasharray', 'none');
        return;
      }
      if (mark === 'covered') {
        rect.setAttribute('stroke', c.accent);
        rect.setAttribute('stroke-width', MARK_WIDTH);
        rect.setAttribute('stroke-dasharray', COVER_DASH);
        return;
      }
      rect.setAttribute('stroke', c.border);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', 'none');
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────────

    function drawStrip(scene: DivisorPairsSqrtScene, geo: Layout): void {
      // 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 (프로토콜 4 절).
      const cells = cellsOf(scene);
      for (let v = 1; v <= geo.n; v += 1) {
        const x = geo.cellX(v);
        const rect = el('rect', {
          x: x + 0.75,
          y: STRIP_TOP,
          width: geo.tileW,
          height: CELL_H,
          rx: 2,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const tint = el('rect', {
          x: x + 0.75,
          y: STRIP_TOP,
          width: geo.tileW,
          height: CELL_H,
          rx: 2,
          fill: c.itemPivot,
          opacity: 0,
        });
        const label = el('text', {
          x: x + geo.cellW / 2,
          y: STRIP_TOP + CELL_H / 2 + geo.labelSize * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': geo.labelSize,
          fill: c.textMuted,
          opacity: 1,
        });
        label.textContent = String(v);
        gStrip.appendChild(rect);
        gStrip.appendChild(tint);
        gStrip.appendChild(label);
        cellRects.push(rect);
        cellTints.push(tint);
        cellLabels.push(label);
      }
      for (let v = 1; v <= geo.n; v += 1) {
        const cell = cells[v - 1];
        if (!cell) continue;
        paintFill(v, cell.fill);
        paintMark(v, cell.mark);
      }
    }

    /**
     * 덮개가 덮는 자리와 폭. **좌표에서 셈한다.**
     *
     * 운동이 폭을 되읽지 않도록 정적 그리기와 운동이 같은 함수를 지난다 — 화면의
     * 지금 값을 출발값으로 삼으면 되짚어 세운 직후에 옛 화면의 것이 된다 (함정 ④).
     */
    function washSpanOf(geo: Layout): { x0: number; full: number } {
      const start = Math.min(sqrtLimit(geo.n) + 1, geo.n + 1);
      const x0 = geo.cellX(start);
      return { x0, full: Math.max(0, geo.originX + geo.n * geo.cellW - x0) };
    }

    /** √n 너머를 덮는 옅은 중성 색지. 영역 tint 이므로 region 어휘를 쓴다 (S-view). */
    function drawWash(scene: DivisorPairsSqrtScene, geo: Layout): void {
      if (!scene.covered) return; // 아직 없는 것은 숨기지 말고 짓지 않는다
      const { x0, full } = washSpanOf(geo);
      washRect = el('rect', {
        x: x0,
        y: STRIP_TOP - 5,
        width: full,
        height: CELL_H + 10,
        rx: 3,
        fill: c.subtreeShadeLeft,
      });
      gWash.appendChild(washRect);
    }

    /**
     * 접는 자리.
     *
     * 자리는 `sqrtLimit(n)` 한 곳에서 나온다. 제곱수면 그 칸 **위**에, 아니면 두
     * 칸 **사이**에 선다 — 설명글이 말하는 그 차이다.
     */
    function drawAxis(scene: DivisorPairsSqrtScene, geo: Layout): void {
      if (!axisShown(scene)) return;
      const limit = sqrtLimit(geo.n);
      const exact = limit * limit === geo.n;
      const cx = exact ? geo.cellCx(limit) : geo.cellX(limit + 1);
      axisLine = el('line', {
        x1: cx,
        y1: AXIS_TOP,
        x2: cx,
        y2: AXIS_BOTTOM,
        stroke: c.accent,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      gAxis.appendChild(axisLine);
      rootLabel = el('text', {
        x: cx,
        y: ROOT_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': ROOT_SIZE,
        fill: c.text,
        opacity: 1,
      });
      // 수식 표기라 번역하지 않는다 (C10). 제곱수가 아니면 값을 못 박지 않는다.
      rootLabel.textContent = exact ? `√${geo.n} = ${limit}` : `√${geo.n}`;
      gAxis.appendChild(rootLabel);
    }

    function makeTile(text: string, x: number, y: number, geo: Layout): SVGGElement {
      const g = el('g', {});
      const rect = el('rect', {
        x: x + 0.75,
        y,
        width: geo.tileW,
        height: CELL_H,
        rx: 2,
        fill: c.itemPivot,
        stroke: c.itemPivot,
        'stroke-width': 1,
      });
      const label = el('text', {
        x: x + geo.cellW / 2,
        y: y + CELL_H / 2 + geo.labelSize * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': geo.labelSize,
        fill: c.stateInk,
      });
      label.textContent = text;
      g.appendChild(rect);
      g.appendChild(label);
      return g;
    }

    /** 앉은 짝들. `probes` 에서 셈한 것이라 되짚어도 그대로 선다. */
    function drawDock(scene: DivisorPairsSqrtScene, geo: Layout): void {
      for (const pair of pairsOf(scene)) {
        const tile = makeTile(String(pair.q), geo.cellX(pair.d), DOCK_TOP, geo);
        gDock.appendChild(tile);
        dockTiles.push(tile);
      }
    }

    /** 짚는 자리를 가리키는 삼각 커서. 짚은 적이 없으면 짓지 않는다. */
    function drawCursor(scene: DivisorPairsSqrtScene, geo: Layout): void {
      const d = lastProbed(scene);
      if (d === null) return;
      const y = STRIP_TOP + CELL_H + CURSOR_GAP;
      const cx = geo.cellCx(1);
      gCursor.appendChild(
        el('polygon', {
          points: [
            `${cx - CURSOR_HALF},${y + CURSOR_H}`,
            `${cx},${y}`,
            `${cx + CURSOR_HALF},${y + CURSOR_H}`,
          ].join(' '),
          fill: c.itemComparing,
        }),
      );
      placeCursor((d - 1) * geo.cellW, 0);
    }

    function placeCursor(x: number, y: number): void {
      gCursor.setAttribute('transform', `translate(${x} ${y})`);
    }

    function captionText(cap: DivisorCaption): string {
      switch (cap.kind) {
        case 'probe':
          return t('caption.probe', 'Is {d} a divisor of {n}?', { d: cap.d, n: cap.n });
        case 'pair':
          return t(
            'caption.pair',
            '{d} × {q} = {n}. Finding the smaller side finds the larger one too.',
            { d: cap.d, q: cap.q, n: cap.n },
          );
        case 'self':
          return t(
            'caption.self',
            '{d} × {d} = {n}. Here the pair meets itself — this is the square root of {n}.',
            { d: cap.d, n: cap.n },
          );
        case 'miss':
          return t('caption.miss', '{n} is not divisible by {d}. No partner here.', {
            d: cap.d,
            n: cap.n,
          });
        case 'stop':
          return t(
            'caption.stop',
            'Every pair has its smaller side at or before the square root. Walking that far meets them all.',
            { n: cap.n },
          );
      }
    }

    function drawCaption(cap: DivisorCaption | null): void {
      if (!cap) return;
      const lines = wrapCaption(captionText(cap), W - 28, CAPTION_SIZE);
      for (let i = 0; i < lines.length; i += 1) {
        const node = el('text', {
          x: W / 2,
          y: CAPTION_TOP + i * CAPTION_LINE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': CAPTION_SIZE,
          fill: c.text,
        });
        node.textContent = lines[i];
        gCaption.appendChild(node);
      }
    }

    /** 장면이 말하는 것을 전부 세운다. 어느 걸음에서 오든 결과가 같다. */
    function drawStatic(scene: DivisorPairsSqrtScene): void {
      rewind();
      const geo = layoutOf(scene);
      drawStrip(scene, geo);
      drawWash(scene, geo);
      drawAxis(scene, geo);
      drawDock(scene, geo);
      drawCursor(scene, geo);
      drawCaption(captionOf(scene));
    }

    // ── 운동 ────────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 오지
    // 않은 만큼을 뒤로 물려** 놓고 제자리로 돌려놓는 꼴이 된다.

    /**
     * 커서가 옮겨 간다.
     *
     * 출발 자리는 `step.from` 이 말한다. 화면의 지금 자리를 따로 적어 둔 변수를
     * 되읽어 출발값으로 삼으면, 되짚어 세운 직후에 그것이 옛 화면의 것이라 커서가
     * 엉뚱한 데서 출발한다 (프로토콜 4 절).
     */
    async function flowProbe(
      scene: DivisorPairsSqrtScene,
      from: number | null,
      mine: number,
    ): Promise<void> {
      const d = lastProbed(scene);
      if (d === null) return;
      const geo = layoutOf(scene);
      const toX = (d - 1) * geo.cellW;
      const fromX = from === null ? toX : (from - 1) * geo.cellW;
      const fromY = from === null ? CURSOR_RISE : 0;

      // 출발 그림으로 물린다 — 아직 이 자리를 짚기 전이다.
      paintFill(d, 'plain');
      paintMark(d, 'none');
      placeCursor(fromX, fromY);

      await animate(PROBE_MS, mine, (raw) => {
        const e = easeInOut(raw);
        placeCursor(fromX + (toX - fromX) * e, fromY * (1 - e));
      });
      if (!alive(mine)) return;
      paintFill(d, 'probing');
      paintMark(d, 'probed');
    }

    /** 짚어 본 물이 가라앉는다. **짚었다는 표식은 남는다.** */
    async function flowMiss(scene: DivisorPairsSqrtScene, mine: number): Promise<void> {
      const d = lastProbed(scene);
      if (d === null) return;
      paintFill(d, 'probing');
      const tint = cellTints[d - 1];
      const label = cellLabels[d - 1];
      await animate(MISS_MS, mine, (raw) => {
        tint?.setAttribute('opacity', (1 - raw).toFixed(3));
      });
      if (!alive(mine)) return;
      tint?.setAttribute('opacity', '0');
      label?.setAttribute('fill', c.textMuted);
    }

    /**
     * 짝이 날아와 앉는다.
     *
     * 가는 거리가 곧 이 조각의 주장이다 — 짝이 가까울수록 짧아지고 √n 에서는
     * 0 이 되어 제자리에서 떠오르기만 한다.
     */
    async function flowPair(scene: DivisorPairsSqrtScene, mine: number): Promise<void> {
      const pairs = pairsOf(scene);
      const pair = pairs[pairs.length - 1];
      const tile = dockTiles[dockTiles.length - 1];
      if (!pair || !tile) return;
      const geo = layoutOf(scene);
      const dx = geo.cellX(pair.q) - geo.cellX(pair.d);
      const dy = STRIP_TOP - DOCK_TOP;
      const span = Math.abs(dx);
      const widest = Math.max(1, geo.cellW * (geo.n - 1));
      const lift = 10 + Math.min(40, span * 0.14);
      const ms = FLIGHT_MIN + Math.round((FLIGHT_MAX - FLIGHT_MIN) * (span / widest));

      // 출발 그림으로 물린다 — 짝은 아직 제자리에 있고, 짚은 자리는 아직 답을
      // 받지 않았다. 자기 짝이면 두 자리가 같으므로 짚은 쪽 칠이 이긴다.
      if (pair.q !== pair.d) {
        paintFill(pair.q, 'plain');
        paintMark(pair.q, 'none');
      }
      paintFill(pair.d, 'probing');
      paintMark(pair.d, 'probed');
      tile.setAttribute('transform', `translate(${dx} ${dy})`);

      await animate(ms, mine, (raw) => {
        const e = easeInOut(raw);
        const x = dx * (1 - e);
        const y = dy * (1 - e) - lift * Math.sin(Math.PI * raw);
        tile.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      });
    }

    /** 접는 자리가 가운데에서 위아래로 자란다. */
    function pullAxis(): void {
      const midY = STRIP_TOP + CELL_H / 2;
      axisLine?.setAttribute('y1', String(midY));
      axisLine?.setAttribute('y2', String(midY));
      rootLabel?.setAttribute('opacity', '0');
    }

    function growAxis(raw: number): void {
      const midY = STRIP_TOP + CELL_H / 2;
      const e = easeInOut(raw);
      axisLine?.setAttribute('y1', (midY + (AXIS_TOP - midY) * e).toFixed(2));
      axisLine?.setAttribute('y2', (midY + (AXIS_BOTTOM - midY) * e).toFixed(2));
      rootLabel?.setAttribute('opacity', raw >= 1 ? '1' : e.toFixed(3));
    }

    /**
     * √n 너머가 덮인다. 접는 자리가 이 걸음에 처음 서면 **한 시계로 함께** 흐른다 —
     * "여기까지만 보면 저 너머는 덮인다" 가 한 뜻이라 시계를 둘로 나누지 않는다.
     */
    async function flowCover(
      scene: DivisorPairsSqrtScene,
      withAxis: boolean,
      mine: number,
    ): Promise<void> {
      const rect = washRect;
      const { full } = washSpanOf(layoutOf(scene));
      rect?.setAttribute('width', '0');
      if (withAxis) pullAxis();
      await animate(COVER_MS, mine, (raw) => {
        rect?.setAttribute('width', (full * easeOut(raw)).toFixed(2));
        if (withAxis) growAxis(raw);
      });
    }

    async function flow(
      next: DivisorPairsSqrtScene,
      prev: DivisorPairsSqrtScene | null,
      mine: number,
    ): Promise<void> {
      // `prev` 는 **무엇을 흐르게 할지 고르는 데만** 쓴다 (S-scene MUST).
      const axisIsNew = axisShown(next) && (prev === null || !axisShown(prev));
      switch (next.step?.kind) {
        case 'probe':
          return flowProbe(next, next.step.from, mine);
        case 'miss':
          return flowMiss(next, mine);
        case 'pair': {
          await flowPair(next, mine);
          if (!alive(mine) || !axisIsNew) return;
          pullAxis();
          await animate(AXIS_MS, mine, growAxis);
          return;
        }
        case 'cover':
          return flowCover(next, axisIsNew, mine);
        default:
          return;
      }
    }

    async function render(
      next: DivisorPairsSqrtScene,
      prev: DivisorPairsSqrtScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다 (S-scene MUST).
      if (!opts.animate) return;
      await flow(next, prev, mine);
      if (!alive(mine)) return;
      // 운동이 남긴 속성·보간 끝자리를 통째로 지운다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id); // 걸어 둔 것을 먼저 거두고
        timers.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
