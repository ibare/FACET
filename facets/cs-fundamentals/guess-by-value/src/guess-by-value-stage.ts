/**
 * guess-by-value-stage — 두 줄이 같은 배열을 훑는 그림.
 *
 * 위 줄은 늘 가운데를 짚는다. 남은 구간을 덮는 막대가 있고, 커서가 그 가운데로
 * 뛰며, 짚을 때마다 절반이 떨어져 나간다 — 움직이는 것은 커서와 구간의 경계다.
 *
 * 아래 줄은 값으로 겨눈다. 양 끝 칸에서 위로 두 줄기가 솟아 **자**를 세우고,
 * 찾는 값을 담은 조각이 그 자를 따라 미끄러져 제 비율 자리에 멈춘다. 거기서
 * 아래로 선이 떨어져 칸 하나를 짚는다. 미끄러짐과 떨어짐, 두 움직임이 이 조각의
 * 동사다 — 비율이 자리 번호로 옮겨지는 순간.
 *
 * 자의 두 끝을 첫 칸과 끝 칸의 **한가운데**에 맞춰 두었으므로, 값이 고르게
 * 퍼져 있으면 비율 자리와 칸 한가운데가 정확히 겹쳐 선이 곧게 떨어진다.
 * 고르지 않으면 선이 꺾여 가까운 칸으로 옮겨 붙는다 — 화면은 그 사실을 숨기지
 * 않고 그대로 그린다. 왜 고른 배열에서만 잘 맞는지는 글이 밝힌다 (S-piece).
 *
 * 타이머: `tween` 이 rAF 를 건다. `destroy()` 가 destroyed 를 세우고 걸린 프레임을
 * 모두 취소하므로 마운트 밖으로 새는 반복은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 줄 이름. 위가 가운데를 짚는 쪽, 아래가 값으로 겨누는 쪽. */
export type GuessByValueLane = 'middle' | 'aim';

export type GuessByValueStageInstance = ViewInstance & {
  setup(values: number[], target: number): void;
  setCaption(text: string): void;
  setRange(lo: number, hi: number): Promise<void>;
  probe(lane: GuessByValueLane, index: number, count: number, hit: boolean): Promise<void>;
  discardHalf(lo: number, hi: number): Promise<void>;
  settleLane(lane: GuessByValueLane): Promise<void>;
  setScale(loIndex: number, hiIndex: number): Promise<void>;
  aimMeasure(loValue: number, hiValue: number, target: number, fraction: number): Promise<void>;
  aimLand(index: number, fraction: number): Promise<void>;
  finish(): Promise<void>;
  rewind(): void;
};

// ── 캔버스. 세로는 두 줄과 그 사이에 세운 자가 정한다. 마운트 뒤 바뀌지 않는다.
const STAGE_H = 300;

// ── 칸. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const CELL_H = 42;

// ── 세로 자리.
const LANE_A_TITLE_Y = 16;
const BRACKET_Y = 28;
const BRACKET_H = 6;
const CARET_H = 9;
const CELL_A_Y = 50;
const LANE_B_TITLE_Y = 120;
const FORMULA_Y = 148;
const RULER_Y = 180;
const CHIP_HALF_H = 12;
const CELL_B_Y = 224;
const CAPTION_Y = 286;

// ── 눈금표 (짚은 횟수).
const TALLY_X = 494;
const TALLY_GAP = 15;
const TALLY_R = 4;
const TALLY_COUNT_X = PIECE_CANVAS_W - 30;

// ── 걸음 안에서 일어나는 움직임의 길이. stepMs 위에 이것이 더해진다 (S-piece).
const CARET_MS = 300;
const SHRINK_MS = 360;
const RISE_MS = 260;
const RULER_MS = 340;
const SLIDE_MS = 480;
const DROP_MS = 380;
const PULSE_MS = 380;
const FADE_MS = 240;

type CellState = 'live' | 'dim' | 'probe' | 'hit';

type Cell = {
  group: SVGGElement;
  box: SVGRectElement;
  slot: SVGTextElement;
  value: SVGTextElement;
  cx: number;
};

