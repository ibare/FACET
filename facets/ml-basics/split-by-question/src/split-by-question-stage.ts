/**
 * split-by-question-stage — 자름선 하나가 축 위를 미끄러지다가, 갈아 세워진다.
 *
 * 주인공은 점 무리가 아니라 **자름선**이다. 점은 자름선이 지나가는 자리이고,
 * 자름선은 자기가 무엇을 갈랐는지를 두 개의 저울(chip)에 매달고 다닌다. 저울은
 * 담긴 수만큼 길어지고 이름표 비율만큼 나뉘므로, 자리를 옮겨도 나뉜 자리가
 * 한가운데에서 꿈쩍하지 않는 것이 곧 "아무리 옮겨도 반반" 이다.
 *
 * 축을 갈아 세우는 대목은 색 전환이 아니라 **회전**이다. 자름선이 축 위를 돌며
 * 길이를 바꾸고, 손잡이(knob)가 가로 레일을 떠나 세로 레일에 내려앉는다.
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언이 주는 것은 점 · 이름표 · 시도할
 * 자름 자리뿐이고, 그것이 화면 어디에 놓이는지는 캔버스에서 역산한다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 세로 rail 과 눈금 글자가 들어갈 왼쪽 자리. */
const SIDE_L = 52;
const SIDE_R = 26;
const PLOT_T = 50;
const PLOT_H = 208;
/** 레일이 그림에서 떨어진 거리. */
const RAIL_GAP = 16;
const RAIL_Y_X = 30;
const TICK_LEN = 12;
const CANVAS_H = 300;

/** 저울의 최대 가로 — 점을 전부 담았을 때. 나머지는 캔버스에서 역산한다. */
const CHIP_MAX_W = 112;
const CHIP_BAR_H = 13;
/** 저울 한 덩이(막대 + 비율 글자)의 절반 높이. */
const CHIP_HALF_H = 13;
const CHIP_GAP = 14;
const CHIP_GAP_V = 13;

const POINT_R = 5;

/**
 * 축을 가리키는 기호. 수식 표기라 번역하지 않는다 (C10 표식 판정 3).
 */
const AXIS_MARK = { x: 'x', y: 'y' } as const;

/**
 * 두 이름표의 식별 색을 뽑는 자리 (S-view 결정 트리 3 — categorical).
 * 이 시드를 다른 view 가 같은 뜻으로 재현할 일이 없으므로 인덱스는 view-local 이다.
 */
const CLASS_LOW_INDEX = 0;
const CLASS_HIGH_INDEX = 1;

const MOVE_MS = 520;
const ROTATE_MS = 780;
const RAISE_MS = 380;
const SWEEP_MS = 760;
const LABEL_MS = 180;
const FRAME_MS = 16;

type Axis = 'x' | 'y';
type Side = { a: number; b: number };
type Point = { x: number; y: number; label: string };

type SetupInput = {
  points: Point[];
  classes: [string, string];
  xCuts: number[];
  yCuts: number[];
};

type CutInput = {
  axis: Axis;
  threshold: number;
  low: Side;
  high: Side;
  pure: boolean;
  caption: string;
};

/**
 * 자름선의 상태.
 *
 * 각도 0 은 세로로 선 것, -90 은 눕힌 것이다. 부호가 음인 것은 손잡이 때문이다 —
 * 방향벡터를 (sin, cos) 로 두면 0 에서 아래 끝, -90 에서 왼 끝이 **같은 끝**이라
 * 손잡이가 도는 내내 날에 붙어 있다. +90 으로 돌리면 손잡이가 반대 끝으로
 * 건너뛰어야 해서 중간에 날에서 떨어져 나간다.
 *
 * knobOut 은 날 끝에서 레일까지의 거리다.
 */
type Blade = {
  cx: number;
  cy: number;
  angle: number;
  len: number;
  knobOut: number;
};

