/**
 * squash-to-probability-stage — 무한한 축이 유한한 띠 안으로 접혀 드는 그림.
 *
 * ── 무엇을 그리는가
 *
 * 위에는 **점수 축** 하나. 양 끝이 화살표로 캔버스 밖을 향하고 그 위에 −∞ · +∞
 * 가 붙는다. 아래에는 **확률의 띠** 하나. 0 과 1 두 벽에 갇혀 있고 그 사이가
 * 전부다. 둘 사이는 비어 있다가, 점수가 하나씩 내려앉을 때마다 **깔때기**가
 * 채워진다 — 축의 한 구간이 띠의 어느 구간으로 갔는지 이어 주는 띠 모양의 면.
 *
 * 이 그림의 값어치는 그 깔때기의 **일그러짐**에 있다. 축에서 −1 과 0 은 겨우
 * 28 픽셀 떨어져 있는데 띠에서는 117 픽셀로 벌어지고, 축에서 −8 과 −4 는 113
 * 픽셀 떨어져 있는데 띠에서는 9 픽셀로 오므라든다. 가운데 깔때기는 나팔처럼
 * 벌어지고 바깥 깔때기는 실처럼 눌린다. 같은 축의 거리가 같은 확률을 사지
 * 못한다는 말이 그 모양 자체다.
 *
 * ── 좌표
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언에서 오는 것은 점수 목록과 걸음
 * 간격뿐이다. 축이 보여 주는 범위 `zSpan` 도 가장 큰 |z| 에서 역산한다 —
 * 데이터가 −8..8 이면 −10..10 을 그려 양 끝에 자투리가 들어설 자리를 남긴다.
 *
 * ── 세로
 *
 * 마운트한 뒤 viewBox 를 다시 재지 않는다 (S-view). 점수가 몇이든 축과 띠의
 * 자리는 그대로고, 값 라벨만 가로로 나뉜다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 308;
const PAD_X = 26;

// ── 점수 축
const FORMULA_Y = 20;
const ZLABEL_Y = 52;
const AXIS_Y = 68;
const AXIS_L = PAD_X;
const AXIS_R = STAGE_W - PAD_X;
const AXIS_C = STAGE_W / 2;
const AXIS_REACH = AXIS_C - AXIS_L;
const TICK_HALF = 5;
const ARROW_LEN = 9;
const ARROW_HALF = 4.5;
/** 데이터가 차지하는 축 범위의 몇 배까지 그릴지. 나머지가 자투리의 자리다. */
const AXIS_HEADROOM = 1.25;

// ── 확률의 띠
/** 띠 바깥에 0 · 1 을 적을 만큼만 남기고 폭을 채운다 (S-piece). */
const BAND_SIDE = 56;
const BAND_L = BAND_SIDE;
const BAND_R = STAGE_W - BAND_SIDE;
const BAND_W = BAND_R - BAND_L;
const BAND_TOP = 198;
const BAND_BOT = 232;
const WALL_TOP = 189;
const WALL_BOT = 241;
const WALL_GROW = 6;
const WALL_LABEL_DX = 13;

// ── 깔때기
/** 3차 곡선의 제어점 깊이. 축에서 수직으로 떠나 띠에 수직으로 닿게 한다. */
const CURVE_K = 54;
const SAMPLES = 36;
/**
 * 깔때기 면의 투명도. 어두운 테마에서는 같은 값이 훨씬 무겁게 얹혀 노랑 덩어리가
 * 그림을 삼키므로 한 단계 묽게 쓴다. 색은 토큰에서 오고 여기서 정하는 것은
 * 얼마나 얹느냐뿐이다.
 */
const RIBBON_ALPHA_LIGHT = 0.18;
const RIBBON_ALPHA_DARK = 0.11;
const SEG_ALPHA = 0.5;

// ── 값 라벨과 캡션
const LEAD_Y = 250;
const SLOT_Y = 262;
const CAPTION_Y = 290;
const VALUE_DIGITS = 4;

// ── 걸음마다의 지속시간
const AXIS_MS = 480;
const BAND_MS = 420;
const DROP_MS = 380;
const DRIVE_MS = 240;
const TAILS_MS = 560;
const SETTLE_MS = 220;