type Tally = {
  group: SVGGElement;
  count: SVGTextElement;
  dots: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 0..1 을 부드럽게. 시작과 끝을 눌러 준다. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const guessByValueStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const frames = new Set<number>();

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          apply(1);
          resolve();
          return;
        }
        const start = performance.now();
        const frame = (now: number): void => {
          if (destroyed) {
            apply(1);
            resolve();
            return;
          }
          const raw = Math.min(1, (now - start) / ms);
          apply(ease(raw));
          if (raw < 1) frames.add(requestAnimationFrame(frame));
          else resolve();
        };
        frames.add(requestAnimationFrame(frame));
      });
    }

    /** 잠깐 부풀렸다 되돌린다. 눈을 끌어야 할 때만. */
    function pulse(node: SVGGraphicsElement, cx: number, cy: number): Promise<void> {
      return tween(PULSE_MS, (t) => {
        const s = 1 + 0.18 * Math.sin(Math.PI * t);
        node.setAttribute(
          'transform',
          `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`,
        );
      });
    }

    function fadeTo(node: SVGElement, to: number): Promise<void> {
      const from = Number(node.getAttribute('opacity') ?? '1');
      return tween(FADE_MS, (t) => {
        node.setAttribute('opacity', String(from + (to - from) * t));
      });
    }

    // ── 마운트 동안 유지되는 것들. setup / rewind 가 통째로 다시 짓는다.
    let values: number[] = [];
    let targetValue = 0;
    let cellW = 0;
    let originX = 0;
    let cellsA: Cell[] = [];
    let cellsB: Cell[] = [];
    let tallyA: Tally | null = null;
    let tallyB: Tally | null = null;
    let bracket: SVGRectElement | null = null;
    let caret: SVGPathElement | null = null;
    let caretX = 0;
    let ruler: SVGLineElement | null = null;
    let riserLo: SVGLineElement | null = null;
    let riserHi: SVGLineElement | null = null;
    let chip: SVGGElement | null = null;
    let chipX = 0;
    let formula: SVGTextElement | null = null;
    let drop: SVGPolylineElement | null = null;
    let dropTip: SVGPathElement | null = null;
    let caption: SVGTextElement | null = null;
    let scaleLo = 0;
    let scaleHi = 0;
    let root: SVGGElement | null = null;

    function centerX(index: number): number {
      return originX + index * cellW + cellW / 2;
    }

    function paintCell(cell: Cell, state: CellState): void {
      const fill =
        state === 'hit'
          ? c.itemPivot
          : state === 'probe'
            ? c.itemComparing
            : state === 'dim'
              ? c.bgSubtle
              : c.itemDefault;
      const stroke =
        state === 'hit' ? c.itemPivot : state === 'probe' ? c.itemComparing : c.border;
      const ink =
        state === 'hit' || state === 'probe'
          ? c.stateInk
          : state === 'dim'
            ? c.textMuted
            : c.text;
      cell.box.setAttribute('fill', fill);
      cell.box.setAttribute('stroke', stroke);
      cell.value.setAttribute('fill', ink);
      cell.slot.setAttribute('fill', state === 'live' ? c.textMuted : ink);
    }

    function buildCells(parent: SVGGElement, y: number): Cell[] {
      const out: Cell[] = [];
      for (let i = 0; i < values.length; i++) {
        const g = el('g', {});
        const box = el('rect', {
          x: originX + i * cellW + 1,
          y,
          width: cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        // 자리 번호와 값은 도식에 새겨진 숫자(표식)라 키를 만들지 않는다 (C10).
        const slot = el('text', {
          x: originX + i * cellW + 7,
          y: y + 14,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        slot.textContent = String(i);
        const value = el('text', {
          x: centerX(i),
          y: y + 31,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        value.textContent = String(values[i]);
        g.append(box, slot, value);
        parent.appendChild(g);
        out.push({ group: g, box, slot, value, cx: centerX(i) });
      }
      return out;
    }

    function buildTally(parent: SVGGElement, titleY: number): Tally {
      const g = el('g', {});
      const count = el('text', {
        x: TALLY_COUNT_X,
        y: titleY,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '700',
        fill: c.text,
      });
      count.textContent = '0';
      g.appendChild(count);
      parent.appendChild(g);
      return { group: g, count, dots: 0 };
    }

    /** 짚은 횟수는 알고리즘이 센 값을 그대로 적는다. */
    function markTally(tally: Tally, titleY: number, count: number): void {
      while (tally.dots < count) {
        tally.group.appendChild(
          el('circle', {
            cx: TALLY_X + tally.dots * TALLY_GAP,
            cy: titleY - 5,
            r: TALLY_R,
            fill: c.text,
          }),
        );
        tally.dots += 1;
      }
      tally.count.textContent = String(count);
    }

    function laneTitle(parent: SVGGElement, y: number, text: string): void {
      const node = el('text', {
        x: originX,
        y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c.text,
      });
      node.textContent = text;
      parent.appendChild(node);
    }

    function build(): void {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = el('g', {});
      svg.appendChild(root);

      const n = values.length;
      if (n === 0) return;
      cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n));
      originX = Math.round((PIECE_CANVAS_W - n * cellW) / 2);

      // ── 위 줄: 늘 가운데를 짚는 쪽.
      laneTitle(root, LANE_A_TITLE_Y, tr('label.laneMiddle', 'Always the middle'));
      tallyA = buildTally(root, LANE_A_TITLE_Y);
      bracket = el('rect', {
        x: originX,
        y: BRACKET_Y,
        width: 0,
        height: BRACKET_H,
        rx: BRACKET_H / 2,
        fill: c.textMuted,
        opacity: 0,
      });
      root.appendChild(bracket);
      cellsA = buildCells(root, CELL_A_Y);
      caretX = centerX(0);
      caret = el('path', {
        d: `M -8 ${CELL_A_Y - CARET_H} L 8 ${CELL_A_Y - CARET_H} L 0 ${CELL_A_Y - 1} Z`,
        fill: c.itemComparing,
        opacity: 0,
        transform: `translate(${caretX} 0)`,
      });
      root.appendChild(caret);

      // ── 아래 줄: 값으로 겨누는 쪽.
      laneTitle(root, LANE_B_TITLE_Y, tr('label.laneAim', 'Aim by value'));
      tallyB = buildTally(root, LANE_B_TITLE_Y);
      formula = el('text', {
        x: originX,
        y: FORMULA_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
        opacity: 0,
      });
      root.appendChild(formula);
      riserLo = el('line', {
        x1: centerX(0),
        y1: CELL_B_Y,
        x2: centerX(0),
        y2: CELL_B_Y,
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      riserHi = el('line', {
        x1: centerX(n - 1),
        y1: CELL_B_Y,
        x2: centerX(n - 1),
        y2: CELL_B_Y,
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      ruler = el('line', {
        x1: centerX(0),
        y1: RULER_Y,
        x2: centerX(0),
        y2: RULER_Y,
        stroke: c.text,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      root.append(riserLo, riserHi, ruler);

      drop = el('polyline', {
        points: '',
        fill: 'none',
        stroke: c.text,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      dropTip = el('path', { d: '', fill: c.text, opacity: 0 });
      root.append(drop, dropTip);

      cellsB = buildCells(root, CELL_B_Y);

      const chipW = 26 + String(targetValue).length * 10;
      chipX = centerX(0);
      chip = el('g', { opacity: 0, transform: `translate(${chipX} ${RULER_Y})` });
      const chipBox = el('rect', {
        x: -chipW / 2,
        y: -CHIP_HALF_H,
        width: chipW,
        height: CHIP_HALF_H * 2,
        rx: 6,
        fill: c.itemPivot,
        stroke: c.itemPivot,
        'stroke-width': 1.5,
      });
      const chipLabel = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': '700',
        fill: c.stateInk,
      });
      chipLabel.textContent = String(targetValue);
      chip.append(chipBox, chipLabel);
      root.appendChild(chip);

      caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      root.appendChild(caption);

      scaleLo = 0;
      scaleHi = n - 1;
    }

    // ── Projector 가 부르는 표면.

    function setup(nextValues: number[], nextTarget: number): void {
      values = [...nextValues];
      targetValue = nextTarget;
      build();
    }

    function setCaption(text: string): void {
      if (caption) caption.textContent = text;
    }

    async function setRange(lo: number, hi: number): Promise<void> {
      if (!bracket || !caret) return;
      bracket.setAttribute('x', String(originX + lo * cellW + 1));
      bracket.setAttribute('width', String(Math.max(0, (hi - lo + 1) * cellW - 2)));
      for (let i = 0; i < cellsA.length; i++) {
        paintCell(cellsA[i], i >= lo && i <= hi ? 'live' : 'dim');
      }
      caretX = centerX(lo);
      caret.setAttribute('transform', `translate(${caretX} 0)`);
      await Promise.all([fadeTo(bracket, 1), fadeTo(caret, 1)]);
    }

    async function moveCaret(toX: number): Promise<void> {
      const fromX = caretX;
      caretX = toX;
      await tween(CARET_MS, (t) => {
        caret?.setAttribute('transform', `translate(${fromX + (toX - fromX) * t} 0)`);
      });
    }

    async function probe(
      lane: GuessByValueLane,
      index: number,
      count: number,
      hit: boolean,
    ): Promise<void> {
      const cells = lane === 'middle' ? cellsA : cellsB;
      const tally = lane === 'middle' ? tallyA : tallyB;
      const titleY = lane === 'middle' ? LANE_A_TITLE_Y : LANE_B_TITLE_Y;
      const laneY = lane === 'middle' ? CELL_A_Y : CELL_B_Y;
      const cell = cells[index];
      if (!cell) return;
      if (lane === 'middle') await moveCaret(cell.cx);
      paintCell(cell, hit ? 'hit' : 'probe');
      if (tally) markTally(tally, titleY, count);
      await pulse(cell.group, cell.cx, laneY + CELL_H / 2);
    }

    async function discardHalf(lo: number, hi: number): Promise<void> {
      if (!bracket) return;
      const fromX = Number(bracket.getAttribute('x') ?? '0');
      const fromW = Number(bracket.getAttribute('width') ?? '0');
      const toX = originX + lo * cellW + 1;
      const toW = Math.max(0, (hi - lo + 1) * cellW - 2);
      // 짚은 값이 어긋나면 구간의 한쪽 경계가 미끄러져 절반이 떨어져 나간다.
      await tween(SHRINK_MS, (t) => {
        bracket?.setAttribute('x', String(fromX + (toX - fromX) * t));
        bracket?.setAttribute('width', String(fromW + (toW - fromW) * t));
      });
      for (let i = 0; i < cellsA.length; i++) {
        paintCell(cellsA[i], i >= lo && i <= hi ? 'live' : 'dim');
      }
    }

    async function settleLane(lane: GuessByValueLane): Promise<void> {
      // 겨누는 쪽은 자와 떨어진 선을 그대로 남긴다 — 그것이 이 줄의 기록이다.
      if (lane !== 'middle') return;
      const jobs: Promise<void>[] = [];
      if (bracket) jobs.push(fadeTo(bracket, 0));
      if (caret) jobs.push(fadeTo(caret, 0));
      await Promise.all(jobs);
    }

    async function setScale(loIndex: number, hiIndex: number): Promise<void> {
      scaleLo = loIndex;
      scaleHi = hiIndex;
      for (let i = 0; i < cellsB.length; i++) {
        paintCell(cellsB[i], i >= loIndex && i <= hiIndex ? 'live' : 'dim');
      }
      if (drop) drop.setAttribute('points', '');
      if (dropTip) dropTip.setAttribute('opacity', '0');
      if (formula) formula.setAttribute('opacity', '0');

      const x0 = centerX(loIndex);
      const x1 = centerX(hiIndex);
      if (!riserLo || !riserHi || !ruler || !chip) return;
      for (const node of [riserLo, riserHi]) {
        node.setAttribute('y1', String(CELL_B_Y));
        node.setAttribute('y2', String(CELL_B_Y));
      }
      riserLo.setAttribute('x1', String(x0));
      riserLo.setAttribute('x2', String(x0));
      riserHi.setAttribute('x1', String(x1));
      riserHi.setAttribute('x2', String(x1));
      // 두 끝 칸에서 자가 솟는다 — 자의 끝이 곧 그 두 값이라는 말.
      await tween(RISE_MS, (t) => {
        const y = CELL_B_Y + (RULER_Y - CELL_B_Y) * t;
        riserLo?.setAttribute('y2', String(y));
        riserHi?.setAttribute('y2', String(y));
      });
      ruler.setAttribute('x1', String(x0));
      ruler.setAttribute('x2', String(x0));
      await tween(RULER_MS, (t) => {
        ruler?.setAttribute('x2', String(x0 + (x1 - x0) * t));
      });
      chipX = x0;
      chip.setAttribute('transform', `translate(${chipX} ${RULER_Y})`);
      await fadeTo(chip, 1);
    }

    async function aimMeasure(
      loValue: number,
      hiValue: number,
      target: number,
      fraction: number,
    ): Promise<void> {
      const span = scaleHi - scaleLo;
      // 수식 표기는 표식이다 — 값만 실측에서 채우고 키를 만들지 않는다 (C10).
      const head = scaleLo > 0 ? `${scaleLo} + ` : '';
      if (formula) {
        formula.textContent =
          `${head}(${target} − ${loValue}) / (${hiValue} − ${loValue}) × ${span}`;
        formula.setAttribute('opacity', '1');
      }
      const x0 = centerX(scaleLo);
      const x1 = centerX(scaleHi);
      const fromX = chipX;
      const toX = x0 + (x1 - x0) * fraction;
      chipX = toX;
      // 찾는 값이 자 위를 미끄러져 제 비율 자리에 선다. 이 미끄러짐이 「겨눔」이다.
      await tween(SLIDE_MS, (t) => {
        chip?.setAttribute('transform', `translate(${fromX + (toX - fromX) * t} ${RULER_Y})`);
      });
    }

    async function aimLand(index: number, fraction: number): Promise<void> {
      if (formula) formula.textContent = `${formula.textContent ?? ''} = ${index}`;

      const x0 = centerX(scaleLo);
      const x1 = centerX(scaleHi);
      const sx = x0 + (x1 - x0) * fraction;
      const tx = centerX(index);
      const startY = RULER_Y + CHIP_HALF_H;
      const midY = (startY + CELL_B_Y) / 2;
      // 비율 자리에서 곧게 내려오고, 칸 한가운데와 어긋나면 그만큼 꺾여 붙는다.
      const seg: [number, number][] = [
        [sx, startY],
        [sx, midY],
        [tx, midY],
        [tx, CELL_B_Y],
      ];
      const lens = [midY - startY, Math.abs(tx - sx), CELL_B_Y - midY];
      const total = lens[0] + lens[1] + lens[2];
      if (!drop) return;
      await tween(DROP_MS, (t) => {
        let left = total * t;
        const pts: string[] = [`${seg[0][0]},${seg[0][1]}`];
        for (let i = 0; i < 3; i++) {
          const take = Math.min(left, lens[i]);
          const r = lens[i] === 0 ? 1 : take / lens[i];
          pts.push(
            `${seg[i][0] + (seg[i + 1][0] - seg[i][0]) * r},` +
              `${seg[i][1] + (seg[i + 1][1] - seg[i][1]) * r}`,
          );
          left -= take;
          if (left <= 0) break;
        }
        drop?.setAttribute('points', pts.join(' '));
      });
      if (dropTip) {
        dropTip.setAttribute(
          'd',
          `M ${tx - 6} ${CELL_B_Y - 9} L ${tx + 6} ${CELL_B_Y - 9} L ${tx} ${CELL_B_Y - 1} Z`,
        );
        await fadeTo(dropTip, 1);
      }
    }

    async function finish(): Promise<void> {
      // 마지막 걸음에서 눈금표 둘을 함께 부풀린다 — 견줄 것은 그 두 수다.
      const cx = (TALLY_X + TALLY_COUNT_X) / 2;
      const jobs: Promise<void>[] = [];
      if (tallyA) jobs.push(pulse(tallyA.group, cx, LANE_A_TITLE_Y - 5));
      if (tallyB) jobs.push(pulse(tallyB.group, cx, LANE_B_TITLE_Y - 5));
      await Promise.all(jobs);
    }

    function rewind(): void {
      build();
    }

    const instance: GuessByValueStageInstance = {
      setup,
      setCaption,
      setRange,
      probe,
      discardHalf,
      settleLane,
      setScale,
      aimMeasure,
      aimLand,
      finish,
      rewind,
      destroy() {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
      },
    };
    return instance;
  },
};
