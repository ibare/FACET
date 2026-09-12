/**
 * hnsw-stage — 한 장의 평면 지도 위에서 여섯 걸음이 한꺼번에 걷는다.
 *
 * ── 형태를 이렇게 고른 까닭
 *
 * 이 화면의 동사는 **닿는다** 이고, 말하려는 것은 "여섯 끝자리가 흩어졌다 한
 * 점으로 모인다" 이다. 그러려면 여섯이 **같은 판 위에서 동시에** 움직여야 한다 —
 * 판을 층마다 따로 두면 여섯의 끝자리를 한눈에 견줄 수 없다.
 *
 * 그래서 층을 판으로 쌓지 않고 **점의 굵기**로 옮겼다. 어떤 점이 어느 층까지
 * 올라가 있는지가 점 크기 한 가지로 읽히고, 손잡이를 돌리면 점들이 굵어지거나
 * 가늘어진다. 지도는 하나로 남고 여섯 걸음이 그 위를 함께 걷는다.
 *
 * (형제 조각 둘이 이미 베지에 활을 따라 걷는 발과 계단처럼 어긋 쌓은 판 세 장을
 * 썼다. 같은 골격을 되풀이하면 도메인이 한 그림이 되므로 둘 다 피했다.)
 *
 * ── 세는 배열과 그리는 배열은 하나다
 *
 * 걸음마다 오는 `walker.seen` 이 그 걸음까지 본 점 전부다. **본 점 표는 그
 * 배열을 돌며 찍고, 캡션의 수도 같은 배열의 길이에서 나온다.** 둘을 따로 셈하지
 * 않으므로 "캡션은 셋이라는데 화면에는 넷" 이 구조적으로 일어날 수 없다.
 *
 * ── 좌표
 *
 * 거리가 뜻을 지는 화면이라 **가로세로 축척을 같게** 둔다. 자료의 가로폭과
 * 세로폭이 달라도 큰 쪽에 맞춰 한 배율만 쓰고, 지도는 정사각형 판에 담아
 * 가운데 놓는다. 그래서 판 좌우에 여백이 남는데 **그것은 축척을 같게 둔 기하
 * 제약의 귀결**이지 상수를 못박아 버린 폭이 아니다 (세로가 판의 한 변을 정하고,
 * 가로는 그 정사각형이 쓰고 남은 만큼이 여백이 된다).
 *
 * SVG 는 y 가 아래로 자라므로 자료의 y 는 뒤집어 그린다 — 평면의 위가 화면의
 * 위여야 한다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 세로가 지도 한 변을 정하므로 둘 다 여기서 한 번만 정한다. */
const W = 480;
const H = 420;
/** 지도 판의 위 여백과, 아래 캡션·범례 띠의 높이. */
const MAP_TOP = 14;
const BOTTOM_BAND = 52;
/** 판 좌우 최소 여백. 정사각형이 쓰고 남은 폭이 여기보다 크면 그대로 여백이 된다. */
const SIDE_MIN = 16;

/** 자료 한 칸이 화면에서 차지하는 폭에 견준 값들 — 점이 서로 21px 안팎으로 선다. */
const DOT_BY_GRADE = [2.6, 3.4, 4.2, 5.0];
/** 본 점 표와 걸음 표가 도는 고리의 반지름. 여섯이 같은 점에 서면 관이 된다. */
const ORBIT = 8;
const SEEN_R = 1.7;
const WALKER_R = 3.4;
/** 한 걸음의 이동 시간. `stepMs` 는 이 애니메이션이 끝난 뒤의 정지 시간이다. */
const ANIM_MS = 340;
const FRAME_MS = 16;

/** 걸음 하나의 상태. projector 가 좁혀서 넘긴다 (C9). */
export type HnswStageWalker = {
  entry: string;
  at: string;
  level: number;
  probed: string[];
  seen: string[];
  done: boolean;
};

/** 층 구조. 점과 질의는 mount 가 `initialData` 에서 받으므로 여기 없다. */
export type HnswStageScene = {
  levels: number;
  /** `members[L]` = 층 L 의 점 id. */
  members: string[][];
  truth: string;
};

export type HnswStageFrame = {
  tick: number;
  levels: number;
  walkers: HnswStageWalker[];
};