/** 도형에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const FORMULA = 'σ(z) = 1 / (1 + e^(−z))';
const NEG_INFINITY = '−∞';
const POS_INFINITY = '+∞';
const MINUS = '−';

export type SquashStep = {
  index: number;
  z: number;
  p: number;
  fromIndex: number | null;
  fromP: number | null;
};

type Chute = { x0: number; x1: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function textNode(value: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = value;
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) / 2;
}

/** 3차 곡선의 x. 제어점이 P0.x = P1.x, P2.x = P3.x 라 두 항으로 접힌다. */
function chuteX(x0: number, x1: number, t: number): number {
  const u = 1 - t;
  return (u * u * u + 3 * u * u * t) * x0 + (3 * u * t * t + t * t * t) * x1;
}

/** 3차 곡선의 y. x 와 무관하게 축 → 띠 위쪽으로 단조 증가한다. */
function chuteY(t: number): number {
  const u = 1 - t;
  return (
    u * u * u * AXIS_Y +
    3 * u * u * t * (AXIS_Y + CURVE_K) +
    3 * u * t * t * (BAND_TOP - CURVE_K) +
    t * t * t * BAND_TOP
  );
}

/**
 * 곡선을 깊이 `q` 까지 잘라 점으로 뜬다.
 *
 * `getTotalLength` 류의 SVG 기하 API 를 쓰지 않는다 — 러너 밖 검사 환경에는
 * 그것이 없어서 그리기가 통째로 멎는다. 점을 직접 셈하면 어디서든 같다.
 */
function chutePoints(x0: number, x1: number, q: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (q * i) / SAMPLES;
    out.push(`${chuteX(x0, x1, t).toFixed(2)} ${chuteY(t).toFixed(2)}`);
  }
  return out;
}

function chutePath(x0: number, x1: number, q: number): string {
  return `M ${chutePoints(x0, x1, q).join(' L ')}`;
}

/** 두 곡선 사이의 면. 위에서 아래로 `q` 만큼 자라난다. */
function ribbonPath(left: Chute, right: Chute, q: number): string {
  const down = chutePoints(left.x0, left.x1, q);
  const up = chutePoints(right.x0, right.x1, q).reverse();
  return `M ${down.join(' L ')} L ${up.join(' L ')} Z`;
}

