/**
 * load-factor-rehash-stage — 적재율과 재해싱 조각의 전용 시각화.
 *
 * ── 형태가 어디서 나왔는가 ────────────────────────────────────────────────
 * 동사는 "다시 뿌려진다" 이다. 판이 커지면 나누는 수가 달라지므로 자리를 다시
 * 셈해야 하고, 그래서 어떤 것은 자리가 바뀌고 어떤 것은 그대로 남는다.
 *
 * 그 "어떤 것" 을 가르는 것은 나머지에 붙는 **비트 하나**다. 열여섯으로 나눈
 * 나머지는 여덟으로 나눈 나머지에 비트가 하나 더 붙은 값이라, 그 비트가 0 이면
 * 자리가 그대로다. 그래서 넓힌 판을 한 줄로 늘어놓지 않고 **여덟 칸씩 두 줄로**
 * 접어 그린다. 열은 옛 자리(나머지 8), 줄은 새로 붙은 비트다. 모든 칩이 자기
 * 열에 머무르고 줄만 갈리므로, 화면에서 그 비트가 곧 위아래가 된다.
 *
 * 운동은 셋뿐이며 전부 위치가 변한다.
 *   - 여섯 번째 키가 판 위 대기 자리에서 자기 칸으로 내려앉는다.
 *   - 적재율 막대가 임계 눈금까지 차오르고, 판이 넓어지면 되돌아 짧아진다.
 *   - 판을 넓힐 때 둘째 줄이 첫 줄 밑에서 세로로 펼쳐진다.
 * 재계산은 칩이 **들렸다 앉는** 한 동작으로 그린다 — 같은 동작의 두 결과가
 * "제자리에 다시 앉음" 과 "아랫줄로 내려앉음" 이다.
 *
 * 색은 전부 design-tokens 경유 (S-view). 화면 문자는 params.t 경유 (C10) 이며,
 * 수식(`3076014 % 16 = 14`)과 키 이름은 표식이라 키를 만들지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표 ────────────────────────────────────────────────────────────────
// 크기는 캔버스 폭에서 역산하고 상수로는 상한만 둔다 (S-piece).

const W = PIECE_CANVAS_W;
const SIDE_MIN = 26;
const CELL_MAX_W = 78;

/** 넓힌 판을 접었을 때의 열 수 = 처음 판의 칸 수. 데이터가 정하지만 기본 8. */
const DEFAULT_COLS = 8;
const DEFAULT_ROWS = 2;

const GAUGE_Y = 18;
const GAUGE_H = 12;
const GAUGE_LABEL_W = 84;
const GAUGE_READOUT_W = 132;
const GAUGE_GAP = 10;

const WAIT_Y = 52;
const ROW0_Y = 94;
const ROW_H = 48;
const ROW_GAP = 8;

const CHIP_PAD = 5;
const CHIP_TOP = 17;
const CHIP_H = 26;
const CHIP_LIFT = 18;

const LIFT_MS = 280;
const MOVE_MS = 320;
const UNFOLD_MS = 420;
const GAUGE_MS = 380;

const RX = Number.parseInt(radii.sm, 10);

function boardBottom(rows: number): number {
  return ROW0_Y + rows * ROW_H + (rows - 1) * ROW_GAP;
}
function formulaY(rows: number): number {
  return boardBottom(rows) + 20;
}
function captionY(rows: number): number {
  return formulaY(rows) + 22;
}
function canvasHeight(rows: number): number {
  return captionY(rows) + 14;
}

function cellWidth(cols: number): number {
  return Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cols));
}
function boardOriginX(cols: number): number {
  return Math.round((W - cellWidth(cols) * cols) / 2);
}

// ── stage 계약 ──────────────────────────────────────────────────────────

/** projector 가 좁혀서 넘기는 키 하나 (C9). */
export type RehashStageKey = {
  key: string;
  masked: number;
  slotSmall: number;
  slotLarge: number;
};

