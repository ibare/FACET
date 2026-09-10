/**
 * keep-neighbors-close-stage — 고리 하나와 줄 하나가 재료인 무대.
 *
 * 무대는 2차원 점 무리가 아니다. 고리 위에 놓인 점들을 **한 줄로 펴는** 일
 * 자체가 그림이다. 펴는 방법은 꺾임만 줄이는 것이다 — 변의 길이는 한 프레임도
 * 건드리지 않고 꼭짓점의 꺾임 각만 `(1-t)` 배로 줄인다. 그래서 이웃 간격이
 * 지켜지는 것이 눈으로 보이고, 닫힌 고리를 열린 줄로 만들려면 어딘가 한 곳이
 * 찢어질 수밖에 없다는 것도 눈으로 보인다.
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언이 주는 것은 점의 자리와 어디를
 * 끊을지뿐이고, 화면 위의 반지름·자·여백은 캔버스에서 역산한다.
 *
 * ── 자리 잡기
 *
 * 가로 자는 **펴진 줄**이 정한다. 줄이 좌우 여백을 뺀 폭을 꽉 채우도록 자를
 * 정하고, 고리는 같은 자로 그린다 — 두 그림이 같은 자를 써야 "아홉 배" 가
 * 눈금으로 읽힌다. 세로는 체인의 바닥을 줄 높이에 붙여 두어, 고리가 아래로
 * 납작해지며 줄이 되는 것으로 보이게 한다.
 *
 * 바깥 법선(변을 90도 돌린 방향)은 고리에서 바깥쪽이고, 다 펴지면 줄의 아래쪽이
 * 된다. 거리 숫자를 그 방향에 매달아 두면 고리 바깥을 돌던 열 개의 숫자가 줄
 * 아래 한 줄로 내려앉는다. 끊긴 변만 방향이 뒤집혀 위로 올라가므로, 찢어진 쌍은
 * 저절로 줄 위쪽에 자기 자리를 갖는다.
 */

