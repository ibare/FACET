/**
 * constant-fades 전용 stage view — 만나는 자리가 옮겨 앉는 것을 보이는 수직선.
 *
 * **그림이 곡선이 아니다.** 두 식을 그래프로 그리면 "언젠가 갈린다" 가 주장이 되는데,
 * 이 조각의 주장은 "상수는 만나는 자리를 미룰 뿐이다" 라서 재야 하는 것이 높이가
 * 아니라 **자리**다. 그래서 값은 숫자 칩으로 읽고, 화면에서 움직이는 것은 경계 기둥의
 * 가로 위치 하나다.
 *
 * 가로축은 n 이 배율만큼씩 자라는 눈금이다 (선언의 factor 가 10 이면 눈금 하나가
 * 열 배). 그 덕에 "상수를 열 배로 키우면 만나는 자리가 한 눈금 오른쪽" 이 자로 잰
 * 거리로 보인다. 이 전제를 화면에 각주로 달지 않는다 — 밝히는 것은 글의 일이다
 * (S-piece). 눈금 라벨 자체는 각주가 아니라 데이터다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * PIECE_CANVAS_W 로 주므로 여기 적지 않고, 그 폭을 좌우 여백 없이 채운다.
 *
 * 걸어 둔 타이머는 집합에 담아 destroy 에서 일괄로 거두고, 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `await ctx.emit` 이 영영 돌아오지 않는다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 238;

const W = PIECE_CANVAS_W;
const PAD_L = 36;
const PAD_R = 52;
const AXIS_X1 = W - PAD_R;

const CHIP_TOP = 16;
const CHIP_H = 44;
const CHIP_W = 98;
const CHIP_GAP = 12;
const STEM_TOP = CHIP_TOP + CHIP_H;

const BAND_TOP = 104;
const BAND_H = 28;
const BAND_BOTTOM = BAND_TOP + BAND_H;
const ARROW_W = 16;

const AXIS_Y = 152;
const TICK_LABEL_Y = 170;
const MARK_LABEL_Y = 190;
const SPACING_Y = 212;
const SPACING_LABEL_Y = 206;
const CAPTION_Y = 230;

/** 걸음마다 붙는 운동의 길이. 걸음 벽시계 = 이 값 + stepMs. */
const AXIS_MS = 520;
const PROBE_MS = 520;
const CHIP_MS = 200;
const BAND_MS = 420;
const MOVE_MS = 560;
const MARK_MS = 280;
const SPACING_MS = 360;
const ERASE_MS = 460;
const FRAME_MS = 16;

/** 자모 폭 어림 — 등폭 글꼴이라 글자 수에 비례한다. 라벨을 가운데 맞출 때만 쓴다. */
const MONO_RATIO = 0.6;

type Lead = 'linear' | 'quad' | 'tie';

export type ProbeSpec = {
  n: number;
  coefficient: number;
  linear: number;
  quad: number;
  lead: Lead;
};

export type BoundarySpec = {
  coefficient: number;
  meeting: number;
  value: number;
};

export type MoveSpec = BoundarySpec & { previous: number };

export type MarkSpec = { coefficient: number; meeting: number };

export type SpacingSpec = { factor: number; marks: MarkSpec[] };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

