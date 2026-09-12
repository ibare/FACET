/**
 * coarse-then-fine-stage — 세 겹으로 겹친 같은 평면과, 그 사이를 내려오는 자리.
 *
 * ── 왜 이 그림인가
 *
 * 물음의 동사가 "내려온다" 라서 층이 실제로 아래에 있어야 하고, "자리를 물려준다"
 * 라서 같은 좌표가 층마다 같은 자리에 있어야 한다. 그래서 층 셋을 **같은 축척의
 * 판 세 장**으로 그리고 아래층으로 갈수록 일정한 낙차만큼 내려 깐다. 한 점이
 * 아래층으로 내려가는 길은 언제나 같은 벡터라, 걸어가는 것과 물려주는 것이
 * 화면에서 다른 몸짓이 된다.
 *
 * 판을 눕혀(비스듬히) 얇게 만들면 세로로 훨씬 짧아지지만, 그러면 거리가 방향마다
 * 다르게 찌그러져 **"어느 것이 더 가까운가" 가 화면에서 거짓이 된다.** 이 조각은
 * 가장 가까운 점을 찾는 이야기라 그 왜곡을 받을 수 없다. 판을 찌그러뜨리지 않고
 * 계단처럼 어긋 쌓는 것은 그 때문이다.
 *
 * ── 본 점을 세는 법 (화면이 거짓을 말하지 않게)
 *
 * 한 점은 **처음 거리를 잰 층에서만** 표시된다. 아래층으로 물려받은 자리는 다시
 * 재지 않으므로 표시도 늘지 않는다 — 그것이 층을 쌓아 아끼는 바로 그 몫이다.
 * 그래서 화면에 켜진 점의 수가 캡션의 "본 점" 과 언제나 같다.
 *
 * 지금 서 있는 자리는 점이 아니라 그 위에 씌운 고리로 보인다. 고리는 점 하나에서
 * 다음 점으로, 그리고 층에서 층으로 실제로 움직인다.
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

/** 캔버스 가로는 러너가 정한다 (S-view). 세로는 이 그림이 정한다. */
const CANVAS_W = PIECE_CANVAS_W;
const CANVAS_H = 402;

/** 좌우 최소 여백. 판 크기는 여기서 역산한다 — 상수로는 상한만 둔다. */
const SIDE_MIN = 24;
/** 판과 판 사이 가로 틈. */
const SHEET_GAP = 6;
/** 판 테두리와 점 사이. */
const SHEET_PAD = 16;
/** 평면 한 칸의 화면 길이 상한. */
const UNIT_MAX = 16;
/** 층 하나만큼의 낙차. */
const DROP = 88;
const TOP = 12;
/** 판 아래 캡션이 차지하는 몫 (첫 줄까지의 틈 + 둘째 줄 + 꼬리). */
const CAPTION_GAP = 18;
const CAPTION_LINE = 17;
const CAPTION_BLOCK = CAPTION_GAP + CAPTION_LINE + 12;

const DOT_R = 4.5;
const SEEN_R = 5.5;
const WALKER_R = 9.5;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type CoarseScenePoint = { id: string; x: number; y: number };
export type CoarseSceneLayer = { id: string; members: string[] };

export type CoarseScene = {
  points: CoarseScenePoint[];
  query: { x: number; y: number };
  layers: CoarseSceneLayer[];
};

/**
 * `initialData` 를 좁히는 자리는 여기다 (S-piece).
 *
 * 단언 뒤에 필드마다 `typeof` 가 따라오므로 좁히개이지 회피가 아니다 (C9).
 */
