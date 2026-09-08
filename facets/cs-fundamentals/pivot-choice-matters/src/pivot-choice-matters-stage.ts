/**
 * pivot-choice-matters-stage — 기준 하나에 얹힌 저울 두 대.
 *
 * 판 하나가 한 줄(lane)이다. 위에는 원래 줄의 자리 일곱(점선)이 남고, 아래에는
 * 받침 위에 저울대가 걸린다. 기준으로 뽑힌 칸은 줄에서 빠져 받침 아래로
 * 내려가 저울을 떠받치고, 나머지 칸들은 하나씩 왼팔·오른팔로 건너가 실린다.
 * 다 실리면 저울대가 개수 차이만큼 기운다 — 고르게 나뉘면 흔들리다 수평으로
 * 멎고, 한쪽에 몰리면 그쪽으로 쏠린 채 멎는다.
 *
 * 저울대의 길이는 두 줄에서 같다. 그래서 한 팔에 실린 칸의 길이를 두 판 사이에
 * 그대로 견줄 수 있고, 텅 빈 팔은 맨 저울대로 드러난다.
 *
 * projector 가 부르는 메서드:
 *   liftPivot / moveToArm / settleBeam / markRemaining / compareLanes /
 *   rewind / setCaption
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로 (줄 안에서의 상대 좌표)
const PAD_TOP = 8;
const CELL_H = 26;
const ROW_Y = 0;
const BEAM_Y = 72;
const ARM_TOP = BEAM_Y - CELL_H;
const FULCRUM_H = 12;
const FULCRUM_HALF_W = 11;
const PIVOT_Y = BEAM_Y + FULCRUM_H;
const BRACKET_Y = ARM_TOP - 9;
const LANE_H = 116;
const LANE_GAP = 18;
const CAPTION_BAND = 34;

// ── 가로. 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
const CELL_MAX_W = 46;
const SIDE_MIN = 16;
const CELL_INSET = 2;
const MEASURE_X = 10;
const MEASURE_Y = 19;

// ── 운동
const LIFT_MS = 340;
const MOVE_MS = 240;
const TILT_MS = 460;
const MOVE_ARC = 12;
/** 한쪽에 전부 몰렸을 때의 기움. 저울대 끝이 60px 넘게 벌어진다. */
const MAX_TILT_DEG = 6;
/** 멎기 전의 흔들림. 수평으로 끝나는 저울도 한 번은 움직이게 한다. */
const WOBBLE_DEG = 1.2;
const DIM_OPACITY = 0.42;

/** 두 판 기준 기본 높이. 판 수가 다르면 mount 에서 한 번 다시 잰다. */
const DEFAULT_H = PAD_TOP + 2 * LANE_H + LANE_GAP + CAPTION_BAND;

type ArmSide = 'left' | 'right';
type CellState = 'row' | 'pivot' | 'landed' | 'remaining';

type Cell = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
};