import { PIECE_CANVAS_W, fonts, fontSizes, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다 (S-view). 마운트한 뒤로 바꾸지 않는다. */
const CANVAS_H = 300;
const PAD_X = 46;
/**
 * 체인의 바닥이 앉는 높이. 고리일 때는 아래로 내려가 있고 다 펴지면 조금
 * 올라온다 — 고리는 세로로 190 남짓을 쓰고 줄은 쓰지 않으므로, 바닥을 한 곳에
 * 못박으면 둘 중 하나는 반드시 한쪽으로 쏠린다.
 */
const RING_BOTTOM_Y = 252;
const LINE_Y = 208;
const CAPTION_Y = 22;
const BEAD_R = 10;
/** 거리 숫자가 변에서 바깥 법선으로 물러나는 거리. */
const LABEL_GAP = 22;
/** 끊긴 쌍의 숫자가 활 마루에서 더 물러나는 거리. */
const TORN_LABEL_GAP = 17;
/** 끊긴 쌍을 잇는 활의 높이 — 고리에서, 그리고 다 펴졌을 때. */
const ARCH_MIN = 5;
const ARCH_MAX = 100;
/** 활 마루가 넘어서지 않는 위쪽 한계. 펴지는 도중에 캡션을 밀지 않게 한다. */
const ARCH_TOP_Y = 58;
/** 찢어진 자리의 빈틈 (픽셀). */
const TEAR_PX = 9;
/** 마주 보는 쌍을 견주는 두 자의 높이. */
const FAR_ROW_A = LINE_Y + 48;
const FAR_ROW_B = LINE_Y + 66;

const RING_MS = 560;
const CUT_MS = 460;
const UNROLL_MS = 1700;
const KEPT_MS = 780;
const TORN_MS = 520;
const FAR_MS = 640;

type Pt = { x: number; y: number };

export type KeepNeighborsCloseScene = {
  points: Pt[];
  cutAt: number;
  farPair: [number, number];
};

/**
 * `initialData` 를 좁히는 자리는 여기다 (S-piece). projector 가 없어도 반드시
 * 불리는 유일한 경로이므로 좁히는 규칙이 두 벌이 되지 않는다.
 *
 * 러너 밖에서 데이터 없이 띄우는 경우(뷰 전수 검사 등)에는 `null` 을 돌려주고
 * 빈 무대로 남는다. 데이터가 있는데 모양이 어긋나면 그때는 던진다 (C6).
 */
export function readKeepNeighborsCloseScene(
  initialData: unknown,
): KeepNeighborsCloseScene | null {
  if (initialData === undefined || initialData === null) return null;
  if (typeof initialData !== 'object') {
    throw new Error(`keep-neighbors-close: initialData 가 객체가 아니다: ${typeof initialData}`);
  }
  const data = initialData as Record<string, unknown>;
  const rawPoints = data.points;
  if (!Array.isArray(rawPoints) || rawPoints.length < 3) {
    const got = Array.isArray(rawPoints) ? `${rawPoints.length}개` : 'points 없음';
    throw new Error(`keep-neighbors-close: 고리를 이룰 점이 모자라다: ${got}`);
  }
  const points: Pt[] = [];
  for (const raw of rawPoints) {
    const p = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    if (typeof p.x !== 'number' || typeof p.y !== 'number') {
      throw new Error(`keep-neighbors-close: 점의 좌표가 수가 아니다: ${JSON.stringify(raw)}`);
    }
    points.push({ x: p.x, y: p.y });
  }
  const cutAt = data.cutAt;
  if (typeof cutAt !== 'number' || !Number.isInteger(cutAt) || cutAt < 0 || cutAt >= points.length) {
    throw new Error(`keep-neighbors-close: 끊을 자리가 고리 밖이다: ${String(cutAt)}`);
  }
  const rawFar = data.farPair;
  const farA = Array.isArray(rawFar) ? rawFar[0] : undefined;
  const farB = Array.isArray(rawFar) ? rawFar[1] : undefined;
  if (typeof farA !== 'number' || typeof farB !== 'number') {
    throw new Error(`keep-neighbors-close: 마주 보는 쌍이 두 수가 아니다: ${JSON.stringify(rawFar)}`);
  }
  return { points, cutAt, farPair: [farA, farB] };
}

function svg<T extends SVGElement>(name: string, attrs: Record<string, string>): T {
  const node = document.createElementNS(SVG_NS, name) as T;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** (-π, π] 로 감는다. */
function wrap(a: number): number {
  return ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fmt(v: number): string {
  return v.toFixed(2);
}

function quad(a: Pt, c: Pt, b: Pt, s: number): Pt {
  const u = 1 - s;
  return {
    x: u * u * a.x + 2 * u * s * c.x + s * s * b.x,
    y: u * u * a.y + 2 * u * s * c.y + s * s * b.y,
  };
}

function polyline(a: Pt, c: Pt, b: Pt, from: number, to: number): string {
  const steps = 14;
  const out: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = quad(a, c, b, from + ((to - from) * i) / steps);
    out.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return out.join(' ');
}

/**
 * 펴는 모형. 변의 길이와 꼭짓점의 꺾임을 데이터에서 읽어 두고, `t` 에 따라
 * 꺾임만 줄인다. `t=0` 이면 원래 고리와 합동이고 `t=1` 이면 완전한 직선이다.
 */
type ChainModel = {
  order: number[];
  seg: number[];
  cum: number[];
  mid: number;
  scale: number;
  slot: number[];
};

function buildChain(scene: KeepNeighborsCloseScene): ChainModel {
  const n = scene.points.length;
  const order: number[] = [];
  for (let i = 0; i < n; i += 1) order.push((scene.cutAt + 1 + i) % n);
  const slot: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) slot[order[i]] = i;

  const seg: number[] = [];
  const dir: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p = scene.points[order[i]];
    const q = scene.points[order[i + 1]];
    seg.push(Math.hypot(q.x - p.x, q.y - p.y));
    dir.push(Math.atan2(q.y - p.y, q.x - p.x));
  }
  const cum: number[] = [0];
  for (let i = 1; i < dir.length; i += 1) cum.push(cum[i - 1] + wrap(dir[i] - dir[i - 1]));
  const mid = (cum[0] + cum[cum.length - 1]) / 2;
  const total = seg.reduce((a, b) => a + b, 0);
  return { order, seg, cum, mid, scale: (PIECE_CANVAS_W - PAD_X * 2) / total, slot };
}

type Row = { group: SVGGElement; chip: SVGRectElement; text: SVGTextElement };

export const keepNeighborsCloseStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const canvas = params.canvas;
    const scene = readKeepNeighborsCloseScene(params.initialData);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    const root = svg<SVGGElement>('g', {});
    canvas.appendChild(root);

    const caption = svg<SVGTextElement>('text', {
      x: String(W / 2),
      y: String(CAPTION_Y),
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(caption);

    const model = scene ? buildChain(scene) : null;
    const n = scene ? scene.points.length : 0;

    const layerGuide = svg<SVGGElement>('g', {});
    const layerFlash = svg<SVGGElement>('g', {});
    const layerLink = svg<SVGGElement>('g', {});
    const layerTorn = svg<SVGGElement>('g', {});
    const layerFar = svg<SVGGElement>('g', {});
    const layerLabel = svg<SVGGElement>('g', {});
    const layerBead = svg<SVGGElement>('g', {});
    for (const layer of [layerGuide, layerFlash, layerLink, layerTorn, layerFar, layerLabel, layerBead]) {
      root.appendChild(layer);
    }

    const guideRing = svg<SVGCircleElement>('circle', {
      fill: 'none',
      stroke: colors.border,
      'stroke-width': '1.4',
      r: '0',
      cx: '0',
      cy: '0',
    });
    layerGuide.appendChild(guideRing);

    const flashes: SVGLineElement[] = [];
    const links: SVGLineElement[] = [];
    const labels: Row[] = [];
    const beads: Array<{ dot: SVGCircleElement; num: SVGTextElement }> = [];

    for (let i = 0; i < Math.max(0, n - 1); i += 1) {
      flashes.push(
        layerFlash.appendChild(
          svg<SVGLineElement>('line', {
            stroke: colors.accent,
            'stroke-width': '7',
            'stroke-linecap': 'round',
            opacity: '0',
            x1: '0',
            y1: '0',
            x2: '0',
            y2: '0',
          }),
        ),
      );
      links.push(
        layerLink.appendChild(
          svg<SVGLineElement>('line', {
            stroke: colors.text,
            'stroke-width': '2.2',
            'stroke-linecap': 'round',
            x1: '0',
            y1: '0',
            x2: '0',
            y2: '0',
          }),
        ),
      );
    }

    const tornHead = svg<SVGPolylineElement>('polyline', {
      fill: 'none',
      stroke: colors.danger,
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      points: '',
    });
    const tornTail = svg<SVGPolylineElement>('polyline', {
      fill: 'none',
      stroke: colors.danger,
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      points: '',
    });
    layerTorn.appendChild(tornHead);
    layerTorn.appendChild(tornTail);

    const farGuideA = svg<SVGLineElement>('line', {
      stroke: colors.textMuted,
      'stroke-width': '1',
      'stroke-dasharray': '2 3',
      opacity: '0',
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '0',
    });
    const farGuideB = svg<SVGLineElement>('line', {
      stroke: colors.textMuted,
      'stroke-width': '1',
      'stroke-dasharray': '2 3',
      opacity: '0',
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '0',
    });
    const farBarBefore = svg<SVGLineElement>('line', {
      stroke: colors.textMuted,
      'stroke-width': '2',
      'stroke-dasharray': '5 4',
      opacity: '0',
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '0',
    });
    const farBarAfter = svg<SVGRectElement>('rect', {
      fill: colors.accent,
      stroke: colors.text,
      'stroke-width': '0.8',
      rx: '2',
      opacity: '0',
      x: '0',
      y: '0',
      width: '0',
      height: '5',
    });
    const farTextBefore = svg<SVGTextElement>('text', {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      'dominant-baseline': 'middle',
      fill: colors.textMuted,
      opacity: '0',
      x: '0',
      y: '0',
    });
    const farTextAfter = svg<SVGTextElement>('text', {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      'dominant-baseline': 'middle',
      fill: colors.text,
      opacity: '0',
      x: '0',
      y: '0',
    });
    for (const node of [farGuideA, farGuideB, farBarBefore, farBarAfter, farTextBefore, farTextAfter]) {
      layerFar.appendChild(node);
    }

    for (let i = 0; i < n; i += 1) {
      const group = svg<SVGGElement>('g', { opacity: '0' });
      const chip = svg<SVGRectElement>('rect', {
        fill: colors.bg,
        rx: '3',
        x: '0',
        y: '0',
        width: '0',
        height: '15',
      });
      const text = svg<SVGTextElement>('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        x: '0',
        y: '0',
      });
      group.appendChild(chip);
      group.appendChild(text);
      layerLabel.appendChild(group);
      labels.push({ group, chip, text });

      const bead = svg<SVGGElement>('g', {});
      const dot = svg<SVGCircleElement>('circle', {
        fill: colors.itemDefault,
        stroke: colors.text,
        'stroke-width': '1.5',
        r: '0',
        cx: '0',
        cy: '0',
      });
      const num = svg<SVGTextElement>('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.text,
        x: '0',
        y: '0',
      });
      num.textContent = String(i);
      bead.appendChild(dot);
      bead.appendChild(num);
      layerBead.appendChild(bead);
      beads.push({ dot, num });
    }

    type St = {
      visible: boolean;
      t: number;
      grow: number;
      guide: number;
      cut: boolean;
      tear: number;
      pulse: number;
      keptWave: number;
      gaps: number[];
      kept: Map<number, number>;
      tornLabel: string;
      far: { a: number; b: number; before: number; after: number } | null;
      farGrow: number;
    };

    const blank = (): St => ({
      visible: false,
      t: 0,
      grow: 0,
      guide: 0,
      cut: false,
      tear: 0,
      pulse: 0,
      keptWave: 0,
      gaps: [],
      kept: new Map<number, number>(),
      tornLabel: '',
      far: null,
      farGrow: 0,
    });

    let st = blank();

    /** 다 편 뒤의 자리. 알고리즘이 셈한 답이 오면 채워지고, 그 뒤로 줄은 그 답이다. */
    let lineX: number[] | null = null;

    function chainAt(t: number): Pt[] {
      const out: Pt[] = [];
      if (!model) return out;
      if (t >= 1 && lineX) {
        for (let i = 0; i < lineX.length; i += 1) out[i] = { x: lineX[i], y: LINE_Y };
        return out;
      }
      const xs = [0];
      const ys = [0];
      for (let k = 0; k < model.seg.length; k += 1) {
        const th = (1 - t) * (model.cum[k] - model.mid);
        xs.push(xs[k] + model.seg[k] * Math.cos(th));
        ys.push(ys[k] + model.seg[k] * Math.sin(th));
      }
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const cx = (minX + maxX) / 2;
      const bottom = RING_BOTTOM_Y + (LINE_Y - RING_BOTTOM_Y) * t;
      for (let i = 0; i < model.order.length; i += 1) {
        out[model.order[i]] = {
          x: W / 2 + (xs[i] - cx) * model.scale,
          y: bottom - (ys[i] - minY) * model.scale,
        };
      }
      return out;
    }

    // 안내 고리는 t=0 의 체인에서 역산한다 — 어디에도 적어 두지 않는다.
    const ringAt0 = chainAt(0);
    const ringCx = W / 2;
    let ringCy = LINE_Y;
    let ringR = 0;
    if (model && ringAt0.length > 0) {
      const ys = ringAt0.map((p) => p.y);
      ringCy = (Math.min(...ys) + Math.max(...ys)) / 2;
      ringR =
        ringAt0.reduce((acc, p) => acc + Math.hypot(p.x - ringCx, p.y - ringCy), 0) / ringAt0.length;
      guideRing.setAttribute('cx', ringCx.toFixed(1));
      guideRing.setAttribute('cy', ringCy.toFixed(1));
      guideRing.setAttribute('r', ringR.toFixed(1));
    }

    function placeLabel(row: Row, at: Pt, text: string, fill: string, shown: number): void {
      row.text.textContent = text;
      row.text.setAttribute('x', at.x.toFixed(1));
      row.text.setAttribute('y', at.y.toFixed(1));
      row.text.setAttribute('fill', fill);
      const w = text.length * 6.4 + 9;
      row.chip.setAttribute('x', (at.x - w / 2).toFixed(1));
      row.chip.setAttribute('y', (at.y - 7.5).toFixed(1));
      row.chip.setAttribute('width', w.toFixed(1));
      row.group.setAttribute('opacity', shown.toFixed(3));
    }

    function render(): void {
      root.setAttribute('opacity', st.visible ? '1' : '0');
      if (!model || !scene) return;
      const pts = chainAt(st.t);
      const edges = n - 1;

      guideRing.setAttribute('opacity', st.guide.toFixed(3));

      const grown = (ring: number): number => clamp01((st.grow * (n + 3) - model.slot[ring]) / 2.5);

      // ── 지켜지는 변들
      for (let i = 0; i < edges; i += 1) {
        const a = model.order[i];
        const b = model.order[i + 1];
        const pa = pts[a];
        const pb = pts[b];
        const shown = Math.min(grown(a), grown(b));
        const marked = st.keptWave > 0 && i / edges <= st.keptWave;
        const line = links[i];
        line.setAttribute('x1', pa.x.toFixed(1));
        line.setAttribute('y1', pa.y.toFixed(1));
        line.setAttribute('x2', pb.x.toFixed(1));
        line.setAttribute('y2', pb.y.toFixed(1));
        line.setAttribute('opacity', shown.toFixed(3));
        line.setAttribute('stroke-width', marked ? '3.2' : '2.2');

        const head = st.keptWave * (edges + 3) - 1.5;
        const wave = st.keptWave <= 0 ? 0 : Math.max(0, 1 - Math.abs(head - i) / 1.6);
        const flash = flashes[i];
        flash.setAttribute('x1', pa.x.toFixed(1));
        flash.setAttribute('y1', pa.y.toFixed(1));
        flash.setAttribute('x2', pb.x.toFixed(1));
        flash.setAttribute('y2', pb.y.toFixed(1));
        flash.setAttribute('opacity', (wave * shown).toFixed(3));

        // 거리 숫자는 바깥 법선에 매달려 변과 함께 옮겨 다닌다.
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const value = st.kept.get(a) ?? st.gaps[a] ?? model.seg[i];
        placeLabel(
          labels[i],
          { x: (pa.x + pb.x) / 2 + nx * LABEL_GAP, y: (pa.y + pb.y) / 2 + ny * LABEL_GAP },
          fmt(value),
          marked ? colors.text : colors.textMuted,
          shown,
        );
      }

      // ── 끊기는 변
      const ta = pts[scene.cutAt];
      const tb = pts[(scene.cutAt + 1) % n];
      const tdx = tb.x - ta.x;
      const tdy = tb.y - ta.y;
      const chord = Math.hypot(tdx, tdy) || 1;
      const tnx = -tdy / chord;
      const tny = tdx / chord;
      const mx = (ta.x + tb.x) / 2;
      const my = (ta.y + tb.y) / 2;
      let depth = st.cut ? ARCH_MIN + (ARCH_MAX - ARCH_MIN) * st.t : 0;
      // 아직 덜 펴졌을 때는 끊긴 두 점이 위쪽에 있다. 활을 그대로 올리면 캡션을
      // 뚫으므로 한계에서 멈춘다 — 다 펴져 두 점이 내려앉으면 저절로 커진다.
      if (tny < 0 && my + tny * depth < ARCH_TOP_Y) {
        depth = Math.max(0, (my - ARCH_TOP_Y) / -tny);
      }
      const ctrl = { x: mx + tnx * depth * 2, y: my + tny * depth * 2 };
      const half = st.tear * Math.min(0.34, TEAR_PX / chord);
      const tornShown = Math.min(grown(scene.cutAt), grown((scene.cutAt + 1) % n));
      const tornWidth = (st.cut ? 2.4 : 2.2) + 2.6 * st.pulse;
      tornHead.setAttribute('points', polyline(ta, ctrl, tb, 0, Math.max(0, 0.5 - half)));
      tornTail.setAttribute('points', polyline(ta, ctrl, tb, Math.min(1, 0.5 + half), 1));
      for (const part of [tornHead, tornTail]) {
        part.setAttribute('stroke', st.cut ? colors.danger : colors.text);
        part.setAttribute('stroke-width', tornWidth.toFixed(2));
        part.setAttribute('stroke-dasharray', st.cut ? '6 4' : 'none');
        part.setAttribute('opacity', tornShown.toFixed(3));
      }
      const apexGap = depth + (st.cut ? TORN_LABEL_GAP : LABEL_GAP);
      placeLabel(
        labels[edges],
        { x: mx + tnx * apexGap, y: my + tny * apexGap },
        st.tornLabel !== '' ? st.tornLabel : fmt(chord / model.scale),
        st.cut ? colors.danger : colors.textMuted,
        tornShown,
      );

      // ── 점
      for (let i = 0; i < n; i += 1) {
        const p = pts[i];
        const torn = st.cut && (i === scene.cutAt || i === (scene.cutAt + 1) % n);
        const r = BEAD_R * grown(i) * (1 + 0.3 * (torn ? st.pulse : 0));
        const { dot, num } = beads[i];
        dot.setAttribute('cx', p.x.toFixed(1));
        dot.setAttribute('cy', p.y.toFixed(1));
        dot.setAttribute('r', r.toFixed(2));
        dot.setAttribute('fill', torn ? colors.danger : colors.itemDefault);
        dot.setAttribute('stroke', torn ? colors.danger : colors.text);
        num.setAttribute('x', p.x.toFixed(1));
        num.setAttribute('y', p.y.toFixed(1));
        num.setAttribute('fill', torn ? colors.stateInk : colors.text);
        num.setAttribute('opacity', clamp01(grown(i) * 1.6 - 0.6).toFixed(3));
      }

      // ── 마주 보는 쌍을 견주는 두 자
      const far = st.far;
      if (!far) {
        for (const node of [farGuideA, farGuideB, farBarBefore, farBarAfter, farTextBefore, farTextAfter]) {
          node.setAttribute('opacity', '0');
        }
        return;
      }
      const xa = pts[far.a].x;
      const xb = pts[far.b].x;
      const x0 = Math.min(xa, xb);
      const beforeEnd = x0 + far.before * model.scale;
      const afterEnd = x0 + far.after * model.scale * st.farGrow;
      for (const [guide, gx] of [
        [farGuideA, xa],
        [farGuideB, xb],
      ] as Array<[SVGLineElement, number]>) {
        guide.setAttribute('x1', gx.toFixed(1));
        guide.setAttribute('x2', gx.toFixed(1));
        guide.setAttribute('y1', String(LINE_Y + BEAD_R + 3));
        guide.setAttribute('y2', String(FAR_ROW_A + 5));
        guide.setAttribute('opacity', '0.9');
      }
      farBarBefore.setAttribute('x1', x0.toFixed(1));
      farBarBefore.setAttribute('x2', beforeEnd.toFixed(1));
      farBarBefore.setAttribute('y1', String(FAR_ROW_B));
      farBarBefore.setAttribute('y2', String(FAR_ROW_B));
      farBarBefore.setAttribute('opacity', '1');
      farBarAfter.setAttribute('x', x0.toFixed(1));
      farBarAfter.setAttribute('y', String(FAR_ROW_A - 2.5));
      farBarAfter.setAttribute('width', Math.max(0, afterEnd - x0).toFixed(1));
      farBarAfter.setAttribute('opacity', '1');
      farTextBefore.textContent = fmt(far.before);
      farTextBefore.setAttribute('x', (beforeEnd + 7).toFixed(1));
      farTextBefore.setAttribute('y', String(FAR_ROW_B));
      farTextBefore.setAttribute('opacity', '1');
      farTextAfter.textContent = fmt(far.after * st.farGrow);
      farTextAfter.setAttribute('x', (afterEnd + 7).toFixed(1));
      farTextAfter.setAttribute('y', String(FAR_ROW_A));
      farTextAfter.setAttribute('opacity', '1');
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function animate(ms: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          return resolve();
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          step(p);
          if (p >= 1) {
            step(1);
            finish();
            return;
          }
          let id = 0;
          id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    render();

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      async showRing(gaps: number[]): Promise<void> {
        if (model && gaps.length !== n) {
          throw new Error(`keep-neighbors-close: 이웃 쌍의 수가 점의 수와 다르다: ${gaps.length} / ${n}`);
        }
        st = blank();
        st.visible = true;
        st.gaps = gaps;
        lineX = null;
        render();
        await animate(RING_MS, (p) => {
          st.grow = p;
          st.guide = p;
          render();
        });
      },

      async cut(): Promise<void> {
        st.cut = true;
        await animate(CUT_MS, (p) => {
          st.tear = ease(p);
          st.pulse = Math.sin(Math.PI * p);
          render();
        });
        st.pulse = 0;
        render();
      },

      async unroll(positions: number[]): Promise<void> {
        // 편 자리는 알고리즘이 셈한 답이다. 줄의 길이가 그 답에서 나오도록 자를
        // 다시 잡고, 다 편 뒤의 자리도 답을 그대로 쓴다. 여기서 만드는 것은
        // 꺾임이 풀리는 도중의 모양뿐이다.
        if (model && positions.length === n) {
          const span = Math.max(...positions);
          if (span > 0) {
            model.scale = (W - PAD_X * 2) / span;
            lineX = positions.map((v) => PAD_X + v * model.scale);
          }
        }
        await animate(UNROLL_MS, (p) => {
          const e = ease(p);
          st.t = e;
          st.guide = Math.max(0, 1 - e * 2.4);
          render();
        });
      },

      async markKept(pairs: number[], dists: number[]): Promise<void> {
        for (let i = 0; i < pairs.length; i += 1) st.kept.set(pairs[i], dists[i] ?? 0);
        await animate(KEPT_MS, (p) => {
          st.keptWave = p;
          render();
        });
      },

      async showTorn(label: string): Promise<void> {
        st.tornLabel = label;
        await animate(TORN_MS, (p) => {
          st.pulse = Math.sin(Math.PI * p);
          render();
        });
        st.pulse = 0;
        render();
      },

      async showFar(a: number, b: number, before: number, after: number): Promise<void> {
        st.far = { a, b, before, after };
        st.farGrow = 0;
        render();
        await wait(160);
        await animate(FAR_MS, (p) => {
          st.farGrow = ease(p);
          render();
        });
      },

      reset(): void {
        st = blank();
        lineX = null;
        caption.textContent = '';
        render();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
