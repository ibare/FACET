/**
 * 수용 영역 무대 — 층 격자를 비스듬히 내려다본 평면으로 쌓는다. 입력이 맨 아래, 맨 위 층이 꼭대기.
 *
 * 운동
 *   판 머리    층 평면이 생기고 걷히며, 남는 층은 제 한 변으로 줄거나 늘어 새 높이로 옮겨 간다.
 *              입력은 늘 같은 자리. 앞 판의 입력 위 영역은 채움을 걷고 점선 틀로만 남는다.
 *   걸음 0     맨 위 층의 칸 하나가 점에서 칸으로 선다.
 *   걸음 1…    위 층의 영역이 한 층 아래로 번져 내려가 제 넓이로 펼쳐진다 — 네 모서리가 위 영역의 모서리에서
 *              출발해 아래 영역의 모서리로 옮겨 가고, 그 궤적이 원뿔 선으로 남는다. 마지막 걸음에는 입력 위의
 *              점선 틀(앞 판의 끝 영역)이 이 판의 끝 영역으로 옮겨 간다.
 *
 * 셈하지 않는다 — 층 한 변 · 맨 위 칸 · 층마다의 구간 · 칸 수 · 자리 잡기용 extent 는 모두 projector 가 준다.
 * 무대가 하는 것은 그 값을 평면 좌표로 옮기는 것뿐이다.
 *
 * 타이머: rAF 하나를 돌린다. destroy 에서 cancelAnimationFrame 하고 destroyed 플래그로 막는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 600;

/** 평면 칸의 가로 · 비스듬한 행 밀림 · 행 높이 (세로는 extent 에 맞춰 줄일 수 있다). */
const CELL_W = 16;
const ROW_SHIFT = 8;
const ROW_H = 5;
const LAYER_GAP = 40;
const STACK_TOP = 72;
const STACK_BOTTOM = 584;
const CENTER_X = W / 2 + 20;

/** 층 종류 셋의 평면 색 — categorical(3, 'pastel') 의 차례. 다른 view 가 재현할 일이 없는 view-local 인덱스. */
const KIND_TONE: Record<StageLayerKind, number> = { input: 0, conv: 1, pool: 2 };

export type StageLayerKind = 'input' | 'conv' | 'pool';

export type StageLayer = { id: string; kind: StageLayerKind; number: number; side: number };

export type StageStack = {
  layers: StageLayer[];
  extent: { layerCount: number; sideSum: number };
};

export type StageTop = { layer: string; row: number; col: number; weights: number };

export type StageField = {
  layer: string;
  window: 'conv' | 'pool';
  k: number;
  s: number;
  rowLo: number;
  rowHi: number;
  colLo: number;
  colHi: number;
  side: number;
  cells: number;
  last: boolean;
};

/** projector 가 부르는 표면. */
export type ReceptiveFieldStage = {
  setStack(stack: StageStack, durMs: number): Promise<void>;
  showTop(top: StageTop, durMs: number): Promise<void>;
  showField(field: StageField, durMs: number): Promise<void>;
  clear(): void;
  destroy(): void;
};

type Pt = { x: number; y: number };

type LayerDisp = StageLayer & { cy: number; scale: number };

type RegionDisp = { layer: string; pts: Pt[]; spawn: Pt[]; side: number; cells: number; top: boolean };

type Snap = {
  layers: LayerDisp[];
  regions: RegionDisp[];
  frame: Pt[] | null;
};