export type RehashStageSetup = {
  buckets: number;
  grownBuckets: number;
  threshold: number;
  keys: RehashStageKey[];
  incoming: string;
};

export type RehashStageInsert = {
  key: string;
  masked: number;
  slot: number;
  buckets: number;
  count: number;
};

export type RehashStageGrow = {
  buckets: number;
  count: number;
};

export type RehashStageStep = {
  key: string;
  masked: number;
  buckets: number;
  from: number;
  to: number;
};

type ChipState = 'idle' | 'incoming' | 'checking' | 'moved' | 'kept';

type Chip = {
  group: SVGGElement;
  box: SVGRectElement;
  text: SVGTextElement;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 5/8 → "0.625", 6/16 → "0.375". 수식 표기이므로 표식이다 (C10). */
function ratioText(count: number, buckets: number): string {
  if (buckets <= 0) return '0';
  return String(Number((count / buckets).toFixed(3)));
}

export const loadFactorRehashStageView: CanvasView = {
  canvas: { height: canvasHeight(DEFAULT_ROWS) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    const root = svg('g', {});
    canvas.appendChild(root);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (ms: number, fn: () => void): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const clearTimers = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };

    // ── 적재율 게이지 ────────────────────────────────────────────────────
    const trackX = SIDE_MIN + GAUGE_LABEL_W;
    const trackW = W - SIDE_MIN - GAUGE_READOUT_W - GAUGE_GAP - trackX;

    const gaugeLabel = svg('text', { x: SIDE_MIN, y: GAUGE_Y + 10 });
    gaugeLabel.style.fontFamily = fonts.body;
    gaugeLabel.style.fontSize = fontSizes.sm;
    gaugeLabel.style.fill = c.textMuted;
    gaugeLabel.textContent = tr('label.loadFactor', 'load factor');
    root.appendChild(gaugeLabel);

    const track = svg('rect', {
      x: trackX,
      y: GAUGE_Y,
      width: trackW,
      height: GAUGE_H,
      rx: RX,
      fill: c.bgSubtle,
      stroke: c.border,
    });
    root.appendChild(track);

    const fillG = svg('g', {});
    fillG.style.transition = `transform ${GAUGE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    fillG.style.transform = `translate(${trackX}px, ${GAUGE_Y}px) scaleX(0)`;
    const fillBar = svg('rect', { x: 0, y: 0, width: trackW, height: GAUGE_H, fill: c.text });
    fillBar.style.transition = 'fill 200ms linear';
    fillG.appendChild(fillBar);
    root.appendChild(fillG);

    const tick = svg('line', { x1: 0, y1: GAUGE_Y - 4, x2: 0, y2: GAUGE_Y + GAUGE_H + 4 });
    tick.setAttribute('stroke', c.accent);
    tick.setAttribute('stroke-width', '2');
    root.appendChild(tick);

    const tickLabel = svg('text', { x: 0, y: GAUGE_Y - 8, 'text-anchor': 'middle' });
    tickLabel.style.fontFamily = fonts.mono;
    tickLabel.style.fontSize = fontSizes.xs;
    tickLabel.style.fill = c.textMuted;
    root.appendChild(tickLabel);

    const readout = svg('text', { x: W - SIDE_MIN, y: GAUGE_Y + 10, 'text-anchor': 'end' });
    readout.style.fontFamily = fonts.mono;
    readout.style.fontSize = fontSizes.sm;
    readout.style.fill = c.text;
    root.appendChild(readout);

    // ── 판 + 칩 ─────────────────────────────────────────────────────────
    const boardG = svg('g', {});
    root.appendChild(boardG);
    const chipG = svg('g', {});
    root.appendChild(chipG);

    // ── 계산식 줄 + 캡션 ────────────────────────────────────────────────
    const formula = svg('text', { x: W / 2, y: formulaY(DEFAULT_ROWS), 'text-anchor': 'middle' });
    formula.style.fontFamily = fonts.mono;
    formula.style.fontSize = fontSizes.sm;
    formula.style.fill = c.text;
    root.appendChild(formula);

    const caption = svg('text', { x: W / 2, y: captionY(DEFAULT_ROWS), 'text-anchor': 'middle' });
    caption.style.fontFamily = fonts.body;
    caption.style.fontSize = fontSizes.sm;
    caption.style.fill = c.textMuted;
    root.appendChild(caption);

    // ── 상태 ────────────────────────────────────────────────────────────
    let spec: RehashStageSetup | null = null;
    let cols = DEFAULT_COLS;
    let rows = DEFAULT_ROWS;
    let cellW = cellWidth(cols);
    let originX = boardOriginX(cols);
    /** 둘째 줄 이하를 담는 그룹. 세로로 펼쳐진다. */
    const growRows: { layer: SVGGElement; top: number }[] = [];
    const chips = new Map<string, Chip>();

    const chipW = (): number => cellW - CHIP_PAD * 2;
    const chipX = (col: number): number => originX + col * cellW + CHIP_PAD;
    const rowTop = (row: number): number => ROW0_Y + row * (ROW_H + ROW_GAP);
    const chipY = (row: number): number => rowTop(row) + CHIP_TOP;

    const fillFor = (state: ChipState): string => {
      if (state === 'incoming') return c.itemActive;
      if (state === 'checking') return c.itemComparing;
      if (state === 'moved') return c.itemSwapping;
      if (state === 'kept') return c.itemSorted;
      return c.itemDefault;
    };
    const inkFor = (state: ChipState): string => (state === 'idle' ? c.text : c.stateInk);

    const paint = (chip: Chip, state: ChipState): void => {
      chip.box.setAttribute('fill', fillFor(state));
      chip.text.style.fill = inkFor(state);
    };

    const place = (chip: Chip, x: number, y: number): void => {
      chip.group.style.transform = `translate(${x}px, ${y}px)`;
    };

    const setGauge = (count: number, buckets: number): void => {
      const ratio = buckets > 0 ? count / buckets : 0;
      const over = spec !== null && ratio >= spec.threshold - 1e-9;
      fillG.style.transform = `translate(${trackX}px, ${GAUGE_Y}px) scaleX(${Math.min(1, ratio)})`;
      fillBar.setAttribute('fill', over ? c.danger : c.text);
      readout.textContent = `${count} / ${buckets} = ${ratioText(count, buckets)}`;
    };

    const buildBoard = (): void => {
      while (boardG.firstChild) boardG.removeChild(boardG.firstChild);
      growRows.length = 0;

      for (let row = 0; row < rows; row++) {
        const layer = svg('g', {});
        const top = rowTop(row);
        for (let col = 0; col < cols; col++) {
          const x = originX + col * cellW;
          const cell = svg('rect', {
            x,
            y: row === 0 ? top : 0,
            width: cellW,
            height: ROW_H,
            rx: RX,
            fill: c.bg,
            stroke: c.border,
          });
          layer.appendChild(cell);

          const idx = svg('text', { x: x + 6, y: (row === 0 ? top : 0) + 15 });
          idx.style.fontFamily = fonts.mono;
          idx.style.fontSize = fontSizes.xs;
          idx.style.fill = c.textMuted;
          idx.textContent = String(row * cols + col);
          layer.appendChild(idx);
        }
        if (row > 0) {
          layer.style.transition = `transform ${UNFOLD_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
          layer.style.transform = `translate(0px, ${top}px) scaleY(0)`;
          growRows.push({ layer, top });
        }
        boardG.appendChild(layer);
      }
    };

    const buildChips = (keys: RehashStageKey[]): void => {
      while (chipG.firstChild) chipG.removeChild(chipG.firstChild);
      chips.clear();
      for (const k of keys) {
        const group = svg('g', {});
        group.style.transition =
          `transform ${MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms linear`;
        const box = svg('rect', {
          x: 0,
          y: 0,
          width: chipW(),
          height: CHIP_H,
          rx: RX,
          fill: c.itemDefault,
          stroke: c.border,
        });
        box.style.transition = 'fill 220ms linear';
        const text = svg('text', {
          x: chipW() / 2,
          y: CHIP_H / 2 + 4,
          'text-anchor': 'middle',
        });
        text.style.fontFamily = fonts.mono;
        text.style.fontSize = fontSizes.sm;
        text.style.fill = c.text;
        text.textContent = k.key;
        group.appendChild(box);
        group.appendChild(text);
        chipG.appendChild(group);
        chips.set(k.key, { group, box, text });
      }
    };

    /** 처음 상태 — 다섯이 좁은 판에 앉아 있고 여섯째는 아직 판 밖이다. */
    const showInitial = (): void => {
      if (!spec) return;
      clearTimers();
      for (const { layer, top } of growRows) {
        layer.style.transform = `translate(0px, ${top}px) scaleY(0)`;
      }
      for (const k of spec.keys) {
        const chip = chips.get(k.key);
        if (!chip) continue;
        if (k.key === spec.incoming) {
          chip.group.style.opacity = '0';
          place(chip, originX + CHIP_PAD, WAIT_Y);
          paint(chip, 'incoming');
        } else {
          chip.group.style.opacity = '1';
          place(chip, chipX(k.slotSmall), chipY(0));
          paint(chip, 'idle');
        }
      }
      setGauge(spec.keys.length - 1, spec.buckets);
      formula.textContent = '';
      caption.textContent = '';
    };

    const api = {
      setup(next: RehashStageSetup): void {
        spec = next;
        cols = Math.max(1, next.buckets);
        rows = Math.max(1, Math.round(next.grownBuckets / Math.max(1, next.buckets)));
        cellW = cellWidth(cols);
        originX = boardOriginX(cols);

        const h = canvasHeight(rows);
        canvas.setAttribute('viewBox', `0 0 ${W} ${h}`);
        formula.setAttribute('y', String(formulaY(rows)));
        caption.setAttribute('y', String(captionY(rows)));

        const tickX = trackX + trackW * next.threshold;
        tick.setAttribute('x1', String(tickX));
        tick.setAttribute('x2', String(tickX));
        tickLabel.setAttribute('x', String(tickX));
        tickLabel.textContent = String(next.threshold);

        buildBoard();
        buildChips(next.keys);
        showInitial();
      },

      reset(): void {
        showInitial();
      },

      insert(p: RehashStageInsert): void {
        const chip = chips.get(p.key);
        if (chip) {
          chip.group.style.opacity = '1';
          place(chip, chipX(p.slot), chipY(0));
          paint(chip, 'incoming');
        }
        formula.textContent = `${p.key}   ${p.masked} % ${p.buckets} = ${p.slot}`;
        setGauge(p.count, p.buckets);
      },

      grow(p: RehashStageGrow): void {
        for (const { layer, top } of growRows) {
          layer.style.transform = `translate(0px, ${top}px) scaleY(1)`;
        }
        formula.textContent = '';
        setGauge(p.count, p.buckets);
      },

      rehash(p: RehashStageStep): void {
        formula.textContent = `${p.key}   ${p.masked} % ${p.buckets} = ${p.to}`;
        const chip = chips.get(p.key);
        if (!chip) return;
        const fromRow = Math.floor(p.from / cols);
        const col = p.to % cols;
        const toRow = Math.floor(p.to / cols);
        paint(chip, 'checking');
        chip.group.style.transition =
          `transform ${LIFT_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms linear`;
        place(chip, chipX(col), chipY(fromRow) - CHIP_LIFT);
        after(LIFT_MS, () => {
          chip.group.style.transition =
            `transform ${MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms linear`;
          place(chip, chipX(col), chipY(toRow));
          paint(chip, p.from === p.to ? 'kept' : 'moved');
        });
      },

      finish(): void {
        formula.textContent = '';
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        clearTimers();
        chips.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };

    return api;
  },
};