type ScenePoint = { id: string; x: number; y: number };

type Scene = {
  points: ScenePoint[];
  query: { x: number; y: number };
  levels: number;
};

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이고, 좁히는 규칙이 두 벌이 되지 않게 한 곳에만 둔다 (S-piece).
 */
function readScene(raw: unknown): Scene {
  const empty: Scene = { points: [], query: { x: 0, y: 0 }, levels: 1 };
  if (typeof raw !== 'object' || raw === null) return empty;
  const d = raw as Record<string, unknown>;

  const points: ScenePoint[] = [];
  if (Array.isArray(d.points)) {
    for (const item of d.points) {
      if (typeof item !== 'object' || item === null) continue;
      const p = item as Record<string, unknown>;
      if (typeof p.id !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      points.push({ id: p.id, x: p.x, y: p.y });
    }
  }

  let query = { x: 0, y: 0 };
  if (typeof d.query === 'object' && d.query !== null) {
    const q = d.query as Record<string, unknown>;
    if (typeof q.x === 'number' && typeof q.y === 'number') query = { x: q.x, y: q.y };
  }

  const levels = typeof d.levels === 'number' ? d.levels : 1;
  return { points, query, levels };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;
}

export const hnswStageView: CanvasView = {
  canvas: { width: W, height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 그 한 줄이
    // 화면을 통째로 지운다 (S-view).
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    // ── 거두어야 할 것들. destroy 가 기다리던 promise 까지 푼다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    async function glide(ms: number, apply: (p: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) return;
        const p = Math.min(1, (Date.now() - started) / ms);
        apply(easeInOut(p));
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    // ── 좌표계. 축척은 가로세로가 같고, 판은 정사각형이다.
    const side = Math.min(W - SIDE_MIN * 2, H - MAP_TOP - BOTTOM_BAND);
    const mapX = Math.round((W - side) / 2);
    const mapY = MAP_TOP;

    const xs = scene.points.map((p) => p.x).concat(scene.query.x);
    const ys = scene.points.map((p) => p.y).concat(scene.query.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 1;
    // 점이 판의 모서리에 붙지 않도록 자료 단위로 숨통을 둔다.
    const PAD = 1;
    const spanX = maxX - minX + PAD * 2;
    const spanY = maxY - minY + PAD * 2;
    const unit = side / Math.max(spanX, spanY);
    const originX = mapX + (side - spanX * unit) / 2;
    const originY = mapY + (side - spanY * unit) / 2;

    const sx = (x: number): number => originX + (x - minX + PAD) * unit;
    // y 를 뒤집는다 — 평면의 위가 화면의 위여야 한다.
    const sy = (y: number): number => originY + (maxY - y + PAD) * unit;

    const posOf = new Map<string, { x: number; y: number }>();
    for (const p of scene.points) posOf.set(p.id, { x: sx(p.x), y: sy(p.y) });

    const tone = categorical(6, 'vivid');
    const colorOf = (i: number): string => tone[i % tone.length] ?? colors.text;
    /** 걸음마다 자기 각을 하나씩 가진다. 여섯이 한 점에 모이면 관이 된다. */
    const angleOf = (i: number): number => (Math.PI * 2 * i) / 6 - Math.PI / 2;
    const orbit = (id: string, i: number, radius: number): { x: number; y: number } => {
      const base = posOf.get(id) ?? { x: mapX + side / 2, y: mapY + side / 2 };
      return {
        x: base.x + Math.cos(angleOf(i)) * radius,
        y: base.y + Math.sin(angleOf(i)) * radius,
      };
    };

    // ── 골격
    const root = el('g');
    canvas.appendChild(root);

    const layerPlate = el('g');
    const trailLayer = el('g');
    const seenLayer = el('g');
    const pointLayer = el('g');
    const markLayer = el('g');
    const walkerLayer = el('g');
    const bandLayer = el('g');
    root.append(layerPlate, trailLayer, seenLayer, pointLayer, markLayer, walkerLayer, bandLayer);

    // 판 — 지도의 영역을 옅게 깔아 둔다.
    layerPlate.appendChild(
      el('rect', {
        x: mapX,
        y: mapY,
        width: side,
        height: side,
        rx: 10,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // 점 — 굵기가 그 점이 오른 층을 말한다.
    const dotOf = new Map<string, SVGCircleElement>();
    for (const p of scene.points) {
      const at = posOf.get(p.id) ?? { x: 0, y: 0 };
      const dot = el('circle', {
        cx: at.x,
        cy: at.y,
        r: DOT_BY_GRADE[0] ?? 2.6,
        fill: colors.textMuted,
      });
      dotOf.set(p.id, dot);
      pointLayer.appendChild(dot);
    }

    // 질의 — 단일 강조. 십자와 고리로 표적처럼 둔다.
    const qx = sx(scene.query.x);
    const qy = sy(scene.query.y);
    markLayer.append(
      el('circle', { cx: qx, cy: qy, r: 9, fill: 'none', stroke: colors.accent, 'stroke-width': 2 }),
      el('line', { x1: qx - 13, y1: qy, x2: qx + 13, y2: qy, stroke: colors.accent, 'stroke-width': 2 }),
      el('line', { x1: qx, y1: qy - 13, x2: qx, y2: qy + 13, stroke: colors.accent, 'stroke-width': 2 }),
    );
    const queryLabel = el('text', {
      x: qx + 15,
      y: qy - 12,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    queryLabel.textContent = t('label.query', 'query');
    markLayer.appendChild(queryLabel);

    // 참 최근접 — 네모 테두리 하나. 질의(원)와 글리프가 갈린다.
    const truthMark = el('rect', {
      width: 20,
      height: 20,
      rx: 3,
      fill: 'none',
      stroke: colors.text,
      'stroke-width': 1.6,
      'stroke-dasharray': '3 2',
      opacity: 0,
    });
    const truthLabel = el('text', {
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      opacity: 0,
    });
    truthLabel.textContent = t('label.target', 'true nearest');
    markLayer.append(truthMark, truthLabel);

    // ── 아래 띠 — 캡션과 범례.
    const caption = el('text', {
      x: SIDE_MIN,
      y: H - BOTTOM_BAND + 20,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    bandLayer.appendChild(caption);

    const legend = el('text', {
      x: SIDE_MIN,
      y: H - BOTTOM_BAND + 40,
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    legend.textContent = t('label.grade', 'bigger dot = higher level');
    bandLayer.appendChild(legend);

    // ── 걸음 여섯. 표와 자취와 이름표를 한 벌로 든다.
    type WalkerArt = {
      token: SVGCircleElement;
      ring: SVGCircleElement;
      name: SVGTextElement;
      trail: SVGPolylineElement;
      path: Array<{ x: number; y: number }>;
      at: { x: number; y: number };
    };
    const walkerArt: WalkerArt[] = [];

    function ensureWalkers(count: number): void {
      while (walkerArt.length < count) {
        const i = walkerArt.length;
        const color = colorOf(i);
        const trail = el('polyline', {
          fill: 'none',
          stroke: color,
          'stroke-width': 1.3,
          'stroke-linejoin': 'round',
          opacity: 0.45,
          points: '',
        });
        const ring = el('circle', { r: WALKER_R + 2.4, fill: 'none', stroke: color, 'stroke-width': 1.2, opacity: 0 });
        // 표에 이름표를 붙여 둔다 — 점의 반지름이 층에 따라 자라다 보니 굵기만으로는
        // 걸음 표와 점이 갈리지 않는다 (검사가 그 자리에서 걸렸다).
        const token = el('circle', { class: 'hnsw-walker', r: WALKER_R, fill: color, cx: -50, cy: -50 });
        const name = el('text', {
          fill: color,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          opacity: 0,
        });
        trailLayer.appendChild(trail);
        walkerLayer.append(ring, token, name);
        walkerArt.push({ token, ring, name, trail, path: [], at: { x: -50, y: -50 } });
      }
    }

    /** 본 점 표 — `seen` 을 돌며 찍는다. 캡션의 수도 같은 배열에서 나온다. */
    function paintSeen(walkers: HnswStageWalker[]): void {
      seenLayer.textContent = '';
      walkers.forEach((w, i) => {
        for (const id of w.seen) {
          const at = orbit(id, i, ORBIT);
          seenLayer.appendChild(
            el('circle', {
              class: 'hnsw-seen',
              cx: at.x,
              cy: at.y,
              r: SEEN_R,
              fill: colorOf(i),
              opacity: 0.85,
            }),
          );
        }
      });
    }

    function placeTruth(id: string): void {
      const at = posOf.get(id);
      if (!at) return;
      truthMark.setAttribute('x', String(at.x - 10));
      truthMark.setAttribute('y', String(at.y - 10));
      truthMark.setAttribute('opacity', '0.9');
      truthLabel.setAttribute('x', String(at.x - 10));
      truthLabel.setAttribute('y', String(at.y + 24));
      truthLabel.setAttribute('opacity', '0.9');
    }

    function clearWalkers(): void {
      seenLayer.textContent = '';
      for (const art of walkerArt) {
        art.path = [];
        art.trail.setAttribute('points', '');
        art.token.setAttribute('cx', '-50');
        art.token.setAttribute('cy', '-50');
        art.ring.setAttribute('opacity', '0');
        art.name.setAttribute('opacity', '0');
        art.at = { x: -50, y: -50 };
      }
    }

    const instance: ViewInstance = {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.remove();
      },

      /** 층 구조가 정해졌다 — 점의 굵기가 자란다. 손잡이가 먼저 만드는 운동이다. */
      setScene(next: HnswStageScene): void {
        clearWalkers();
        placeTruth(next.truth);
        const gradeOf = new Map<string, number>();
        for (const p of scene.points) gradeOf.set(p.id, 0);
        next.members.forEach((ids, level) => {
          for (const id of ids) gradeOf.set(id, Math.max(gradeOf.get(id) ?? 0, level));
        });
        for (const [id, dot] of dotOf) {
          const grade = Math.min(DOT_BY_GRADE.length - 1, gradeOf.get(id) ?? 0);
          dot.setAttribute('r', String(DOT_BY_GRADE[grade] ?? DOT_BY_GRADE[0]));
          dot.setAttribute('fill', grade > 0 ? colors.text : colors.textMuted);
        }
      },

      /** 여섯이 한꺼번에 한 칸 나아간다. */
      async showStep(frame: HnswStageFrame): Promise<void> {
        ensureWalkers(frame.walkers.length);
        paintSeen(frame.walkers);

        const from = frame.walkers.map((_, i) => walkerArt[i]?.at ?? { x: -50, y: -50 });
        const to = frame.walkers.map((w, i) => orbit(w.at, i, ORBIT));

        frame.walkers.forEach((w, i) => {
          const art = walkerArt[i];
          if (!art) return;
          art.ring.setAttribute('opacity', w.done ? '0.9' : '0.35');
          art.name.setAttribute('opacity', '0.9');
          art.name.textContent = w.entry;
          if (art.path.length === 0) {
            // 첫 자리는 이어 붙일 앞자리가 없다.
            art.path.push(to[i] ?? { x: 0, y: 0 });
            art.at = to[i] ?? art.at;
            art.token.setAttribute('cx', String(art.at.x));
            art.token.setAttribute('cy', String(art.at.y));
          }
        });

        await glide(ANIM_MS, (p) => {
          frame.walkers.forEach((_, i) => {
            const art = walkerArt[i];
            const a = from[i];
            const b = to[i];
            if (!art || !a || !b) return;
            const x = a.x + (b.x - a.x) * p;
            const y = a.y + (b.y - a.y) * p;
            art.token.setAttribute('cx', String(x));
            art.token.setAttribute('cy', String(y));
            art.ring.setAttribute('cx', String(x));
            art.ring.setAttribute('cy', String(y));
            art.name.setAttribute('x', String(x));
            art.name.setAttribute('y', String(y - 8));
          });
        });

        frame.walkers.forEach((_, i) => {
          const art = walkerArt[i];
          const b = to[i];
          if (!art || !b) return;
          const last = art.path[art.path.length - 1];
          if (!last || last.x !== b.x || last.y !== b.y) art.path.push(b);
          art.at = b;
          art.trail.setAttribute('points', art.path.map((q) => `${q.x},${q.y}`).join(' '));
        });
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      resetScene(): void {
        clearWalkers();
        caption.textContent = '';
        truthMark.setAttribute('opacity', '0');
        truthLabel.setAttribute('opacity', '0');
      },
    };

    return instance;
  },
};