const EMPTY: Snap = { layers: [], regions: [], frame: null };

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function lerpPts(a: Pt[], b: Pt[], p: number): Pt[] {
  return b.map((q, i) => {
    const o = a[i];
    if (o === undefined) throw new Error('receptive-field-stage: 모서리 수가 어긋났다');
    return { x: lerp(o.x, q.x, p), y: lerp(o.y, q.y, p) };
  });
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const receptiveFieldStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const tones = categorical(3, 'pastel');
    const smPx = parseFloat(fontSizes.sm);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family', fonts.body);

    const planeG = document.createElementNS(SVG_NS, 'g');
    const coneG = document.createElementNS(SVG_NS, 'g');
    const regionG = document.createElementNS(SVG_NS, 'g');
    const labelG = document.createElementNS(SVG_NS, 'g');
    const caption1 = document.createElementNS(SVG_NS, 'text');
    const caption2 = document.createElementNS(SVG_NS, 'text');
    for (const [el, y, size, fill] of [
      [caption1, 26, fontSizes.md, c.text],
      [caption2, 48, fontSizes.sm, c.textMuted],
    ] as const) {
      el.setAttribute('x', String(W / 2));
      el.setAttribute('y', String(y));
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('font-size', size);
      el.setAttribute('fill', fill);
    }
    svg.append(planeG, coneG, regionG, labelG, caption1, caption2);

    // 세로 축척 — extent 가 오면 한 번 정한다 (판마다 같은 extent 라 자리가 흔들리지 않는다)
    let rowH = ROW_H;
    let gap = LAYER_GAP;

    let target: Snap = EMPTY;
    // 지금 판의 쌓임 — 문안의 층 이름을 곧바로 찾는 자리 (그림의 target 은 운동 차례를 따라 늦게 온다)
    let current: StageLayer[] = [];
    let queue: Array<{ build: (base: Snap) => Snap; dur: number; done: () => void }> = [];
    let anim: { from: Snap; to: Snap; start: number; dur: number; done: () => void } | null = null;
    let raf = 0;
    let destroyed = false;

    const planePt = (l: { side: number; cy: number; scale: number }, u: number, v: number, n: number): Pt => {
      // u = 행 방향(0..n), v = 열 방향(0..n). 평면 크기는 side·scale, 칸 단위는 n 등분.
      const size = l.side * l.scale;
      const cu = (u / n) * size - size / 2;
      const cv = (v / n) * size - size / 2;
      return { x: CENTER_X + cv * CELL_W - cu * ROW_SHIFT, y: l.cy + cu * rowH };
    };

    const layerTone = (kind: StageLayerKind): string => {
      const tone = tones[KIND_TONE[kind]];
      if (tone === undefined) throw new Error('receptive-field-stage: 층 색이 없다');
      return tone;
    };

    const layerName = (l: StageLayer): string => {
      if (l.kind === 'input') return t('layer.input', 'Input');
      if (l.kind === 'conv') return t('layer.conv', 'Conv {n}', { n: l.number });
      return t('layer.pool', 'Pool {n}', { n: l.number });
    };

    const poly = (pts: Pt[]): string => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const mk = (tag: string, attrs: Record<string, string>): SVGElement => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    function draw(s: Snap): void {
      planeG.textContent = '';
      coneG.textContent = '';
      regionG.textContent = '';
      labelG.textContent = '';
      for (const l of s.layers) {
        if (l.scale <= 0.001) continue;
        const n = Math.max(1, Math.round(l.side));
        const corners = [planePt(l, 0, 0, n), planePt(l, 0, n, n), planePt(l, n, n, n), planePt(l, n, 0, n)];
        planeG.append(
          mk('polygon', {
            points: poly(corners),
            fill: layerTone(l.kind),
            'fill-opacity': '0.55',
            stroke: c.textMuted,
            'stroke-width': '1',
            'data-layer': l.id,
          }),
        );
        const lines: string[] = [];
        for (let i = 1; i < n; i += 1) {
          const a = planePt(l, i, 0, n);
          const b = planePt(l, i, n, n);
          const e = planePt(l, 0, i, n);
          const f = planePt(l, n, i, n);
          lines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
          lines.push(`M${e.x.toFixed(1)} ${e.y.toFixed(1)}L${f.x.toFixed(1)} ${f.y.toFixed(1)}`);
        }
        if (lines.length > 0) {
          planeG.append(mk('path', { d: lines.join(''), stroke: c.textMuted, 'stroke-width': '0.6', 'stroke-opacity': '0.35', fill: 'none' }));
        }
        const name = mk('text', {
          x: '16',
          y: String(l.cy - 1),
          'font-size': fontSizes.sm,
          fill: c.text,
          opacity: String(l.scale),
        });
        name.textContent = layerName(l);
        const size = mk('text', {
          x: '16',
          y: String(l.cy + smPx),
          'font-size': fontSizes.xs,
          fill: c.textMuted,
          opacity: String(l.scale),
        });
        size.textContent = t('label.size', '{n}×{n}', { n: l.side < 1 ? 0 : Math.round(l.side) });
        labelG.append(name, size);
      }
      // 원뿔 선 — 위 영역의 모서리에서 아래 영역의 모서리로
      for (let i = 1; i < s.regions.length; i += 1) {
        const up = s.regions[i - 1]!;
        const dn = s.regions[i]!;
        const d = up.pts
          .map((p, j) => {
            const q = dn.pts[j];
            if (q === undefined) throw new Error('receptive-field-stage: 모서리 수가 어긋났다');
            return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
          })
          .join('');
        coneG.append(mk('path', { d, stroke: c.itemActive, 'stroke-width': '1', 'stroke-opacity': '0.6', fill: 'none' }));
      }
      if (s.frame) {
        regionG.append(
          mk('polygon', {
            points: poly(s.frame),
            fill: 'none',
            stroke: c.text,
            'stroke-width': '1.4',
            'stroke-dasharray': '4 3',
            'data-role': 'frame',
          }),
        );
      }
      for (const r of s.regions) {
        regionG.append(
          mk('polygon', {
            points: poly(r.pts),
            fill: r.top ? c.itemActive : c.accent,
            'fill-opacity': r.top ? '0.9' : '0.6',
            stroke: c.itemActive,
            'stroke-width': '1.4',
            'data-region': r.layer,
          }),
        );
        const layer = s.layers.find((l) => l.id === r.layer);
        if (layer === undefined) throw new Error(`receptive-field-stage: 영역의 층 ${r.layer} 이 없다`);
        const lbl = mk('text', {
          x: String(W - 16),
          y: String(layer.cy + smPx / 2),
          'text-anchor': 'end',
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        lbl.textContent = t('label.field', 'Side {side} · {cells} cells', { side: r.side, cells: r.cells });
        labelG.append(lbl);
      }
    }

    function frameAt(a: Snap, b: Snap, p: number): Snap {
      const layers: LayerDisp[] = [];
      for (const l of b.layers) {
        const o = a.layers.find((x) => x.id === l.id);
        layers.push(
          o
            ? { ...l, side: lerp(o.side, l.side, p), cy: lerp(o.cy, l.cy, p), scale: lerp(o.scale, l.scale, p) }
            : { ...l, scale: l.scale * p },
        );
      }
      for (const o of a.layers) {
        if (!b.layers.some((x) => x.id === o.id)) layers.push({ ...o, scale: o.scale * (1 - p) });
      }
      const regions = b.regions.map((r) => {
        const o = a.regions.find((x) => x.layer === r.layer);
        return { ...r, pts: lerpPts(o ? o.pts : r.spawn, r.pts, p) };
      });
      let frame: Pt[] | null = null;
      if (b.frame) frame = a.frame ? lerpPts(a.frame, b.frame, p) : b.frame;
      return { layers, regions, frame };
    }

    function tick(now: number): void {
      raf = 0;
      if (destroyed) return;
      if (anim === null) {
        const next = queue.shift();
        if (next === undefined) return;
        const to = next.build(target);
        anim = { from: target, to, start: now, dur: next.dur, done: next.done };
        target = to;
      }
      const p = anim.dur <= 0 ? 1 : Math.min(1, (now - anim.start) / anim.dur);
      draw(frameAt(anim.from, anim.to, ease(p)));
      if (p >= 1) {
        const done = anim.done;
        anim = null;
        done();
      }
      if (anim !== null || queue.length > 0) raf = requestAnimationFrame(tick);
    }

    function enqueue(build: (base: Snap) => Snap, dur: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        queue.push({ build, dur, done: resolve });
        if (raf === 0) raf = requestAnimationFrame(tick);
      });
    }

    function regionPts(l: LayerDisp, lo: number, hi: number, clo: number, chi: number): Pt[] {
      const n = l.side;
      return [planePt(l, lo, clo, n), planePt(l, lo, chi + 1, n), planePt(l, hi + 1, chi + 1, n), planePt(l, hi + 1, clo, n)];
    }

    function findLayer(s: Snap, id: string): LayerDisp {
      const l = s.layers.find((x) => x.id === id);
      if (l === undefined) throw new Error(`receptive-field-stage: 층 ${id} 이 쌓임에 없다`);
      return l;
    }

    function currentLayer(id: string): StageLayer {
      const l = current.find((x) => x.id === id);
      if (l === undefined) throw new Error(`receptive-field-stage: 층 ${id} 이 지금 판에 없다`);
      return l;
    }

    const api: ReceptiveFieldStage & ViewInstance = {
      setStack(stack, durMs) {
        const { layerCount, sideSum } = stack.extent;
        if (layerCount < 1 || sideSum < 1) throw new Error('receptive-field-stage: extent 가 비었다');
        const need = sideSum * ROW_H + (layerCount - 1) * LAYER_GAP;
        const fit = Math.min(1, (STACK_BOTTOM - STACK_TOP) / need);
        rowH = ROW_H * fit;
        gap = LAYER_GAP * fit;
        current = stack.layers;
        caption1.textContent = '';
        caption2.textContent = '';
        return enqueue((base) => {
          const layers: LayerDisp[] = [];
          let bottom = STACK_BOTTOM;
          for (const l of stack.layers) {
            const h = l.side * rowH;
            layers.push({ ...l, cy: bottom - h / 2, scale: 1 });
            bottom = bottom - h - gap;
          }
          // 앞 판의 입력 위 영역은 채움을 걷고 점선 틀로만 남는다 (자리만 — 결론 글자는 걷는다)
          const inputRegion = base.regions.find((r) => r.layer === 'input');
          const frame = inputRegion ? inputRegion.pts : base.frame;
          return { layers, regions: [], frame };
        }, durMs);
      },
      showTop(top, durMs) {
        caption1.textContent = t('caption.top', 'Top layer {layer} · one cell at row {row}, column {col}', {
          layer: layerName(currentLayer(top.layer)),
          row: top.row + 1,
          col: top.col + 1,
        });
        caption2.textContent = t('caption.weights', 'Learned weights: {weights}', { weights: top.weights });
        return enqueue((base) => {
          const l = findLayer(base, top.layer);
          const pts = regionPts(l, top.row, top.row, top.col, top.col);
          const mid = planePt(l, top.row + 0.5, top.col + 0.5, l.side);
          return {
            ...base,
            regions: [{ layer: top.layer, pts, spawn: pts.map(() => mid), side: 1, cells: 1, top: true }],
          };
        }, durMs);
      },
      showField(field, durMs) {
        const name = layerName(currentLayer(field.layer));
        caption1.textContent =
          field.window === 'pool'
            ? t('caption.pool', 'Back through the pooling window, one layer down · k {k} · s {s}', { k: field.k, s: field.s })
            : t('caption.conv', 'Back through the conv window, one layer down · k {k} · s {s}', { k: field.k, s: field.s });
        caption2.textContent = t('caption.field', '{layer}: rows and columns {lo}–{hi} · side {side} · {cells} cells', {
          layer: name,
          lo: field.rowLo + 1,
          hi: field.rowHi + 1,
          side: field.side,
          cells: field.cells,
        });
        return enqueue((base) => {
          const l = findLayer(base, field.layer);
          const upper = base.regions[base.regions.length - 1];
          if (upper === undefined) throw new Error('receptive-field-stage: 위 층 영역 없이 내려왔다');
          const pts = regionPts(l, field.rowLo, field.rowHi, field.colLo, field.colHi);
          return {
            ...base,
            regions: [...base.regions, { layer: field.layer, pts, spawn: upper.pts, side: field.side, cells: field.cells, top: false }],
            frame: field.last ? pts : base.frame,
          };
        }, durMs);
      },
      clear() {
        queue = [];
        anim = null;
        target = EMPTY;
        current = [];
        caption1.textContent = '';
        caption2.textContent = '';
        draw(EMPTY);
      },
      destroy() {
        destroyed = true;
        if (raf !== 0) cancelAnimationFrame(raf);
        raf = 0;
        queue = [];
        anim = null;
        svg.textContent = '';
      },
    };
    return api;
  },
};