/** 다섯 자리부터 세 자리씩 끊어 읽는다. 1000 은 그대로, 10000 은 끊는다. */
function groupDigits(value: number): string {
  const s = String(value);
  if (s.length <= 4) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function textWidth(content: string, size: number): number {
  return content.length * size * MONO_RATIO;
}

type Chip = {
  group: SVGGElement;
  rect: SVGRectElement;
  formula: SVGTextElement;
  value: SVGTextElement;
};

type Probe = {
  group: SVGGElement;
  left: Chip;
  right: Chip;
};

type Band = {
  left: SVGRectElement;
  right: SVGRectElement;
  arrow: SVGPolygonElement;
  coef: SVGTextElement;
  tail: SVGTextElement;
  quad: SVGTextElement;
};

type Mark = {
  coef: SVGTextElement;
  tail: SVGTextElement;
  x: number;
  coefW: number;
  tailW: number;
};

export const constantFadesStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function animate(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
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
            apply(1);
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          apply(ease(raw));
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

    // ── 장면 상태 ────────────────────────────────────────────────────────────
    let bandLayer = el('g', {});
    let ghostLayer = el('g', {});
    let axisLayer = el('g', {});
    let markLayer = el('g', {});
    let postLayer = el('g', {});
    let probeLayer = el('g', {});
    let captionText = el('text', {});

    let ticks: number[] = [];
    let topN = 1;
    let probe: Probe | null = null;
    let probeX = PAD_L;
    let band: Band | null = null;
    let post: SVGLineElement | null = null;
    let postHead: SVGPolygonElement | null = null;
    let postX = PAD_L;
    let marks: Mark[] = [];

    function xOf(n: number): number {
      if (topN <= 1 || n <= 1) return PAD_L;
      const t = Math.log(n) / Math.log(topN);
      return PAD_L + clamp01(t) * (AXIS_X1 - PAD_L);
    }

    function buildScene(): void {
      svg.textContent = '';
      bandLayer = el('g', {});
      ghostLayer = el('g', {});
      axisLayer = el('g', {});
      markLayer = el('g', {});
      postLayer = el('g', {});
      probeLayer = el('g', {});
      const captionLayer = el('g', {});
      captionText = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.body,
      });
      captionLayer.appendChild(captionText);
      for (const layer of [bandLayer, ghostLayer, axisLayer, markLayer, postLayer, probeLayer, captionLayer]) {
        svg.appendChild(layer);
      }
      ticks = [];
      topN = 1;
      probe = null;
      probeX = PAD_L;
      band = null;
      post = null;
      postHead = null;
      postX = PAD_L;
      marks = [];
    }

    buildScene();

    // ── 눈금 ────────────────────────────────────────────────────────────────
    async function showAxis(list: number[]): Promise<void> {
      ticks = list.slice();
      topN = ticks.length > 0 ? ticks[ticks.length - 1]! : 1;

      const line = el('line', {
        x1: PAD_L,
        y1: AXIS_Y,
        x2: PAD_L,
        y2: AXIS_Y,
        stroke: c.border,
        'stroke-width': 2,
      });
      axisLayer.appendChild(line);

      const tickGroups = ticks.map((n) => {
        const g = el('g', { opacity: 0 });
        const x = xOf(n);
        g.appendChild(
          el('line', {
            x1: x,
            y1: AXIS_Y - 5,
            x2: x,
            y2: AXIS_Y + 5,
            stroke: c.border,
            'stroke-width': 2,
          }),
        );
        const label = el('text', {
          x,
          y: TICK_LABEL_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
        });
        label.textContent = groupDigits(n);
        g.appendChild(label);
        axisLayer.appendChild(g);
        return g;
      });

      // 눈금이 위에서 차례로 내려앉는다 — 판을 세우는 걸음에도 운동이 있어야 한다.
      await animate(AXIS_MS, (t) => {
        line.setAttribute('x2', String(PAD_L + (AXIS_X1 - PAD_L) * t));
        tickGroups.forEach((g, i) => {
          const local = clamp01((t - i * 0.1) / 0.5);
          g.setAttribute('opacity', String(local));
          g.setAttribute('transform', `translate(0 ${(-14 * (1 - local)).toFixed(2)})`);
        });
      });
    }

    // ── 값을 읽는 칩 두 장 ──────────────────────────────────────────────────
    function makeChip(offsetX: number): Chip {
      const group = el('g', { transform: `translate(${offsetX} 0)` });
      const rect = el('rect', {
        x: 0,
        y: CHIP_TOP,
        width: CHIP_W,
        height: CHIP_H,
        rx: 6,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1,
      });
      const formula = el('text', {
        x: CHIP_W / 2,
        y: CHIP_TOP + 17,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      const value = el('text', {
        x: CHIP_W / 2,
        y: CHIP_TOP + 35,
        'text-anchor': 'middle',
        fill: c.text,
        'font-size': fontSizes.md,
        'font-family': fonts.mono,
      });
      group.appendChild(rect);
      group.appendChild(formula);
      group.appendChild(value);
      return { group, rect, formula, value };
    }

    function ensureProbe(): Probe {
      if (probe) return probe;
      const group = el('g', { transform: `translate(${PAD_L} 0)` });
      group.appendChild(
        el('line', {
          x1: 0,
          y1: STEM_TOP,
          x2: 0,
          y2: AXIS_Y,
          stroke: c.auxCursor,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        }),
      );
      group.appendChild(
        el('polygon', {
          points: `-5,${AXIS_Y - 9} 5,${AXIS_Y - 9} 0,${AXIS_Y}`,
          fill: c.auxCursor,
        }),
      );
      const left = makeChip(-(CHIP_W + CHIP_GAP / 2));
      const right = makeChip(CHIP_GAP / 2);
      group.appendChild(left.group);
      group.appendChild(right.group);
      probeLayer.appendChild(group);
      probe = { group, left, right };
      return probe;
    }

    function setProbeX(x: number): void {
      probeX = x;
      probe?.group.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    }

    /** 이동하는 동안 값을 비운다 — 옮겨 가는 중의 칩에 옛 자리의 값을 남기면 거짓이 된다. */
    function blankChips(): void {
      if (!probe) return;
      for (const chip of [probe.left, probe.right]) {
        chip.value.textContent = '';
        chip.rect.setAttribute('fill', c.itemDefault);
        chip.rect.setAttribute('stroke', c.border);
        chip.formula.setAttribute('fill', c.textMuted);
      }
    }

    function paintChip(chip: Chip, formula: string, value: number, state: 'lead' | 'plain' | 'tie'): void {
      chip.formula.textContent = formula;
      chip.value.textContent = groupDigits(value);
      const fill = state === 'lead' ? c.itemActive : state === 'tie' ? c.itemPivot : c.itemDefault;
      chip.rect.setAttribute('fill', fill);
      chip.rect.setAttribute('stroke', state === 'plain' ? c.border : fill);
      chip.value.setAttribute('fill', state === 'plain' ? c.text : c.stateInk);
      chip.formula.setAttribute('fill', state === 'plain' ? c.textMuted : c.stateInk);
    }

    /** 값이 자리에 내려앉는다. 이동이 끝난 뒤에만 값을 보인다. */
    async function settleChips(
      coefficient: number,
      linear: number,
      quad: number,
      lead: Lead,
    ): Promise<void> {
      const p = ensureProbe();
      paintChip(
        p.left,
        `${coefficient}·n`,
        linear,
        lead === 'tie' ? 'tie' : lead === 'linear' ? 'lead' : 'plain',
      );
      paintChip(p.right, 'n²', quad, lead === 'tie' ? 'tie' : lead === 'quad' ? 'lead' : 'plain');
      await animate(CHIP_MS, (t) => {
        for (const chip of [p.left, p.right]) {
          chip.value.setAttribute('opacity', String(t));
          chip.value.setAttribute('transform', `translate(0 ${(-8 * (1 - t)).toFixed(2)})`);
        }
      });
    }

    async function showProbe(spec: ProbeSpec): Promise<void> {
      ensureProbe();
      blankChips();
      const from = probeX;
      const to = xOf(spec.n);
      await animate(PROBE_MS, (t) => setProbeX(from + (to - from) * t));
      await settleChips(spec.coefficient, spec.linear, spec.quad, spec.lead);
    }

    // ── 땅과 경계 기둥 ──────────────────────────────────────────────────────
    function bandLabelParts(coefficient: number): { coefText: string; coefW: number; tailW: number } {
      const coefText = `${coefficient}·`;
      const size = 12;
      return {
        coefText,
        coefW: textWidth(coefText, size),
        tailW: textWidth('n', size),
      };
    }

    function positionBandLabel(x: number): void {
      if (!band) return;
      const coefText = band.coef.textContent ?? '';
      const coefW = textWidth(coefText, 12);
      const tailW = textWidth(band.tail.textContent ?? 'n', 12);
      const center = (PAD_L + x) / 2;
      const start = center - (coefW + tailW) / 2;
      band.coef.setAttribute('x', start.toFixed(2));
      band.tail.setAttribute('x', (start + coefW).toFixed(2));
      band.quad.setAttribute('x', ((x + (W - ARROW_W)) / 2).toFixed(2));
    }

    function ensureBand(coefficient: number): Band {
      if (band) {
        band.coef.textContent = bandLabelParts(coefficient).coefText;
        return band;
      }
      const left = el('rect', {
        x: PAD_L,
        y: BAND_TOP,
        width: 0,
        height: BAND_H,
        fill: c.subtreeShadeLeft,
        stroke: c.border,
        'stroke-width': 1,
      });
      const right = el('rect', {
        x: PAD_L,
        y: BAND_TOP,
        width: 0,
        height: BAND_H,
        fill: c.subtreeShadeRight,
        stroke: c.border,
        'stroke-width': 1,
      });
      const arrow = el('polygon', {
        points: `${W - ARROW_W},${BAND_TOP} ${W - 2},${BAND_TOP + BAND_H / 2} ${W - ARROW_W},${BAND_BOTTOM}`,
        fill: c.subtreeShadeRight,
        opacity: 0,
      });
      const coef = el('text', {
        x: PAD_L,
        y: BAND_TOP + 19,
        fill: c.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
      });
      coef.textContent = bandLabelParts(coefficient).coefText;
      const tail = el('text', {
        x: PAD_L,
        y: BAND_TOP + 19,
        fill: c.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
      });
      tail.textContent = 'n';
      const quad = el('text', {
        x: W - ARROW_W,
        y: BAND_TOP + 19,
        'text-anchor': 'middle',
        fill: c.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
      });
      quad.textContent = 'n²';
      bandLayer.appendChild(left);
      bandLayer.appendChild(right);
      bandLayer.appendChild(arrow);
      bandLayer.appendChild(coef);
      bandLayer.appendChild(tail);
      bandLayer.appendChild(quad);
      band = { left, right, arrow, coef, tail, quad };
      return band;
    }

    function layoutBand(x: number): void {
      if (!band) return;
      band.left.setAttribute('x', String(PAD_L));
      band.left.setAttribute('width', Math.max(0, x - PAD_L).toFixed(2));
      band.right.setAttribute('x', x.toFixed(2));
      band.right.setAttribute('width', Math.max(0, W - ARROW_W - x).toFixed(2));
      positionBandLabel(x);
    }

    function ensurePost(x: number): void {
      if (post) return;
      post = el('line', {
        x1: x,
        y1: BAND_TOP,
        x2: x,
        y2: BAND_TOP,
        stroke: c.accent,
        'stroke-width': 3,
      });
      postHead = el('polygon', {
        points: `${x - 6},${BAND_TOP - 8} ${x + 6},${BAND_TOP - 8} ${x},${BAND_TOP}`,
        fill: c.accent,
      });
      postLayer.appendChild(post);
      postLayer.appendChild(postHead);
    }

    function setPostX(x: number): void {
      postX = x;
      post?.setAttribute('x1', x.toFixed(2));
      post?.setAttribute('x2', x.toFixed(2));
      postHead?.setAttribute(
        'points',
        `${(x - 6).toFixed(2)},${BAND_TOP - 8} ${(x + 6).toFixed(2)},${BAND_TOP - 8} ${x.toFixed(2)},${BAND_TOP}`,
      );
    }

    /** 기둥을 세우고 두 땅이 기둥에서 좌우로 번져 나간다. */
    async function plantBoundary(spec: BoundarySpec): Promise<void> {
      const to = xOf(spec.meeting);
      const from = probeX;
      blankChips();
      await animate(PROBE_MS, (t) => setProbeX(from + (to - from) * t));
      await settleChips(spec.coefficient, spec.value, spec.value, 'tie');

      ensureBand(spec.coefficient);
      ensurePost(to);
      setPostX(to);
      layoutBand(to);
      await animate(BAND_MS, (t) => {
        post?.setAttribute('y2', String(BAND_TOP + (AXIS_Y - BAND_TOP) * Math.min(1, t * 2)));
        if (!band) return;
        band.left.setAttribute('x', (to - (to - PAD_L) * t).toFixed(2));
        band.left.setAttribute('width', ((to - PAD_L) * t).toFixed(2));
        band.right.setAttribute('width', ((W - ARROW_W - to) * t).toFixed(2));
        band.arrow.setAttribute('opacity', String(clamp01((t - 0.6) / 0.4)));
        band.coef.setAttribute('opacity', String(t));
        band.tail.setAttribute('opacity', String(t));
        band.quad.setAttribute('opacity', String(t));
      });
      layoutBand(to);
    }

    /** 상수를 갈면 기둥이 옮겨 앉는다. 지나온 자리는 유령 기둥으로 남는다. */
    async function moveBoundary(spec: MoveSpec): Promise<void> {
      const from = xOf(spec.previous);
      const to = xOf(spec.meeting);

      const ghost = el('line', {
        x1: from,
        y1: BAND_TOP,
        x2: from,
        y2: AXIS_Y,
        stroke: c.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 4',
      });
      ghostLayer.appendChild(ghost);

      // 원인을 먼저 보인다 — 상수가 바뀌고, 그 결과로 기둥이 움직인다.
      ensureBand(spec.coefficient);
      blankChips();
      await animate(MOVE_MS, (t) => {
        const x = from + (to - from) * t;
        setPostX(x);
        setProbeX(x);
        layoutBand(x);
      });
      await settleChips(spec.coefficient, spec.value, spec.value, 'tie');
    }

    // ── 기둥 사이의 간격 ────────────────────────────────────────────────────
    async function showSpacing(spec: SpacingSpec): Promise<void> {
      marks = spec.marks.map((m) => {
        const x = xOf(m.meeting);
        const coefText = `${m.coefficient}·`;
        const coefW = textWidth(coefText, 12);
        const tailW = textWidth('n', 12);
        const start = x - (coefW + tailW) / 2;
        const coef = el('text', {
          x: start,
          y: MARK_LABEL_Y,
          fill: c.text,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          opacity: 0,
        });
        coef.textContent = coefText;
        const tail = el('text', {
          x: start + coefW,
          y: MARK_LABEL_Y,
          fill: c.text,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          opacity: 0,
        });
        tail.textContent = 'n';
        markLayer.appendChild(coef);
        markLayer.appendChild(tail);
        return { coef, tail, x, coefW, tailW };
      });

      await animate(MARK_MS, (t) => {
        marks.forEach((m, i) => {
          const local = clamp01((t - i * 0.14) / 0.5);
          for (const node of [m.coef, m.tail]) {
            node.setAttribute('opacity', String(local));
            node.setAttribute('transform', `translate(0 ${(-10 * (1 - local)).toFixed(2)})`);
          }
        });
      });

      const spans = marks.slice(1).map((m, i) => {
        const prev = marks[i]!;
        const line = el('line', {
          x1: prev.x,
          y1: SPACING_Y,
          x2: prev.x,
          y2: SPACING_Y,
          stroke: c.textMuted,
          'stroke-width': 1.5,
        });
        const head = el('polygon', {
          points: `${m.x - 7},${SPACING_Y - 4} ${m.x},${SPACING_Y} ${m.x - 7},${SPACING_Y + 4}`,
          fill: c.textMuted,
          opacity: 0,
        });
        const label = el('text', {
          x: (prev.x + m.x) / 2,
          y: SPACING_LABEL_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
          opacity: 0,
        });
        label.textContent = `×${spec.factor}`;
        markLayer.appendChild(line);
        markLayer.appendChild(head);
        markLayer.appendChild(label);
        return { line, head, label, from: prev.x, to: m.x };
      });

      // 화살이 왼쪽에서 오른쪽으로 그어진다 — 밀려나는 방향 그대로.
      await animate(SPACING_MS, (t) => {
        for (const s of spans) {
          s.line.setAttribute('x2', (s.from + (s.to - s.from) * t).toFixed(2));
          s.head.setAttribute('opacity', String(clamp01((t - 0.7) / 0.3)));
          s.label.setAttribute('opacity', String(clamp01((t - 0.5) / 0.5)));
        }
      });
    }

    /** 상수가 떨어져 나가고 셋이 같은 말(n)이 된다. */
    async function eraseConstants(): Promise<void> {
      const bandTailFrom = band ? Number(band.tail.getAttribute('x') ?? PAD_L) : PAD_L;
      const bandTailTo = band
        ? (PAD_L + postX) / 2 - textWidth(band.tail.textContent ?? 'n', 12) / 2
        : PAD_L;
      const arrowFrom = W - ARROW_W;

      await animate(ERASE_MS, (t) => {
        // 값을 읽던 칩은 위로 빠진다 — 상수를 지운 뒤의 수를 남기면 거짓이 된다.
        probe?.group.setAttribute(
          'transform',
          `translate(${probeX.toFixed(2)} ${(-(STEM_TOP + 24) * t).toFixed(2)})`,
        );
        probe?.group.setAttribute('opacity', String(1 - t));

        if (band) {
          band.coef.setAttribute('transform', `translate(0 ${(26 * t).toFixed(2)})`);
          band.coef.setAttribute('opacity', String(1 - t));
          band.tail.setAttribute('x', (bandTailFrom + (bandTailTo - bandTailFrom) * t).toFixed(2));
          const shift = 10 * t;
          band.arrow.setAttribute(
            'points',
            `${arrowFrom + shift},${BAND_TOP} ${W - 2 + shift},${BAND_TOP + BAND_H / 2} ${arrowFrom + shift},${BAND_BOTTOM}`,
          );
        }

        marks.forEach((m, i) => {
          const local = clamp01((t - i * 0.1) / 0.7);
          m.coef.setAttribute('transform', `translate(0 ${(26 * local).toFixed(2)})`);
          m.coef.setAttribute('opacity', String(1 - local));
          const from = m.x - (m.coefW + m.tailW) / 2 + m.coefW;
          const to = m.x - m.tailW / 2;
          m.tail.setAttribute('x', (from + (to - from) * local).toFixed(2));
        });
      });
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function rewind(): void {
      buildScene();
    }

    return {
      showAxis,
      showProbe,
      plantBoundary,
      moveBoundary,
      showSpacing,
      eraseConstants,
      setCaption,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
