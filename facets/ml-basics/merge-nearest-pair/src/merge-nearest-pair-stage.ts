/**
 * mergeNearestPair 의 그림.
 *
 * 화면은 둘로 나뉜다. 왼쪽은 점들이 실제로 놓인 자리 — 거리가 어디서 나오는지를
 * 보이는 무대다. 오른쪽이 주인공으로, **합쳐진 자리가 그 거리만큼 올라가 걸리는**
 * 사다리꼴 나무다. 낮은 가로대는 가까운 것들이고 높은 가로대는 억지로 붙인 것이다.
 *
 * 왼쪽 아래의 띠는 지금 몇 무리인지를 칸으로 보인다. 글자는 자리를 지키고 칸만
 * 자라 서로를 삼킨다 — 합쳐지는 것은 점이 아니라 무리라는 뜻이다.
 *
 * 맺음에서 걸린 높이들이 매듭에서 떨어져 나와 자로 옮겨 붙는다. 한 줄에 모이면
 * 낮은 넷이 바닥에 뭉치고 높은 셋이 훌쩍 떨어져 있는 것이 한눈에 들어온다 —
 * 이 조각이 말하는 것은 나무를 짓는 데까지다. 어디서 자를지는 다른 이야기다.
 *
 * 좌표는 전부 여기서 캔버스로부터 역산한다. 선언에는 점과 걸음 간격만 있다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view). */
const H = 336;

const PAD = 16;
const CAPTION_Y = 24;

// ── 왼쪽: 점이 놓인 자리 + 무리 띠
const MAP_X = PAD;
const MAP_Y = 44;
const MAP_W = 210;
const MAP_H = 190;
const MAP_INSET = 20;
const STRIP_X = MAP_X + MAP_INSET;
const STRIP_W = MAP_W - MAP_INSET * 2;
const STRIP_LABEL_Y = 264;
const STRIP_Y = 278;
const STRIP_H = 16;
const CHIP_GAP = 6;

// ── 오른쪽: 나무와 높이 자
const AXIS_X = 254;
const AXIS_TOP_Y = 56;
const AXIS_LABEL_Y = 38;
const BASE_Y = 300;
const COL_X0 = 280;
const COL_X1 = PIECE_CANVAS_W - PAD;
const LEAF_LABEL_Y = 316;

/**
 * 자의 위 끝.
 *
 * 선언된 여덟 점은 가장 높은 합침이 3.75 라 4 로 끊는다 — 낮은 가로대 넷이
 * 바닥에 몰려 보이는 것이 이 조각의 요점이므로, 자를 데이터 최대에 딱 맞추지
 * 않고 눈금 단위로 끊어 위쪽에 숨 쉴 자리를 남긴다. 자를 넘는 높이가 들어오면
 * 위 끝에 붙여 그린다 (프레임 밖으로 나가지 않게).
 */
const AXIS_MAX = 4;

const DOT_R = 3.5;
const DOT_R_ACTIVE = 5.7;
const NODE_R = 3.2;
/** 자에 옮겨 붙는 높이 표의 반 길이. 자 눈금은 왼쪽, 이 표는 오른쪽에 선다. */
const MARK_HALF = 5;

// ── 걸음 하나 안의 지속 시간. 총 재생 길이는 여기에 stepMs 가 더해진 값이다.
//
// 처음에는 이 여섯의 합이 1,250ms 였다. 걸음당 2.1초가 되어 자동 재생이 16.6초 —
// 같은 배치의 다른 넷(9.6~14.3초)보다 눈에 띄게 길었다. `stepMs` 를 줄이는 것은
// 역효과라(애니메이션이 끝나기 전에 다음 걸음이 온다) 여기를 30% 깎았다.
const MS_SCAN = 140;
const MS_PICK = 105;
const MS_RISE = 265;
const MS_BAR = 120;
const MS_CAP = 105;
const MS_FUSE = 140;
const MS_MARKS = 630;

export type MergeScenePoint = { id: string; x: number; y: number };

export type MergeScene = {
  points: MergeScenePoint[];
};

/**
 * `initialData` 를 좁힌다. 받는 자리는 stage 의 mount 다 — projector 가 없어도
 * 반드시 불리는 유일한 경로이므로 (S-piece).
 */