export function readScene(raw: unknown): CoarseScene | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const src = raw as Record<string, unknown>;
  if (!Array.isArray(src.points) || !Array.isArray(src.layers)) return null;

  const points: CoarseScenePoint[] = [];
  for (const item of src.points) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    points.push({ id: p.id, x: p.x, y: p.y });
  }
  if (points.length === 0) return null;

  const layers: CoarseSceneLayer[] = [];
  for (const item of src.layers) {
    if (typeof item !== 'object' || item === null) continue;
    const l = item as Record<string, unknown>;
    if (typeof l.id !== 'string' || !Array.isArray(l.members)) continue;
    layers.push({
      id: l.id,
      members: l.members.filter((m): m is string => typeof m === 'string'),
    });
  }
  if (layers.length === 0) return null;

  const q = src.query;
  if (typeof q !== 'object' || q === null) return null;
  const query = q as Record<string, unknown>;
  if (typeof query.x !== 'number' || typeof query.y !== 'number') return null;

  return { points, layers, query: { x: query.x, y: query.y } };
}

type Spot = { x: number; y: number };

type LayerView = {
  root: SVGGElement;
  trails: SVGGElement;
  spokes: SVGGElement;
  dots: Map<string, SVGCircleElement>;
};

export type EnterArgs = { layer: string; node: string; caption: string };
export type HopArgs = {
  layer: string;
  from: string;
  to: string;
  cands: string[];
  fresh: string[];
  caption: string;
};
export type HandDownArgs = {
  from: string;
  to: string;
  node: string;
  cands: string[];
  fresh: string[];
  caption: string;
};
export type StopArgs = {
  layer: string;
  node: string;
  cands: string[];
  fresh: string[];
  caption: string;
};
export type FoundArgs = { node: string; caption: string };
export type FlatArgs = { layer: string; path: string[]; seen: string[]; caption: string };