export type SplitByQuestionStageInstance = ViewInstance & {
  setup(input: SetupInput): void;
  say(caption: string): void;
  reset(): void;
  pickAxis(input: { axis: Axis; caption: string }): Promise<void>;
  tryCut(input: CutInput): Promise<void>;
  showExhausted(input: { caption: string }): Promise<void>;
  finish(input: { caption: string }): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function mount(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): SplitByQuestionStageInstance {
  const canvas = params.canvas;
  // 러너가 붙여 준 캔버스는 그대로 두고 **안쪽만** 비운다 (S-view).
  canvas.textContent = '';

  const c = getColors(params.theme);
  const classPalette = categorical(2, 'vivid');
  const colorLow = classPalette[CLASS_LOW_INDEX] ?? c.itemDefault;
  const colorHigh = classPalette[CLASS_HIGH_INDEX] ?? c.itemDefault;

  const W = PIECE_CANVAS_W;
  const plotL = SIDE_L;
  const plotR = W - SIDE_R;
  const plotW = plotR - plotL;
  const plotB = PLOT_T + PLOT_H;
  const railXY = plotB + RAIL_GAP;
  const midX = (plotL + plotR) / 2;
  const midY = PLOT_T + PLOT_H / 2;

  // ── 레이어. 뒤에서 앞 순서.
  const gRegions = el('g', {});
  const gRails = el('g', {});
  const gGhosts = el('g', {});
  const gPoints = el('g', {});
  const gBlade = el('g', {});
  const gChips = el('g', {});
  canvas.append(gRegions, gRails, gGhosts, gPoints, gBlade, gChips);

  const caption = el('text', {
    x: W / 2,
    y: 24,
    'text-anchor': 'middle',
    fill: c.text,
    'font-family': fonts.body,
    'font-size': fontSizes.md,
  });
  canvas.appendChild(caption);

  const regionLow = el('rect', { x: plotL, y: PLOT_T, width: 0, height: PLOT_H, fill: c.subtreeShadeLeft });
  const regionHigh = el('rect', { x: plotL, y: PLOT_T, width: 0, height: PLOT_H, fill: c.subtreeShadeRight });
  gRegions.append(regionLow, regionHigh);

  const railX = el('line', {
    x1: plotL, y1: railXY, x2: plotR, y2: railXY,
    stroke: c.border, 'stroke-width': 3, 'stroke-linecap': 'round',
  });
  const railY = el('line', {
    x1: RAIL_Y_X, y1: PLOT_T, x2: RAIL_Y_X, y2: plotB,
    stroke: c.border, 'stroke-width': 3, 'stroke-linecap': 'round',
  });
  const markX = el('text', {
    x: plotR + 10, y: railXY + 4, 'text-anchor': 'middle',
    fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
  });
  markX.textContent = AXIS_MARK.x;
  const markY = el('text', {
    x: RAIL_Y_X, y: PLOT_T - 9, 'text-anchor': 'middle',
    fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
  });
  markY.textContent = AXIS_MARK.y;
  const gTicks = el('g', {});
  gRails.append(railX, railY, markX, markY, gTicks);

  const blade = el('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: c.risingMarker, 'stroke-width': 3, 'stroke-linecap': 'round',
    opacity: 0,
  });
  const knob = el('circle', {
    cx: 0, cy: 0, r: 5, fill: c.risingMarker, opacity: 0,
  });
  gBlade.append(blade, knob);

  function makeChip(): {
    group: SVGGElement;
    partA: SVGRectElement;
    partB: SVGRectElement;
    frame: SVGRectElement;
    ratio: SVGTextElement;
  } {
    const group = el('g', { opacity: 0 });
    const partA = el('rect', { x: 0, y: 0, width: 0, height: CHIP_BAR_H, fill: colorLow });
    const partB = el('rect', { x: 0, y: 0, width: 0, height: CHIP_BAR_H, fill: colorHigh });
    const frame = el('rect', {
      x: 0, y: 0, width: 0, height: CHIP_BAR_H, rx: 2,
      fill: 'none', stroke: c.border, 'stroke-width': 1,
    });
    const ratio = el('text', {
      x: 0, y: 0, 'text-anchor': 'middle',
      fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
    });
    group.append(partA, partB, frame, ratio);
    gChips.appendChild(group);
    return { group, partA, partB, frame, ratio };
  }

  const chipLow = makeChip();
  const chipHigh = makeChip();

  // ── 손대는 것들. destroy 에서 일괄로 거둔다 (S-piece).
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();

  function tween(duration: number, eased: boolean, onFrame: (t: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      if (destroyed || duration <= 0) {
        onFrame(1);
        resolve();
        return;
      }
      const started = Date.now();
      const finish = (): void => {
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const tick = (): void => {
        if (destroyed) {
          finish();
          return;
        }
        const p = Math.min(1, (Date.now() - started) / duration);
        onFrame(eased ? easeInOut(p) : p);
        if (p >= 1) {
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

  // ── 선언이 주는 구조. setup 으로 채워진다.
  let points: Point[] = [];
  let classes: [string, string] = ['', ''];
  let xCuts: number[] = [];
  let yCuts: number[] = [];
  let xMin = 0;
  let xMax = 1;
  let yMin = 0;
  let yMax = 1;

  const xPix = (v: number): number => plotL + ((v - xMin) / (xMax - xMin)) * plotW;
  const yPix = (v: number): number => plotB - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  function homeBlade(axis: Axis): Blade {
    return axis === 'x' ? bladeAt('x', xMin) : bladeAt('y', yMax);
  }

  function bladeAt(axis: Axis, value: number): Blade {
    if (axis === 'x') {
      return { cx: xPix(value), cy: midY, angle: 0, len: PLOT_H, knobOut: RAIL_GAP };
    }
    return {
      cx: midX, cy: yPix(value), angle: -90, len: plotW, knobOut: plotL - RAIL_Y_X,
    };
  }

  /**
   * 그림 안에 담기는 반길이. 도는 동안 날이 그림 밖으로 삐져나가 캡션까지
   * 가로지르는 것을 막는다. 눕거나 선 상태에서는 원래 길이 그대로다.
   */
  function fitHalf(cx: number, cy: number, dx: number, dy: number, halfMax: number): number {
    let half = halfMax;
    const limit = (pos: number, comp: number, lo: number, hi: number): void => {
      if (Math.abs(comp) < 1e-6) return;
      half = Math.min(half, Math.abs(((comp > 0 ? hi : lo) - pos) / comp));
      half = Math.min(half, Math.abs(((comp > 0 ? lo : hi) - pos) / comp));
    };
    limit(cx, dx, plotL, plotR);
    limit(cy, dy, PLOT_T, plotB);
    return Math.max(0, half);
  }

  // ── 그때그때의 화면 상태.
  let bladeState: Blade = { cx: plotL, cy: midY, angle: 0, len: PLOT_H, knobOut: RAIL_GAP };
  let bladeOn = false;
  let regionsOn = false;
  /** 축을 갈아 세우는 동안에는 저울을 내려놓는다. */
  let chipsHidden = false;
  let shownLow: Side = { a: 0, b: 0 };
  let shownHigh: Side = { a: 0, b: 0 };
  const tickNodes = new Map<string, SVGLineElement>();
  const ghostNodes: SVGLineElement[] = [];

  function chipWidth(count: number): number {
    const total = points.length || 1;
    return (count / total) * CHIP_MAX_W;
  }

  function drawChip(
    chip: ReturnType<typeof makeChip>,
    side: Side,
    which: 'low' | 'high',
  ): void {
    const count = side.a + side.b;
    if (chipsHidden || !bladeOn || count <= 0.02) {
      chip.group.setAttribute('opacity', '0');
      return;
    }
    chip.group.setAttribute('opacity', '1');
    const barW = chipWidth(count);
    let cx: number;
    let cy: number;
    if (Math.abs(bladeState.angle) < 45) {
      const dir = which === 'low' ? -1 : 1;
      cx = clamp(
        bladeState.cx + dir * (CHIP_GAP + barW / 2),
        plotL + barW / 2 + 2,
        plotR - barW / 2 - 2,
      );
      cy = midY;
    } else {
      // 눕힌 자름선에서는 low 가 아래쪽 — 화면 좌표로는 py 가 큰 쪽이다.
      const dir = which === 'low' ? 1 : -1;
      cx = midX;
      cy = clamp(
        bladeState.cy + dir * (CHIP_GAP_V + CHIP_HALF_H),
        PLOT_T + CHIP_HALF_H + 2,
        plotB - CHIP_HALF_H + 4,
      );
    }
    const left = cx - barW / 2;
    const top = cy - CHIP_HALF_H;
    const aW = (side.a / count) * barW;
    chip.partA.setAttribute('x', String(left));
    chip.partA.setAttribute('y', String(top));
    chip.partA.setAttribute('width', String(Math.max(0, aW)));
    chip.partB.setAttribute('x', String(left + aW));
    chip.partB.setAttribute('y', String(top));
    chip.partB.setAttribute('width', String(Math.max(0, barW - aW)));
    chip.frame.setAttribute('x', String(left));
    chip.frame.setAttribute('y', String(top));
    chip.frame.setAttribute('width', String(Math.max(0, barW)));
    chip.ratio.setAttribute('x', String(cx));
    chip.ratio.setAttribute('y', String(cy + 11));
  }

  function render(): void {
    const rad = (bladeState.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = Math.cos(rad);
    const half = fitHalf(bladeState.cx, bladeState.cy, dx, dy, bladeState.len / 2);
    blade.setAttribute('x1', String(bladeState.cx - dx * half));
    blade.setAttribute('y1', String(bladeState.cy - dy * half));
    blade.setAttribute('x2', String(bladeState.cx + dx * half));
    blade.setAttribute('y2', String(bladeState.cy + dy * half));
    blade.setAttribute('opacity', bladeOn ? '1' : '0');
    // 손잡이는 날 끝에 붙어 레일 위에 올라앉는다.
    knob.setAttribute('cx', String(bladeState.cx + dx * (half + bladeState.knobOut)));
    knob.setAttribute('cy', String(bladeState.cy + dy * (half + bladeState.knobOut)));
    knob.setAttribute('opacity', bladeOn ? '1' : '0');

    if (!regionsOn) {
      regionLow.setAttribute('width', '0');
      regionHigh.setAttribute('width', '0');
    } else if (Math.abs(bladeState.angle) < 45) {
      regionLow.setAttribute('x', String(plotL));
      regionLow.setAttribute('y', String(PLOT_T));
      regionLow.setAttribute('width', String(Math.max(0, bladeState.cx - plotL)));
      regionLow.setAttribute('height', String(PLOT_H));
      regionHigh.setAttribute('x', String(bladeState.cx));
      regionHigh.setAttribute('y', String(PLOT_T));
      regionHigh.setAttribute('width', String(Math.max(0, plotR - bladeState.cx)));
      regionHigh.setAttribute('height', String(PLOT_H));
    } else {
      regionLow.setAttribute('x', String(plotL));
      regionLow.setAttribute('y', String(bladeState.cy));
      regionLow.setAttribute('width', String(plotW));
      regionLow.setAttribute('height', String(Math.max(0, plotB - bladeState.cy)));
      regionHigh.setAttribute('x', String(plotL));
      regionHigh.setAttribute('y', String(PLOT_T));
      regionHigh.setAttribute('width', String(plotW));
      regionHigh.setAttribute('height', String(Math.max(0, bladeState.cy - PLOT_T)));
    }

    drawChip(chipLow, shownLow, 'low');
    drawChip(chipHigh, shownHigh, 'high');
  }

  function setRatioText(low: Side, high: Side, pure: boolean): void {
    // 수 두 개와 콜론뿐이라 문안이 아니라 표식이다 (C10 표식 판정 3).
    chipLow.ratio.textContent = `${low.a} : ${low.b}`;
    chipHigh.ratio.textContent = `${high.a} : ${high.b}`;
    for (const chip of [chipLow, chipHigh]) {
      chip.frame.setAttribute('stroke', pure ? c.accent : c.border);
      chip.frame.setAttribute('stroke-width', pure ? '2' : '1');
      chip.ratio.setAttribute('fill', pure ? c.text : c.textMuted);
    }
  }

  function clearRatioText(): void {
    chipLow.ratio.textContent = '';
    chipHigh.ratio.textContent = '';
  }

  function tickKey(axis: Axis, value: number): string {
    return `${axis}:${value}`;
  }

  function drawTicks(axis: Axis): void {
    const values = axis === 'x' ? xCuts : yCuts;
    for (const value of values) {
      const key = tickKey(axis, value);
      if (tickNodes.has(key)) continue;
      const line =
        axis === 'x'
          ? el('line', {
              x1: xPix(value), y1: railXY - TICK_LEN / 2,
              x2: xPix(value), y2: railXY + TICK_LEN / 2,
              stroke: c.border, 'stroke-width': 2,
            })
          : el('line', {
              x1: RAIL_Y_X - TICK_LEN / 2, y1: yPix(value),
              x2: RAIL_Y_X + TICK_LEN / 2, y2: yPix(value),
              stroke: c.border, 'stroke-width': 2,
            });
      const label =
        axis === 'x'
          ? el('text', {
              x: xPix(value), y: railXY + 20, 'text-anchor': 'middle',
              fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
            })
          : el('text', {
              x: RAIL_Y_X - 7, y: yPix(value) + 4, 'text-anchor': 'end',
              fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
            });
      // 눈금값 — 수 표기라 표식이다 (C10).
      label.textContent = String(value);
      gTicks.append(line, label);
      tickNodes.set(key, line);
    }
  }

  function setRail(axis: Axis): void {
    railX.setAttribute('stroke', axis === 'x' ? c.risingMarker : c.border);
    railY.setAttribute('stroke', axis === 'y' ? c.risingMarker : c.border);
    markX.setAttribute('fill', axis === 'x' ? c.text : c.textMuted);
    markY.setAttribute('fill', axis === 'y' ? c.text : c.textMuted);
  }

  function drawPoints(): void {
    gPoints.textContent = '';
    for (const p of points) {
      gPoints.appendChild(
        el('circle', {
          cx: xPix(p.x), cy: yPix(p.y), r: POINT_R,
          fill: p.label === classes[0] ? colorLow : colorHigh,
        }),
      );
    }
    // 이름표는 무리 곁에 직접 붙인다 — 범례 상자를 따로 두지 않는다.
    const groups: Array<[string, string]> = [
      [classes[0], colorLow],
      [classes[1], colorHigh],
    ];
    for (const [label, fill] of groups) {
      const ys = points.filter((p) => p.label === label).map((p) => p.y);
      if (ys.length === 0) continue;
      const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const mark = el('text', {
        x: plotL + 12, y: yPix(centerY) + 5, 'text-anchor': 'middle',
        fill, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600,
      });
      // 이름표는 선언이 준 값이다 — 코드에 박은 문안이 아니다.
      mark.textContent = label;
      gPoints.appendChild(mark);
    }
  }

  function clearRun(): void {
    gGhosts.textContent = '';
    ghostNodes.length = 0;
    gTicks.textContent = '';
    tickNodes.clear();
    bladeOn = false;
    regionsOn = false;
    chipsHidden = false;
    bladeState = homeBlade('x');
    shownLow = { a: 0, b: 0 };
    shownHigh = { a: 0, b: 0 };
    clearRatioText();
    blade.setAttribute('stroke', c.risingMarker);
    blade.setAttribute('stroke-width', '3');
    knob.setAttribute('fill', c.risingMarker);
    railX.setAttribute('stroke', c.border);
    railY.setAttribute('stroke', c.border);
    markX.setAttribute('fill', c.textMuted);
    markY.setAttribute('fill', c.textMuted);
    render();
  }

  function leaveGhost(): void {
    const rad = (bladeState.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = Math.cos(rad);
    const half = fitHalf(bladeState.cx, bladeState.cy, dx, dy, bladeState.len / 2);
    const ghost = el('line', {
      x1: bladeState.cx - dx * half, y1: bladeState.cy - dy * half,
      x2: bladeState.cx + dx * half, y2: bladeState.cy + dy * half,
      stroke: c.ghostOutline, 'stroke-width': 1.5,
      'stroke-dasharray': '4 5', opacity: 0.55,
    });
    gGhosts.appendChild(ghost);
    ghostNodes.push(ghost);
  }

  const instance: SplitByQuestionStageInstance = {
    setup(input: SetupInput): void {
      points = input.points;
      classes = input.classes;
      xCuts = input.xCuts;
      yCuts = input.yCuts;

      const xs = [...points.map((p) => p.x), ...xCuts];
      const ys = [...points.map((p) => p.y), ...yCuts];
      const xLo = xs.length ? Math.min(...xs) : 0;
      const xHi = xs.length ? Math.max(...xs) : 1;
      const yLo = ys.length ? Math.min(...ys) : 0;
      const yHi = ys.length ? Math.max(...ys) : 1;
      const xPad = Math.max(0.4, (xHi - xLo) * 0.12);
      const yPad = Math.max(0.4, (yHi - yLo) * 0.12);
      xMin = xLo - xPad;
      xMax = xHi + xPad;
      yMin = yLo - yPad;
      yMax = yHi + yPad;

      drawPoints();
      clearRun();
    },

    say(text: string): void {
      caption.textContent = text;
    },

    reset(): void {
      clearRun();
    },

    async pickAxis(input: { axis: Axis; caption: string }): Promise<void> {
      caption.textContent = input.caption;
      const target = homeBlade(input.axis);
      setRail(input.axis);
      drawTicks(input.axis);
      clearRatioText();

      if (!bladeOn) {
        // 처음 세우는 자름선 — 레일에서 길이가 자라나며 선다.
        bladeOn = true;
        regionsOn = false;
        bladeState = { ...target, len: 0 };
        render();
        await tween(RAISE_MS, true, (t) => {
          bladeState = { ...target, len: target.len * t };
          render();
        });
        regionsOn = true;
        bladeState = target;
        render();
        return;
      }

      // 이미 서 있던 자름선을 **갈아 세운다** — 돌면서 길이가 바뀌고, 손잡이가
      // 한 레일을 떠나 다른 레일에 내려앉는다.
      const from = bladeState;
      regionsOn = false;
      chipsHidden = true;
      shownLow = { a: 0, b: 0 };
      shownHigh = { a: 0, b: 0 };
      for (const g of ghostNodes) g.setAttribute('opacity', '0.28');
      await tween(ROTATE_MS, true, (t) => {
        bladeState = {
          cx: lerp(from.cx, target.cx, t),
          cy: lerp(from.cy, target.cy, t),
          angle: lerp(from.angle, target.angle, t),
          len: lerp(from.len, target.len, t),
          knobOut: lerp(from.knobOut, target.knobOut, t),
        };
        render();
      });
      bladeState = target;
      chipsHidden = false;
      regionsOn = true;
      render();
    },

    async tryCut(input: CutInput): Promise<void> {
      caption.textContent = input.caption;
      const target = bladeAt(input.axis, input.threshold);
      const from = bladeState;
      const fromLow = shownLow;
      const fromHigh = shownHigh;
      clearRatioText();

      await tween(MOVE_MS, true, (t) => {
        bladeState = {
          cx: lerp(from.cx, target.cx, t),
          cy: lerp(from.cy, target.cy, t),
          angle: target.angle,
          len: target.len,
          knobOut: target.knobOut,
        };
        shownLow = { a: lerp(fromLow.a, input.low.a, t), b: lerp(fromLow.b, input.low.b, t) };
        shownHigh = { a: lerp(fromHigh.a, input.high.a, t), b: lerp(fromHigh.b, input.high.b, t) };
        render();
      });

      bladeState = target;
      shownLow = { ...input.low };
      shownHigh = { ...input.high };
      render();

      const tick = tickNodes.get(tickKey(input.axis, input.threshold));
      if (tick) {
        tick.setAttribute('stroke', input.pure ? c.accent : c.risingMarker);
        tick.setAttribute('stroke-width', '3');
      }

      setRatioText(input.low, input.high, input.pure);
      chipLow.ratio.setAttribute('opacity', '0');
      chipHigh.ratio.setAttribute('opacity', '0');
      await tween(LABEL_MS, false, (t) => {
        chipLow.ratio.setAttribute('opacity', String(t));
        chipHigh.ratio.setAttribute('opacity', String(t));
      });

      // 지나온 자리는 자취로 남는다 — 자름선이 옮겨 가면 드러난다.
      leaveGhost();
    },

    async showExhausted(input: { caption: string }): Promise<void> {
      caption.textContent = input.caption;
      const n = ghostNodes.length;
      if (n === 0) return;
      // 훑고 지나간 자리를 순서대로 되짚는다 — "다 해 봤다" 를 한 번에 보인다.
      await tween(SWEEP_MS, false, (p) => {
        ghostNodes.forEach((g, i) => {
          const center = (i + 0.5) / n;
          const k = Math.max(0, 1 - Math.abs(p - center) * n * 1.6);
          g.setAttribute('opacity', String(0.5 + 0.5 * k));
          g.setAttribute('stroke-width', String(1.5 + 2.4 * k));
        });
      });
      for (const g of ghostNodes) {
        g.setAttribute('opacity', '0.55');
        g.setAttribute('stroke-width', '1.5');
      }
    },

    finish(input: { caption: string }): void {
      caption.textContent = input.caption;
      blade.setAttribute('stroke', c.accent);
      blade.setAttribute('stroke-width', '4');
      knob.setAttribute('fill', c.accent);
    },

    destroy(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      canvas.textContent = '';
    },
  };

  render();
  return instance;
}

export const splitByQuestionStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount,
};