export const squashToProbabilityStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    const ribbonAlpha = params.theme === 'dark' ? RIBBON_ALPHA_DARK : RIBBON_ALPHA_LIGHT;

    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(ms: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          draw(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const frame = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 화폭. 그린 것은 전부 이 아래에 두고, destroy 에서 통째로 뗀다.
    const root = el('g', {});
    canvas.appendChild(root);

    const gRibbon = el('g', {});
    const gTail = el('g', {});
    const gChute = el('g', {});
    const gBand = el('g', {});
    const gSeg = el('g', {});
    const gTick = el('g', {});
    const gFrame = el('g', {});
    const gAxis = el('g', {});
    const gMark = el('g', {});
    const gLead = el('g', {});
    for (const g of [gRibbon, gTail, gChute, gBand, gSeg, gTick, gFrame, gAxis, gMark, gLead]) {
      root.appendChild(g);
    }

    root.appendChild(
      textNode(FORMULA, {
        x: PAD_X,
        y: FORMULA_Y,
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      }),
    );

    const caption = textNode('', {
      x: AXIS_C,
      y: CAPTION_Y,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'text-anchor': 'middle',
    });
    root.appendChild(caption);

    // ── 상태
    let scores: number[] = [];
    let zSpan = 1;
    const chutes = new Map<number, Chute>();
    const valueLabels = new Map<number, SVGTextElement>();
    const axisTicks = new Map<number, SVGLineElement>();
    const axisLabels = new Map<number, SVGTextElement>();
    let walls: SVGLineElement[] = [];
    let segRect: SVGRectElement | null = null;
    let segSpan: { from: number; to: number } | null = null;

    const xTop = (z: number): number => AXIS_C + (z / zSpan) * AXIS_REACH;
    const xBand = (p: number): number => BAND_L + p * BAND_W;
    const slotX = (index: number): number =>
      PAD_X + ((index + 0.5) * (STAGE_W - 2 * PAD_X)) / Math.max(1, scores.length);

    function clearGroups(): void {
      for (const g of [gRibbon, gTail, gChute, gBand, gSeg, gTick, gFrame, gAxis, gMark, gLead]) {
        while (g.firstChild) g.removeChild(g.firstChild);
      }
      chutes.clear();
      valueLabels.clear();
      axisTicks.clear();
      axisLabels.clear();
      walls = [];
      segRect = null;
      segSpan = null;
    }

    function ensureSeg(): SVGRectElement {
      if (!segRect) {
        segRect = el('rect', {
          x: AXIS_C,
          y: BAND_TOP,
          width: 0,
          height: BAND_BOT - BAND_TOP,
          fill: c.accent,
          'fill-opacity': SEG_ALPHA,
        });
        gSeg.appendChild(segRect);
      }
      return segRect;
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },

      reset(): void {
        clearGroups();
        caption.textContent = '';
      },

      setCaption(value: string): void {
        caption.textContent = value;
      },

      /** 축이 한가운데에서 양쪽 끝까지 뻗어 나간다. */
      async extendAxis(list: number[]): Promise<void> {
        clearGroups();
        scores = [...list];
        const reach = Math.max(1, ...scores.map((z) => Math.abs(z)));
        zSpan = reach * AXIS_HEADROOM;

        const line = el('line', {
          x1: AXIS_C,
          y1: AXIS_Y,
          x2: AXIS_C,
          y2: AXIS_Y,
          stroke: c.text,
          'stroke-width': 1.5,
        });
        const arrowL = el('path', {
          d: `M ${AXIS_L} ${AXIS_Y} L ${AXIS_L + ARROW_LEN} ${AXIS_Y - ARROW_HALF} L ${AXIS_L + ARROW_LEN} ${AXIS_Y + ARROW_HALF} Z`,
          fill: c.text,
        });
        const arrowR = el('path', {
          d: `M ${AXIS_R} ${AXIS_Y} L ${AXIS_R - ARROW_LEN} ${AXIS_Y - ARROW_HALF} L ${AXIS_R - ARROW_LEN} ${AXIS_Y + ARROW_HALF} Z`,
          fill: c.text,
        });
        for (const node of [line, arrowL, arrowR]) gAxis.appendChild(node);

        scores.forEach((z, index) => {
          const x = xTop(z);
          const tick = el('line', {
            x1: x,
            y1: AXIS_Y - TICK_HALF,
            x2: x,
            y2: AXIS_Y + TICK_HALF,
            stroke: c.text,
            'stroke-width': 1.5,
            opacity: 0,
          });
          const label = textNode(z < 0 ? `${MINUS}${Math.abs(z)}` : String(z), {
            x,
            y: ZLABEL_Y,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            opacity: 0,
          });
          axisTicks.set(index, tick);
          axisLabels.set(index, label);
          gAxis.appendChild(tick);
          gAxis.appendChild(label);
        });

        const infL = textNode(NEG_INFINITY, {
          x: AXIS_L,
          y: ZLABEL_Y,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        const infR = textNode(POS_INFINITY, {
          x: AXIS_R,
          y: ZLABEL_Y,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        gAxis.appendChild(infL);
        gAxis.appendChild(infR);

        await animate(AXIS_MS, (t) => {
          const reached = AXIS_REACH * t;
          line.setAttribute('x1', String(AXIS_C - reached));
          line.setAttribute('x2', String(AXIS_C + reached));
          arrowL.setAttribute('transform', `translate(${AXIS_REACH - reached} 0)`);
          arrowR.setAttribute('transform', `translate(${reached - AXIS_REACH} 0)`);
          for (const [index, tick] of axisTicks) {
            const shown = Math.abs(xTop(scores[index]) - AXIS_C) <= reached ? 1 : 0;
            tick.setAttribute('opacity', String(shown));
            axisLabels.get(index)?.setAttribute('opacity', String(shown));
          }
          const tail = Math.max(0, (t - 0.8) * 5);
          infL.setAttribute('opacity', String(tail));
          infR.setAttribute('opacity', String(tail));
        });
      },

      /** 띠가 한가운데에서 자라나 두 벽에 부딪혀 멈춘다. */
      async raiseBand(): Promise<void> {
        const rect = el('rect', {
          x: AXIS_C,
          y: BAND_TOP,
          width: 0,
          height: BAND_BOT - BAND_TOP,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        gBand.appendChild(rect);

        const wallL = el('line', {
          x1: AXIS_C,
          y1: WALL_TOP,
          x2: AXIS_C,
          y2: WALL_BOT,
          stroke: c.text,
          'stroke-width': 3,
        });
        const wallR = el('line', {
          x1: AXIS_C,
          y1: WALL_TOP,
          x2: AXIS_C,
          y2: WALL_BOT,
          stroke: c.text,
          'stroke-width': 3,
        });
        const zero = textNode('0', {
          x: AXIS_C,
          y: (WALL_TOP + WALL_BOT) / 2 + 4,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        const one = textNode('1', {
          x: AXIS_C,
          y: (WALL_TOP + WALL_BOT) / 2 + 4,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        walls = [wallL, wallR];
        for (const node of [wallL, wallR, zero, one]) gFrame.appendChild(node);

        await animate(BAND_MS, (t) => {
          const half = (BAND_W / 2) * t;
          rect.setAttribute('x', String(AXIS_C - half));
          rect.setAttribute('width', String(half * 2));
          wallL.setAttribute('x1', String(AXIS_C - half));
          wallL.setAttribute('x2', String(AXIS_C - half));
          wallR.setAttribute('x1', String(AXIS_C + half));
          wallR.setAttribute('x2', String(AXIS_C + half));
          zero.setAttribute('x', String(AXIS_C - half - WALL_LABEL_DX));
          one.setAttribute('x', String(AXIS_C + half + WALL_LABEL_DX));
          const shown = Math.max(0, (t - 0.7) * 3.4);
          zero.setAttribute('opacity', String(Math.min(1, shown)));
          one.setAttribute('opacity', String(Math.min(1, shown)));
        });
      },

      /** 점수 하나가 축을 떠나 띠로 내려앉고, 이웃과의 사이에서 폭을 얻는다. */
      async squash(step: SquashStep): Promise<void> {
        const from = xTop(step.z);
        const to = xBand(step.p);

        axisTicks.get(step.index)?.setAttribute('stroke', c.itemActive);
        axisLabels.get(step.index)?.setAttribute('fill', c.itemActive);

        const chute = el('path', {
          d: '',
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
        });
        gChute.appendChild(chute);

        const dot = el('circle', { cx: from, cy: AXIS_Y, r: 4, fill: c.itemActive });
        gMark.appendChild(dot);

        const neighbour = step.fromIndex === null ? undefined : chutes.get(step.fromIndex);
        const mine: Chute = { x0: from, x1: to };
        const ribbon = neighbour
          ? el('path', { d: '', fill: c.accent, 'fill-opacity': ribbonAlpha })
          : null;
        if (ribbon) gRibbon.appendChild(ribbon);

        await animate(DROP_MS, (t) => {
          chute.setAttribute('d', chutePath(from, to, t));
          dot.setAttribute('cx', String(chuteX(from, to, t)));
          dot.setAttribute('cy', String(chuteY(t)));
          if (ribbon && neighbour) {
            const [a, b] = neighbour.x0 < from ? [neighbour, mine] : [mine, neighbour];
            ribbon.setAttribute('d', ribbonPath(a, b, t));
          }
        });
        chutes.set(step.index, mine);

        // 띠 안으로 박아 넣으면서 이웃과의 사이에 얻은 폭을 연다.
        const tick = el('line', {
          x1: to,
          y1: BAND_TOP,
          x2: to,
          y2: BAND_TOP,
          stroke: c.text,
          'stroke-width': 2,
        });
        gTick.appendChild(tick);

        const slot = slotX(step.index);
        const lead = el('line', {
          x1: to,
          y1: BAND_BOT,
          x2: to,
          y2: BAND_BOT,
          stroke: c.border,
          'stroke-width': 1,
        });
        const value = textNode(step.p.toFixed(VALUE_DIGITS), {
          x: slot,
          y: SLOT_Y,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        valueLabels.set(step.index, value);
        gLead.appendChild(lead);
        gLead.appendChild(value);

        const claimFrom = step.fromP === null ? null : xBand(step.fromP);
        if (claimFrom !== null) {
          segSpan = { from: claimFrom, to };
          const seg = ensureSeg();
          seg.setAttribute('x', String(claimFrom));
          seg.setAttribute('width', '0');
        }

        await animate(DRIVE_MS, (t) => {
          const depth = BAND_TOP + (BAND_BOT - BAND_TOP) * t;
          tick.setAttribute('y2', String(depth));
          dot.setAttribute('cy', String(depth));
          lead.setAttribute('x2', String(to + (slot - to) * t));
          lead.setAttribute('y2', String(BAND_BOT + (LEAD_Y - BAND_BOT) * t));
          value.setAttribute('opacity', String(Math.max(0, t * 2 - 1)));
          if (segRect && claimFrom !== null) {
            const edge = claimFrom + (to - claimFrom) * t;
            segRect.setAttribute('x', String(Math.min(claimFrom, edge)));
            segRect.setAttribute('width', String(Math.abs(edge - claimFrom)));
          }
        });

        dot.setAttribute('r', '3');
        dot.setAttribute('fill', c.text);
        axisTicks.get(step.index)?.setAttribute('stroke', c.text);
        axisLabels.get(step.index)?.setAttribute('fill', c.text);
      },

      /** 축의 나머지 전부가 양 끝 자투리로 눌려 든다. 벽은 그만큼 더 버틴다. */
      async pressTails(lowP: number, highP: number): Promise<void> {
        if (scores.length === 0) return;
        const lowInner: Chute = { x0: xTop(scores[0]), x1: xBand(lowP) };
        const lowOuter: Chute = { x0: AXIS_L, x1: BAND_L };
        const highInner: Chute = { x0: xTop(scores[scores.length - 1]), x1: xBand(highP) };
        const highOuter: Chute = { x0: AXIS_R, x1: BAND_R };

        const lowFace = el('path', { d: '', fill: c.accent, 'fill-opacity': ribbonAlpha });
        const highFace = el('path', { d: '', fill: c.accent, 'fill-opacity': ribbonAlpha });
        const lowEdge = el('path', {
          d: '',
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        const highEdge = el('path', {
          d: '',
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        for (const node of [lowFace, highFace, lowEdge, highEdge]) gTail.appendChild(node);

        valueLabels.get(0)?.setAttribute('fill', c.itemActive);
        valueLabels.get(scores.length - 1)?.setAttribute('fill', c.itemActive);

        await animate(TAILS_MS, (t) => {
          lowFace.setAttribute('d', ribbonPath(lowOuter, lowInner, t));
          highFace.setAttribute('d', ribbonPath(highInner, highOuter, t));
          lowEdge.setAttribute('d', chutePath(lowOuter.x0, lowOuter.x1, t));
          highEdge.setAttribute('d', chutePath(highOuter.x0, highOuter.x1, t));
          const grow = WALL_GROW * t;
          for (const wall of walls) {
            wall.setAttribute('y1', String(WALL_TOP - grow));
            wall.setAttribute('y2', String(WALL_BOT + grow));
          }
        });
      },

      /** 마지막으로 얻은 폭의 강조를 거둔다. */
      async settle(): Promise<void> {
        const rect = segRect;
        const span = segSpan;
        if (!rect || !span) return;
        await animate(SETTLE_MS, (t) => {
          const edge = span.from + (span.to - span.from) * t;
          rect.setAttribute('x', String(Math.min(edge, span.to)));
          rect.setAttribute('width', String(Math.abs(span.to - edge)));
        });
        rect.remove();
        segRect = null;
        segSpan = null;
      },
    };
  },
};