export function readMergeScene(initialData: unknown): MergeScene {
  if (typeof initialData !== 'object' || initialData === null) return { points: [] };
  const raw = (initialData as Record<string, unknown>).points;
  if (!Array.isArray(raw)) return { points: [] };
  const points: MergeScenePoint[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string') continue;
    if (typeof rec.x !== 'number' || typeof rec.y !== 'number') continue;
    points.push({ id: rec.id, x: rec.x, y: rec.y });
  }
  return { points };
}

/** projector 가 좁혀 넘기는 한 걸음 (C9). */
export type StageMerge = {
  links: { from: string; to: string }[];
  pickFrom: string;
  pickTo: string;
  leftId: string;
  rightId: string;
  nodeId: string;
  height: number;
  remaining: number;
};

type TreeNode = { x: number; y: number; span: [number, number] };
/** 걸린 가로대 하나 — 높이와 매듭의 자리. */
type Branch = { height: number; x: number; y: number };

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

export const mergeNearestPairStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 캔버스 안쪽만 비운다. 컨테이너를 비우면 러너가 붙인 이 캔버스가 떨어져
    // 나간다 (S-view).
    svg.textContent = '';

    const destroyed = { now: false };
    // 걸어 두는 것은 프레임뿐이다 — 이 stage 는 setTimeout 을 쓰지 않고, 뜸을
    // 들이는 자리도 빈 애니메이션으로 잰다. destroy 가 프레임을 거두고 기다리던
    // promise 를 깨운다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function animate(ms: number, tick: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed.now) {
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(id);
          resolve();
        };
        waiters.add(finish);
        const frame = (): void => {
          frames.delete(id);
          if (destroyed.now) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          tick(easeOut(p));
          if (p >= 1) {
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

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      value: string,
      size: string,
      fill: string,
      anchor: string,
      parent: SVGElement,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': fonts.body,
          'font-size': size,
          fill,
          'text-anchor': anchor,
        },
        parent,
      );
      node.textContent = value;
      return node;
    }

    const scene = readMergeScene(params.initialData);
    const pts = scene.points;
    const n = pts.length;

    // ── 자리 셈. 전부 캔버스에서 역산한다.
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 1;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxY = ys.length > 0 ? Math.max(...ys) : 1;
    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const innerW = MAP_W - MAP_INSET * 2;
    const innerH = MAP_H - MAP_INSET * 2;
    // 거리가 그림의 뜻이므로 가로세로 축척을 같게 잡는다 — 늘이면 가까운 쌍이
    // 뒤바뀐다.
    const mapScale = Math.min(innerW / spanX, innerH / spanY);
    const mapOx = MAP_X + (MAP_W - spanX * mapScale) / 2;
    const mapOy = MAP_Y + (MAP_H - spanY * mapScale) / 2;
    const mapX = (v: number): number => mapOx + (v - minX) * mapScale;
    const mapY = (v: number): number => mapOy + (maxY - v) * mapScale;

    const colStep = n > 1 ? (COL_X1 - COL_X0) / (n - 1) : 0;
    const colX = (i: number): number => COL_X0 + i * colStep;
    const yOfHeight = (h: number): number =>
      Math.max(AXIS_TOP_Y, BASE_Y - (h / AXIS_MAX) * (BASE_Y - AXIS_TOP_Y));

    const chipW = n > 0 ? (STRIP_W - CHIP_GAP * (n - 1)) / n : 0;
    const chipX = (i: number): number => STRIP_X + i * (chipW + CHIP_GAP);

    // ── 붙박이 골격
    const gMap = el('g', {}, svg);
    const gStrip = el('g', {}, svg);
    const gTree = el('g', {}, svg);

    const caption = label(PAD, CAPTION_Y, '', fontSizes.md, c.text, 'start', svg);

    el(
      'rect',
      {
        x: MAP_X,
        y: MAP_Y,
        width: MAP_W,
        height: MAP_H,
        rx: radii.md,
        fill: c.bgSubtle,
        stroke: c.border,
      },
      gMap,
    );

    /** 고른 쌍의 선. 걸음마다 하나씩 남아 무리의 모양이 된다. */
    const gEdges = el('g', {}, gMap);
    /** 이 걸음에 재고 있는 후보들. 고르고 나면 지운다. */
    const gScan = el('g', {}, gMap);
    const gDots = el('g', {}, gMap);

    const dots = new Map<string, SVGCircleElement>();
    for (const p of pts) {
      const dot = el(
        'circle',
        {
          cx: mapX(p.x),
          cy: mapY(p.y),
          r: DOT_R,
          fill: c.bg,
          stroke: c.text,
          'stroke-width': 1.2,
        },
        gDots,
      );
      dots.set(p.id, dot);
      label(mapX(p.x) + 7, mapY(p.y) - 5, p.id, fontSizes.xs, c.textMuted, 'start', gDots);
    }

    // 무리 띠 — 글자는 자리를 지키고 칸만 자란다.
    label(
      STRIP_X,
      STRIP_LABEL_Y,
      t('label.remaining', 'clusters left'),
      fontSizes.sm,
      c.textMuted,
      'start',
      gStrip,
    );
    const countText = label(
      STRIP_X + STRIP_W,
      STRIP_LABEL_Y,
      String(n),
      fontSizes.xl,
      c.text,
      'end',
      gStrip,
    );
    const gChips = el('g', {}, gStrip);
    const gChipInk = el('g', {}, gStrip);
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      if (!p) continue;
      label(
        chipX(i) + chipW / 2,
        STRIP_Y + STRIP_H - 4,
        p.id,
        fontSizes.xs,
        c.text,
        'middle',
        gChipInk,
      );
    }

    // 높이 자
    label(
      AXIS_X,
      AXIS_LABEL_Y,
      t('label.axis', 'height = distance'),
      fontSizes.sm,
      c.textMuted,
      'start',
      gTree,
    );
    el(
      'line',
      { x1: AXIS_X, y1: AXIS_TOP_Y, x2: AXIS_X, y2: BASE_Y, stroke: c.border },
      gTree,
    );
    for (let k = 0; k <= AXIS_MAX; k += 1) {
      const y = yOfHeight(k);
      el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border }, gTree);
      label(AXIS_X - 8, y + 4, String(k), fontSizes.xs, c.textMuted, 'end', gTree);
    }
    el(
      'line',
      { x1: AXIS_X, y1: BASE_Y, x2: COL_X1, y2: BASE_Y, stroke: c.border },
      gTree,
    );
    for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      if (!p) continue;
      el('circle', { cx: colX(i), cy: BASE_Y, r: 2.4, fill: c.text }, gTree);
      label(colX(i), LEAF_LABEL_Y, p.id, fontSizes.sm, c.text, 'middle', gTree);
    }

    /** 자라나는 부분. 되감을 때 통째로 비운다. */
    const gBranches = el('g', {}, gTree);
    /** 맺음에서 자로 옮겨 붙는 높이 표. */
    const gMarks = el('g', {}, gTree);

    // ── 자라는 상태
    const nodes = new Map<string, TreeNode>();
    const chips = new Map<string, SVGRectElement>();
    const branches: Branch[] = [];
    /**
     * 되감은 횟수.
     *
     * 다시 보기를 애니메이션 한복판에 누르면 러너는 알고리즘을 끊지만 이미
     * 굴러가던 그림은 제 걸음을 마친다. 그때 그것이 새 판의 상태를 건드리면
     * 안 되므로, 걸음마다 이 수를 쥐고 있다가 어긋나면 손을 뗀다.
     */
    let generation = 0;

    function chipRect(from: number, to: number): SVGRectElement {
      return el(
        'rect',
        {
          x: chipX(from),
          y: STRIP_Y,
          width: chipX(to) + chipW - chipX(from),
          height: STRIP_H,
          rx: radii.sm,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        gChips,
      );
    }

    function resetScene(): void {
      generation += 1;
      nodes.clear();
      chips.clear();
      branches.length = 0;
      gBranches.textContent = '';
      gEdges.textContent = '';
      gScan.textContent = '';
      gChips.textContent = '';
      gMarks.textContent = '';
      for (let i = 0; i < n; i += 1) {
        const p = pts[i];
        if (!p) continue;
        nodes.set(p.id, { x: colX(i), y: BASE_Y, span: [i, i] });
        chips.set(p.id, chipRect(i, i));
      }
      for (const dot of dots.values()) {
        dot.setAttribute('fill', c.bg);
        dot.setAttribute('r', String(DOT_R));
      }
      countText.textContent = String(n);
      caption.textContent = t('caption.start', 'Eight points, and each is a cluster of its own.');
    }

    resetScene();

    /** 후보 실 뻗기 → 가장 짧은 하나만 남기기. */
    async function scanAndPick(m: StageMerge): Promise<SVGLineElement | null> {
      gScan.textContent = '';
      const rows: { line: SVGLineElement; ax: number; ay: number; bx: number; by: number }[] = [];
      let picked: SVGLineElement | null = null;
      for (const link of m.links) {
        const a = pts.find((p) => p.id === link.from);
        const b = pts.find((p) => p.id === link.to);
        if (!a || !b) continue;
        const ax = mapX(a.x);
        const ay = mapY(a.y);
        const bx = mapX(b.x);
        const by = mapY(b.y);
        const line = el(
          'line',
          {
            x1: ax,
            y1: ay,
            x2: ax,
            y2: ay,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-opacity': 0.8,
          },
          gScan,
        );
        rows.push({ line, ax, ay, bx, by });
        const hit =
          (link.from === m.pickFrom && link.to === m.pickTo) ||
          (link.from === m.pickTo && link.to === m.pickFrom);
        if (hit) picked = line;
      }

      await animate(MS_SCAN, (p) => {
        for (const r of rows) {
          r.line.setAttribute('x2', String(r.ax + (r.bx - r.ax) * p));
          r.line.setAttribute('y2', String(r.ay + (r.by - r.ay) * p));
        }
      });

      for (const r of rows) if (r.line !== picked) r.line.remove();
      if (!picked) return null;
      gEdges.appendChild(picked);
      picked.setAttribute('stroke', c.itemActive);
      picked.setAttribute('stroke-width', '2');
      picked.setAttribute('stroke-opacity', '1');

      const endA = dots.get(m.pickFrom);
      const endB = dots.get(m.pickTo);
      for (const d of [endA, endB]) d?.setAttribute('fill', c.itemActive);
      await animate(MS_PICK, (p) => {
        const r = DOT_R + (DOT_R_ACTIVE - DOT_R) * Math.sin(p * Math.PI);
        for (const d of [endA, endB]) d?.setAttribute('r', String(r));
      });
      return picked;
    }

    /** 두 무리가 그 거리만큼 올라가 한 자리에 걸린다. */
    async function raise(lo: TreeNode, hi: TreeNode, m: StageMerge): Promise<void> {
      const gen = generation;
      const top = yOfHeight(m.height);
      const mid = (lo.x + hi.x) / 2;
      const risers = [lo, hi].map((node) =>
        el(
          'line',
          {
            x1: node.x,
            y1: node.y,
            x2: node.x,
            y2: node.y,
            stroke: c.itemActive,
            'stroke-width': 2,
          },
          gBranches,
        ),
      );
      await animate(MS_RISE, (p) => {
        risers.forEach((line, k) => {
          const from = k === 0 ? lo.y : hi.y;
          line.setAttribute('y2', String(from + (top - from) * p));
        });
      });

      const bar = el(
        'line',
        { x1: mid, y1: top, x2: mid, y2: top, stroke: c.itemActive, 'stroke-width': 2 },
        gBranches,
      );
      await animate(MS_BAR, (p) => {
        bar.setAttribute('x1', String(mid - (mid - lo.x) * p));
        bar.setAttribute('x2', String(mid + (hi.x - mid) * p));
      });

      const knot = el('circle', { cx: mid, cy: top, r: 0, fill: c.text }, gBranches);
      const tag = label(mid, top - 6, m.height.toFixed(2), fontSizes.xs, c.textMuted, 'middle', gBranches);
      tag.setAttribute('font-family', fonts.mono);
      tag.setAttribute('opacity', '0');
      await animate(MS_CAP, (p) => {
        knot.setAttribute('r', String(NODE_R * p));
        tag.setAttribute('opacity', String(p));
        tag.setAttribute('y', String(top - 2 - 5 * p));
      });

      for (const part of [...risers, bar]) {
        part.setAttribute('stroke', c.text);
        part.setAttribute('stroke-width', '1.4');
      }
      // 되감긴 뒤라면 이 걸음은 이미 없던 일이다 — 새 판의 상태에 얹지 않는다.
      if (gen !== generation) return;
      branches.push({ height: m.height, x: mid, y: top });
      nodes.set(m.nodeId, {
        x: mid,
        y: top,
        span: [Math.min(lo.span[0], hi.span[0]), Math.max(lo.span[1], hi.span[1])],
      });
    }

    /** 띠의 두 칸이 서로에게 자라 한 칸이 된다. */
    async function fuse(m: StageMerge): Promise<void> {
      const gen = generation;
      const node = nodes.get(m.nodeId);
      const a = chips.get(m.leftId);
      const b = chips.get(m.rightId);
      countText.textContent = String(m.remaining);
      if (!node || !a || !b) return;
      const target = { x: chipX(node.span[0]), w: chipX(node.span[1]) + chipW - chipX(node.span[0]) };
      const from = [a, b].map((rect) => ({
        rect,
        x: Number(rect.getAttribute('x') ?? 0),
        w: Number(rect.getAttribute('width') ?? 0),
      }));
      for (const one of from) one.rect.setAttribute('stroke', c.itemActive);
      await animate(MS_FUSE, (p) => {
        for (const one of from) {
          one.rect.setAttribute('x', String(one.x + (target.x - one.x) * p));
          one.rect.setAttribute('width', String(one.w + (target.w - one.w) * p));
        }
      });
      b.remove();
      a.setAttribute('stroke', c.border);
      if (gen !== generation) return;
      chips.delete(m.leftId);
      chips.delete(m.rightId);
      chips.set(m.nodeId, a);
    }

    return {
      async merge(m: StageMerge): Promise<void> {
        const gen = generation;
        const left = nodes.get(m.leftId);
        const right = nodes.get(m.rightId);
        if (!left || !right) return;
        const lo = left.x <= right.x ? left : right;
        const hi = left.x <= right.x ? right : left;

        const picked = await scanAndPick(m);
        if (destroyed.now || gen !== generation) return;

        caption.textContent = t(
          'caption.merge',
          'The nearest two join, and the joint hangs at the height of that gap. Height: {d}',
          { d: m.height.toFixed(2) },
        );
        await raise(lo, hi, m);
        if (gen !== generation) return;
        await fuse(m);

        picked?.setAttribute('stroke', c.text);
        picked?.setAttribute('stroke-width', '1.4');
        for (const id of [m.pickFrom, m.pickTo]) {
          const dot = dots.get(id);
          dot?.setAttribute('fill', c.bg);
          dot?.setAttribute('r', String(DOT_R));
        }
      },

      /**
       * 맺음 — 걸린 높이들이 매듭에서 떨어져 나와 자로 옮겨 붙는다.
       *
       * 벌어짐은 이미 화면에 있다. 낮은 넷은 바닥 가까이 붙어 있고 높은 셋은
       * 훌쩍 떨어져 있는데, 가로대가 저마다 다른 자리에 있어 그것이 한눈에
       * 들어오지 않는다. 표를 한 줄로 모으면 뭉친 것과 뛴 것이 그대로 드러난다.
       */
      async finish(): Promise<void> {
        const gen = generation;
        caption.textContent = t(
          'caption.done',
          'Four bars huddle low, three leap high — the height is how far apart they were.',
        );
        if (branches.length === 0) return;
        // 캡션이 바뀐 것을 읽을 틈을 준다.
        await animate(MS_CAP, () => {});
        const marks = branches.map((branch) =>
          el(
            'line',
            {
              x1: branch.x - MARK_HALF,
              y1: branch.y,
              x2: branch.x + MARK_HALF,
              y2: branch.y,
              stroke: c.itemActive,
              'stroke-width': 2,
            },
            gMarks,
          ),
        );
        await animate(MS_MARKS, (p) => {
          if (gen !== generation) return;
          marks.forEach((mark, k) => {
            const branch = branches[k];
            if (!branch) return;
            const x = branch.x + (AXIS_X + MARK_HALF - branch.x) * p;
            mark.setAttribute('x1', String(x - MARK_HALF));
            mark.setAttribute('x2', String(x + MARK_HALF));
          });
        });
      },

      rewind(): void {
        resetScene();
      },

      destroy(): void {
        destroyed.now = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