type Lane = {
  g: SVGGElement;
  beam: SVGGElement;
  brackets: SVGGElement;
  measure: SVGTextElement;
  cells: Cell[];
  placed: Map<number, ArmSide>;
  angle: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export const pivotChoiceMattersStageView: CanvasView = {
  canvas: { height: DEFAULT_H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);

    const initial = params.initialData ?? {};
    const values = readNumbers(initial.values);
    const laneCount = Array.isArray(initial.trials) ? initial.trials.length : 0;

    const W = PIECE_CANVAS_W;
    const n = Math.max(1, values.length);
    const laneN = Math.max(1, laneCount);

    // 한 팔에 최대 n-1 칸이 실릴 수 있다. 그 길이가 캔버스 반폭에 들어가도록
    // 칸 폭을 역산한다 — 남는 폭을 여백으로 버리지 않는다 (S-piece).
    const halfSpan = Math.max(1, n - 1) + 0.5;
    const pitch = Math.min(CELL_MAX_W, Math.floor((W / 2 - SIDE_MIN) / halfSpan));
    const cx = W / 2;
    const beamHalf = halfSpan * pitch;
    const pivotX = cx - pitch / 2;
    const rowX = (i: number): number => cx - (n * pitch) / 2 + i * pitch;
    const armX = (side: ArmSide, slot: number): number =>
      side === 'left' ? cx - pitch / 2 - slot * pitch : cx + pitch / 2 + (slot - 1) * pitch;

    // 세로는 여기서 한 번 정하고 재생 중에는 바꾸지 않는다 (S-view).
    const height = PAD_TOP + laneN * LANE_H + (laneN - 1) * LANE_GAP + CAPTION_BAND;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    let destroyed = false;

    /**
     * destroy 는 `destroyed` 플래그로 다음 회차 예약을 끊는다. 이미 걸려 있는 한
     * 프레임은 취소하지 않고 둔다 — 깨어나서 하는 일이 대기 중인 promise 를
     * 풀어 주는 것뿐이고, 그것을 끊으면 그 promise 를 기다리던 projector 와
     * algorithm 이 영영 매달린다. 떨어져 나간 노드는 건드리지 않는다.
     */
    function nextFrame(cb: () => void): void {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
      else setTimeout(cb, 16);
    }

    function animate(dur: number, frame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const start = now();
        const tick = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const p = Math.min(1, (now() - start) / dur);
          frame(p);
          if (p >= 1) resolve();
          else nextFrame(tick);
        };
        nextFrame(tick);
      });
    }

    // ── 그리기

    const root = el('g', {});
    svg.appendChild(root);

    function setPos(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    }

    function setCellState(cell: Cell, state: CellState): void {
      const fill =
        state === 'pivot' ? c.itemPivot : state === 'remaining' ? c.itemActive : c.itemDefault;
      const stroke =
        state === 'pivot'
          ? c.itemPivot
          : state === 'remaining'
            ? c.itemActive
            : state === 'landed'
              ? c.textMuted
              : c.border;
      const ink = state === 'pivot' || state === 'remaining' ? c.stateInk : c.text;
      cell.rect.setAttribute('fill', fill);
      cell.rect.setAttribute('stroke', stroke);
      cell.label.setAttribute('fill', ink);
    }

    function makeCell(value: number): Cell {
      const g = el('g', {});
      const rect = el('rect', {
        x: CELL_INSET,
        y: 0,
        width: pitch - CELL_INSET * 2,
        height: CELL_H,
        rx: 4,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: pitch / 2,
        y: CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      label.textContent = String(value);
      g.appendChild(rect);
      g.appendChild(label);
      return { g, rect, label };
    }

    const lanes: Lane[] = [];
    for (let i = 0; i < laneN; i++) {
      const top = PAD_TOP + i * (LANE_H + LANE_GAP);
      const g = el('g', { transform: `translate(0 ${top})`, opacity: 1 });

      for (let k = 0; k < n; k++) {
        g.appendChild(
          el('rect', {
            x: rowX(k) + CELL_INSET,
            y: ROW_Y,
            width: pitch - CELL_INSET * 2,
            height: CELL_H,
            rx: 4,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '3 3',
          }),
        );
      }

      const beam = el('g', {});
      beam.appendChild(
        el('line', {
          x1: cx - beamHalf,
          y1: BEAM_Y,
          x2: cx + beamHalf,
          y2: BEAM_Y,
          stroke: c.textMuted,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        }),
      );
      const brackets = el('g', {});
      beam.appendChild(brackets);
      g.appendChild(beam);

      g.appendChild(
        el('polygon', {
          points: `${cx},${BEAM_Y} ${cx - FULCRUM_HALF_W},${BEAM_Y + FULCRUM_H} ${cx + FULCRUM_HALF_W},${BEAM_Y + FULCRUM_H}`,
          fill: c.textMuted,
        }),
      );

      const measure = el('text', {
        x: MEASURE_X,
        y: MEASURE_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: c.text,
      });
      g.appendChild(measure);

      const cells = values.map((v, k) => {
        const cell = makeCell(v);
        setCellState(cell, 'row');
        setPos(cell.g, rowX(k), ROW_Y);
        g.appendChild(cell.g);
        return cell;
      });

      root.appendChild(g);
      lanes.push({ g, beam, brackets, measure, cells, placed: new Map(), angle: 0 });
    }

    const caption = el('text', {
      x: cx,
      y: height - 12,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 동작

    function tiltTo(lane: Lane, target: number): Promise<void> {
      const from = lane.angle;
      return animate(TILT_MS, (t) => {
        const eased = easeInOut(t);
        const swing = WOBBLE_DEG * Math.sin(t * Math.PI * 3) * (1 - t);
        const a = from + (target - from) * eased + swing;
        lane.angle = a;
        lane.beam.setAttribute('transform', `rotate(${a.toFixed(3)} ${cx} ${BEAM_Y})`);
      }).then(() => {
        lane.angle = target;
        lane.beam.setAttribute('transform', `rotate(${target.toFixed(3)} ${cx} ${BEAM_Y})`);
      });
    }

    function activate(index: number): void {
      lanes.forEach((lane, i) => {
        lane.g.setAttribute('opacity', i === index ? '1' : String(DIM_OPACITY));
      });
    }

    function drawBracket(lane: Lane, side: ArmSide, count: number): void {
      const x0 = side === 'left' ? cx - pitch / 2 - count * pitch : cx + pitch / 2;
      const x1 = x0 + count * pitch;
      lane.brackets.appendChild(
        el('path', {
          d: `M ${x0} ${BRACKET_Y + 6} L ${x0} ${BRACKET_Y} L ${x1} ${BRACKET_Y} L ${x1} ${BRACKET_Y + 6}`,
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }),
      );
    }

    return {
      destroy(): void {
        destroyed = true;
        root.remove();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async liftPivot(p: { lane: number; index: number }): Promise<void> {
        const lane = lanes[p.lane];
        const cell = lane?.cells[p.index];
        if (!lane || !cell) return;
        activate(p.lane);
        setCellState(cell, 'pivot');
        const fromX = rowX(p.index);
        await animate(LIFT_MS, (t) => {
          // 먼저 받침 위로 미끄러지고 그다음 내려앉는다.
          const slide = easeInOut(Math.min(1, t * 1.6));
          const drop = easeInOut(t);
          setPos(cell.g, fromX + (pivotX - fromX) * slide, ROW_Y + (PIVOT_Y - ROW_Y) * drop);
        });
      },

      async moveToArm(p: {
        lane: number;
        index: number;
        side: ArmSide;
        slot: number;
      }): Promise<void> {
        const lane = lanes[p.lane];
        const cell = lane?.cells[p.index];
        if (!lane || !cell) return;
        // 저울대에 실린다 — 이제부터 저울이 기울면 함께 돈다.
        lane.beam.appendChild(cell.g);
        lane.placed.set(p.index, p.side);
        setCellState(cell, 'landed');
        const fromX = rowX(p.index);
        const toX = armX(p.side, p.slot);
        await animate(MOVE_MS, (t) => {
          const e = easeInOut(t);
          const y = ROW_Y + (ARM_TOP - ROW_Y) * e - MOVE_ARC * Math.sin(Math.PI * t);
          setPos(cell.g, fromX + (toX - fromX) * e, y);
        });
      },

      async settleBeam(p: {
        lane: number;
        leftCount: number;
        rightCount: number;
      }): Promise<void> {
        const lane = lanes[p.lane];
        if (!lane) return;
        const load = p.leftCount + p.rightCount;
        const target = load === 0 ? 0 : (MAX_TILT_DEG * (p.rightCount - p.leftCount)) / load;
        await tiltTo(lane, target);
      },

      markRemaining(p: {
        lane: number;
        leftCount: number;
        rightCount: number;
        remaining: number;
        total: number;
      }): void {
        const lane = lanes[p.lane];
        if (!lane) return;
        lane.measure.textContent = `${p.total} → ${p.remaining}`;
        const arms: { side: ArmSide; count: number }[] = [
          { side: 'left', count: p.leftCount },
          { side: 'right', count: p.rightCount },
        ];
        for (const arm of arms) {
          if (arm.count === 0 || arm.count !== p.remaining) continue;
          drawBracket(lane, arm.side, arm.count);
          lane.placed.forEach((side, index) => {
            if (side !== arm.side) return;
            const cell = lane.cells[index];
            if (cell) setCellState(cell, 'remaining');
          });
        }
      },

      compareLanes(): void {
        for (const lane of lanes) lane.g.setAttribute('opacity', '1');
      },

      rewind(): void {
        caption.textContent = '';
        for (const lane of lanes) {
          lane.g.setAttribute('opacity', '1');
          lane.measure.textContent = '';
          lane.brackets.textContent = '';
          lane.placed.clear();
          lane.angle = 0;
          lane.beam.setAttribute('transform', `rotate(0 ${cx} ${BEAM_Y})`);
          lane.cells.forEach((cell, i) => {
            lane.g.appendChild(cell.g);
            setCellState(cell, 'row');
            setPos(cell.g, rowX(i), ROW_Y);
          });
        }
      },
    };
  },
};