export const coarseThenFineStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);

    // ── 접는 장치. 기다리던 promise 를 풀지 않으면 unmount 뒤에도 붙들린다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

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

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
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

    function release(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    if (!scene) {
      // 데이터 없이 마운트된 경우 (러너 밖의 점검 등). 캔버스는 건드리지 않는다.
      const idle = (): Promise<void> => Promise.resolve();
      return {
        reset: (): void => undefined,
        enter: idle,
        hop: idle,
        handDown: idle,
        stop: idle,
        found: idle,
        flat: idle,
        destroy: release,
      };
    }

    // ── 자리 셈. 좌표는 캔버스에서 역산한다 (S-piece).
    const byId = new Map(scene.points.map((p) => [p.id, p]));
    const xs = scene.points.map((p) => p.x).concat(scene.query.x);
    const ys = scene.points.map((p) => p.y).concat(scene.query.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const depth = scene.layers.length;

    const sheetWMax = (CANVAS_W - SIDE_MIN * 2 - (depth - 1) * SHEET_GAP) / depth;
    const roomH = CANVAS_H - TOP - (depth - 1) * DROP - CAPTION_BLOCK;
    const unit = Math.max(
      6,
      Math.floor(
        Math.min(
          UNIT_MAX,
          (sheetWMax - SHEET_PAD * 2) / spanX,
          (roomH - SHEET_PAD * 2) / spanY,
        ),
      ),
    );
    const sheetW = spanX * unit + SHEET_PAD * 2;
    const sheetH = spanY * unit + SHEET_PAD * 2;
    const stride = sheetW + SHEET_GAP;
    const originX = Math.round((CANVAS_W - (depth * sheetW + (depth - 1) * SHEET_GAP)) / 2);
    const captionY = TOP + (depth - 1) * DROP + sheetH + CAPTION_GAP;

    const sheetX = (li: number): number => originX + li * stride;
    const sheetY = (li: number): number => TOP + li * DROP;

    function place(li: number, x: number, y: number): Spot {
      return {
        x: sheetX(li) + SHEET_PAD + (x - minX) * unit,
        y: sheetY(li) + SHEET_PAD + (maxY - y) * unit,
      };
    }

    function spotOf(li: number, id: string): Spot {
      const p = byId.get(id);
      if (!p) return { x: sheetX(li) + sheetW / 2, y: sheetY(li) + sheetH / 2 };
      return place(li, p.x, p.y);
    }

    const layerIndex = new Map(scene.layers.map((l, i) => [l.id, i]));

    // ── 그리기
    const layerViews: LayerView[] = [];
    const dropG = el('g', {});

    for (let li = 0; li < depth; li += 1) {
      const layer = scene.layers[li];
      if (!layer) continue;
      const root = el('g', {});

      root.appendChild(
        el('rect', {
          x: sheetX(li),
          y: sheetY(li),
          width: sheetW,
          height: sheetH,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // 층 이름은 데이터이자 표식이다 — 키를 만들지 않는다 (C10).
      const name = el('text', {
        x: sheetX(li) + 7,
        y: sheetY(li) + 12,
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      name.textContent = layer.id;
      root.appendChild(name);

      const trails = el('g', {});
      const spokes = el('g', {});
      root.appendChild(trails);
      root.appendChild(spokes);

      const dots = new Map<string, SVGCircleElement>();
      for (const id of layer.members) {
        const at = spotOf(li, id);
        const dot = el('circle', {
          cx: at.x,
          cy: at.y,
          r: DOT_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.2,
        });
        dots.set(id, dot);
        root.appendChild(dot);
      }

      // 찾는 자리. 층마다 같은 평면이므로 같은 자리에 놓인다.
      const q = place(li, scene.query.x, scene.query.y);
      root.appendChild(
        el('path', {
          d: `M ${q.x - 7} ${q.y} H ${q.x + 7} M ${q.x} ${q.y - 7} V ${q.y + 7}`,
          stroke: colors.text,
          'stroke-width': 1.5,
          fill: 'none',
        }),
      );
      root.appendChild(
        el('circle', {
          cx: q.x,
          cy: q.y,
          r: 3.2,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.2,
        }),
      );

      svg.appendChild(root);
      layerViews.push({ root, trails, spokes, dots });
    }

    svg.appendChild(dropG);

    const markG = el('g', {});
    svg.appendChild(markG);

    const walker = el('circle', {
      cx: 0,
      cy: 0,
      r: WALKER_R,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 2.6,
      opacity: 0,
    });
    svg.appendChild(walker);

    const walkerTag = el('text', {
      x: 0,
      y: 0,
      fill: colors.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      opacity: 0,
    });
    svg.appendChild(walkerTag);

    const captionLine1 = el('text', {
      x: originX,
      y: captionY,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    const captionLine2 = el('text', {
      x: originX,
      y: captionY + CAPTION_LINE,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    svg.appendChild(captionLine1);
    svg.appendChild(captionLine2);

    // ── 캡션. SVG 는 스스로 줄을 바꾸지 않으므로 폭을 어림해 두 줄로 나눈다.
    const captionW = depth * sheetW + (depth - 1) * SHEET_GAP;

    function widthOf(text: string): number {
      let w = 0;
      for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? 12 : 6.6;
      return w;
    }

    function setCaption(text: string): void {
      const words = text.split(' ');
      let head = '';
      let tail = '';
      for (const word of words) {
        const next = head === '' ? word : `${head} ${word}`;
        if (tail === '' && widthOf(next) <= captionW) head = next;
        else tail = tail === '' ? word : `${tail} ${word}`;
      }
      captionLine1.textContent = head;
      captionLine2.textContent = tail;
    }

    // ── 점의 상태
    function markSeen(li: number, id: string): void {
      const dot = layerViews[li]?.dots.get(id);
      if (!dot) return;
      dot.setAttribute('fill', colors.itemComparing);
      dot.setAttribute('stroke', colors.itemComparing);
      dot.setAttribute('r', String(SEEN_R));
    }

    function markIdle(li: number, id: string): void {
      const dot = layerViews[li]?.dots.get(id);
      if (!dot) return;
      dot.setAttribute('fill', colors.itemDefault);
      dot.setAttribute('stroke', colors.border);
      dot.setAttribute('r', String(DOT_R));
    }

    function moveWalker(x: number, y: number): void {
      walker.setAttribute('cx', String(x));
      walker.setAttribute('cy', String(y));
      const li = Math.max(0, Math.min(depth - 1, Math.round((x - originX) / stride)));
      const rightHalf = x > sheetX(li) + sheetW / 2;
      walkerTag.setAttribute('x', String(x + (rightHalf ? -13 : 13)));
      walkerTag.setAttribute('y', String(y - 11));
      walkerTag.setAttribute('text-anchor', rightHalf ? 'end' : 'start');
    }

    function showWalker(id: string): void {
      walkerTag.textContent = id;
      walker.setAttribute('opacity', '1');
      walkerTag.setAttribute('opacity', '1');
    }

    function drawSpokes(li: number, from: string, cands: string[]): void {
      const view = layerViews[li];
      if (!view) return;
      const a = spotOf(li, from);
      for (const id of cands) {
        const b = spotOf(li, id);
        view.spokes.appendChild(
          el('line', {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
      }
    }

    function clearSpokes(li: number): void {
      const view = layerViews[li];
      if (!view) return;
      while (view.spokes.firstChild) view.spokes.removeChild(view.spokes.firstChild);
    }

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function reset(): void {
      for (let li = 0; li < layerViews.length; li += 1) {
        const view = layerViews[li];
        if (!view) continue;
        view.root.setAttribute('opacity', '1');
        clearGroup(view.trails);
        clearGroup(view.spokes);
        for (const id of view.dots.keys()) markIdle(li, id);
      }
      clearGroup(dropG);
      clearGroup(markG);
      dropG.setAttribute('opacity', '1');
      walker.setAttribute('opacity', '0');
      walkerTag.setAttribute('opacity', '0');
      captionLine1.textContent = '';
      captionLine2.textContent = '';
    }

    async function enter(args: EnterArgs): Promise<void> {
      const li = layerIndex.get(args.layer) ?? 0;
      setCaption(args.caption);
      markSeen(li, args.node);
      const at = spotOf(li, args.node);
      showWalker(args.node);
      await tween(320, (t) => {
        moveWalker(at.x, at.y - 26 * (1 - t));
        walker.setAttribute('opacity', String(t));
        walkerTag.setAttribute('opacity', String(t));
      });
    }

    async function hop(args: HopArgs): Promise<void> {
      const li = layerIndex.get(args.layer) ?? 0;
      const view = layerViews[li];
      setCaption(args.caption);
      drawSpokes(li, args.from, args.cands);
      for (const id of args.fresh) markSeen(li, id);
      await wait(200);

      const a = spotOf(li, args.from);
      const b = spotOf(li, args.to);
      const trail = el('line', {
        x1: a.x,
        y1: a.y,
        x2: a.x,
        y2: a.y,
        stroke: colors.text,
        'stroke-width': 1.8,
      });
      view?.trails.appendChild(trail);

      showWalker(args.to);
      await tween(420, (t) => {
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t);
        moveWalker(x, y);
        trail.setAttribute('x2', String(x));
        trail.setAttribute('y2', String(y));
      });
      clearSpokes(li);
    }

    async function handDown(args: HandDownArgs): Promise<void> {
      const from = layerIndex.get(args.from) ?? 0;
      const to = layerIndex.get(args.to) ?? from + 1;
      setCaption(args.caption);
      drawSpokes(from, args.node, args.cands);
      for (const id of args.fresh) markSeen(from, id);
      await wait(240);
      clearSpokes(from);

      const a = spotOf(from, args.node);
      const b = spotOf(to, args.node);
      const line = el('line', {
        x1: a.x,
        y1: a.y,
        x2: a.x,
        y2: a.y,
        stroke: colors.textMuted,
        'stroke-width': 1.4,
        'stroke-dasharray': '5 4',
      });
      dropG.appendChild(line);

      await tween(560, (t) => {
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t);
        moveWalker(x, y);
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(y));
      });
    }

    async function stop(args: StopArgs): Promise<void> {
      const li = layerIndex.get(args.layer) ?? depth - 1;
      setCaption(args.caption);
      drawSpokes(li, args.node, args.cands);
      for (const id of args.fresh) markSeen(li, id);
      await wait(260);
      // 갈 곳이 없다 — 고리가 한 번 부풀었다 제자리로 돌아온다.
      await tween(340, (t) => {
        walker.setAttribute('r', String(WALKER_R + 4 * Math.sin(Math.PI * t)));
      });
      clearSpokes(li);
    }

    async function found(args: FoundArgs): Promise<void> {
      setCaption(args.caption);
      const li = depth - 1;
      const at = spotOf(li, args.node);
      const ring = el('circle', {
        cx: at.x,
        cy: at.y,
        r: WALKER_R,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      markG.appendChild(ring);
      await tween(420, (t) => {
        ring.setAttribute('r', String(lerp(WALKER_R, WALKER_R + 6, t)));
      });
    }

    async function flat(args: FlatArgs): Promise<void> {
      const li = layerIndex.get(args.layer) ?? depth - 1;
      setCaption(args.caption);

      // 위층은 물러난다 — 한 층만 쓰는 견줌이다.
      const above = layerViews.slice(0, li);
      await tween(240, (t) => {
        const v = String(1 - 0.7 * t);
        for (const view of above) view.root.setAttribute('opacity', v);
        dropG.setAttribute('opacity', v);
      });

      // 판을 비우고 같은 진입점에서 다시 걷는다.
      //
      // 앞 걸음의 자취를 **전부** 지운다. 위층의 표시를 남겨 두면 화면에 켜진 점이
      // 스물둘인데 캡션은 열다섯이라 말하게 된다 — 그림이 거짓을 말하는 자리다.
      // 비워 둔 위층 두 장은 "이 층들은 쓰지 않는다" 를 그대로 보인다.
      for (let k = 0; k < layerViews.length; k += 1) {
        const sheet = layerViews[k];
        if (!sheet) continue;
        clearGroup(sheet.trails);
        for (const id of sheet.dots.keys()) markIdle(k, id);
      }
      clearGroup(dropG);
      clearGroup(markG);
      const view = layerViews[li];

      const stops = args.path.map((id) => spotOf(li, id));
      const head = stops[0];
      const start = args.path[0];
      if (!head || start === undefined) return;

      const from = { x: Number(walker.getAttribute('cx')), y: Number(walker.getAttribute('cy')) };
      showWalker(start);
      await tween(360, (t) => {
        moveWalker(lerp(from.x, head.x, t), lerp(from.y, head.y, t));
      });

      const sweep = el('polyline', {
        points: `${head.x},${head.y}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.8,
      });
      view?.trails.appendChild(sweep);

      const legs = Math.max(1, stops.length - 1);
      await tween(1400, (t) => {
        // 걸음이 지나간 만큼 본 점이 켜진다.
        const lit = Math.round(args.seen.length * t);
        for (let i = 0; i < lit; i += 1) {
          const id = args.seen[i];
          if (id !== undefined) markSeen(li, id);
        }

        const travel = t * legs;
        const leg = Math.min(legs - 1, Math.floor(travel));
        const a = stops[leg];
        const b = stops[leg + 1] ?? a;
        if (!a || !b) return;
        const x = lerp(a.x, b.x, travel - leg);
        const y = lerp(a.y, b.y, travel - leg);
        moveWalker(x, y);
        const drawn = stops
          .slice(0, leg + 1)
          .map((s) => `${s.x},${s.y}`)
          .concat(`${x},${y}`)
          .join(' ');
        sweep.setAttribute('points', drawn);
      });

      for (const id of args.seen) markSeen(li, id);
      const tailId = args.path[args.path.length - 1];
      if (tailId !== undefined) showWalker(tailId);
    }

    return {
      reset,
      enter,
      hop,
      handDown,
      stop,
      found,
      flat,
      destroy(): void {
        release();
      },
    };
  },
};
