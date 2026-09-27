/**
 * rasterization — 서로 파고든 두 삼각형에서 누가 보이는지는 칸마다 정해진다.
 *
 * 격자 좌표는 x 오른쪽 · y 아래, 칸 (c, r) 의 중심 (c + 0.5, r + 0.5). 칸이 삼각형 안인지는 중심 하나로
 * 모서리 함수 E(u, v; p) = (v.x − u.x)(p.y − u.y) − (v.y − u.y)(p.x − u.x) 셋이 모두 양수인지로 가른다.
 * 깊이는 무게중심으로 화면 공간에서 선형 보간한다. 깊이 0 이 가깝고 1 이 멀다.
 *
 * 두 가림 방식:
 *   - depth-buffer: 버퍼는 모든 칸 clearDepth 에서 시작, triangles 차례(A 다음 B)로 넣고 엄격한 < 로만 덮어쓴다
 *   - painter: 삼각형마다 무게중심 깊이(세 꼭짓점 깊이의 평균)로 먼 쪽을 먼저, 가까운 쪽을 나중에 깊이 견줌 없이 칠한다
 *
 * 동률 규칙 — 모두 던진다 (데이터와 사다리에서 뺐다. 이 데이터에서 실제로 걸리는 자리는 0 이다):
 *   - 칸 중심의 모서리 함수가 0 (경계 위 중심, top-left 규칙은 모형에 없다)
 *   - E(v1, v2; v3) ≤ 0 (꼭짓점 차례)
 *   - 깊이 버퍼에서 새 깊이 == 버퍼 깊이
 *   - 화가 알고리즘에서 두 무게중심 깊이가 같다
 *
 * 셈은 IR(`irs.ts`)과 같은 식 · 같은 차례로 한다 — 깊이 비교가 같은 부동소수 값을 보게.
 *
 * ── 이벤트 (silent 여부 · payload) ──────────────────────────────────────────────
 *   phase           silent  { phase: string }
 *   init            silent  { mode: 'depth-buffer' | 'painter', width, height, motionMs,
 *                             triangles: { id, vertices: [x, y][], depths: number[] }[],
 *                             knob: { triangle, vertex, depth, previousDepth: number | null },
 *                             nearDepth, clearDepth, ticks: number[],
 *                             previousLine: Line | null }
 *   cover           걸음    { triangles: { id, cells: number[] }[], overlap: number[] }
 *   interpolate     걸음    { triangle, cells: { k, z }[], min, max, other: { id, min, max, flat } }   (depth-buffer)
 *   order           걸음    { centroids: { id, depth }[], first, second }                         (painter)
 *   depth-insert    걸음    { triangle, empty: number[], overwritten: number[], discarded: number[] } (depth-buffer, 둘)
 *   paint           걸음    { triangle, rank: 'far' | 'near', cells: number[], covered: number[] }   (painter, 둘)
 *   count           걸음    { mode, counted, other, countedWins, otherWins, truthCountedWins, overlap: number,
 *                             owners: { k, id }[], wrong: number[], line: Line | null }
 *   Line = { x1, y1, x2, y2 } — 격자 좌표. 칸 번호 k = r * width + c.
 *
 * ── phase 어휘 (irs.ts 와 같은 집합) ──────────────────────────────────────────────
 *   cover · interpolate · depth-test · order · paint · count
 *
 * ── 계기 ──────────────────────────────────────────────────────────────────────
 *   b-wins       겹친 칸 가운데 이 방식에서 손잡이 삼각형(B)이 이긴 칸. 판 머리 0, 걸음 5 에서 셈한 값
 *   wrong-cells  겹친 칸 가운데 이 방식의 주인이 깊이 버퍼의 주인과 다른 칸. 판 머리 0, 걸음 5
 *
 * ── 손잡이 ────────────────────────────────────────────────────────────────────
 *   set-vertex-depth  value ∈ depthLadder — 손잡이 삼각형의 knob.vertex 꼭짓점 깊이
 *   set-hiding        value ∈ 0 .. hidingModes.length − 1
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RasterTriangle = {
  id: string;
  vertices: number[][];
  depths: number[];
};

export type RasterizationData = {
  type: 'rasterization';
  stepMs: number;
  motionMs: number;
  width: number;
  height: number;
  triangles: RasterTriangle[];
  knob: { triangle: string; vertex: number };
  depthLadder: number[];
  defaultDepth: number;
  hidingModes: string[];
  defaultHiding: number;
  nearDepth: number;
  clearDepth: number;
};

export type MeetLine = { x1: number; y1: number; x2: number; y2: number };

export type DepthInsert = { triangle: string; empty: number[]; overwritten: number[]; discarded: number[] };

export type RasterRound = {
  mode: string;
  zs: number[][];
  cells: { id: string; cells: { k: number; z: number }[] }[];
  overlap: number[];
  truth: Map<number, string>;
  owner: Map<number, string>;
  inserts: DepthInsert[];
  centroids: { id: string; depth: number }[];
  paintOrder: string[];
  countedWins: number;
  truthCountedWins: number;
  otherWins: number;
  wrong: number[];
  line: MeetLine | null;
  range: { id: string; min: number; max: number }[];
};

// ── 좁히개 ─────────────────────────────────────────────────────────────────────

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`rasterization: ${what} 가 수가 아니다`);
  return v;
}

function int(v: unknown, what: string): number {
  const n = num(v, what);
  if (!Number.isInteger(n)) throw new Error(`rasterization: ${what} 가 정수가 아니다`);
  return n;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`rasterization: ${what} 가 문자열이 아니다`);
  return v;
}

function field(o: unknown, key: string, what: string): unknown {
  if (typeof o !== 'object' || o === null) throw new Error(`rasterization: ${what} 가 객체가 아니다`);
  return (o as Record<string, unknown>)[key];
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`rasterization: ${what} 가 배열이 아니다`);
  return v;
}

export function readRasterizationData(raw: unknown): RasterizationData {
  if (field(raw, 'type', 'data') !== 'rasterization') throw new Error('rasterization: data.type 이 rasterization 이 아니다');
  const triangles = list(field(raw, 'triangles', 'data'), 'triangles').map((tr, i) => {
    const vertices = list(field(tr, 'vertices', `triangles[${i}]`), `triangles[${i}].vertices`).map((v, j) => {
      const xy = list(v, `triangles[${i}].vertices[${j}]`);
      if (xy.length !== 2) throw new Error(`rasterization: triangles[${i}].vertices[${j}] 가 좌표 둘이 아니다`);
      return [num(xy[0], 'x'), num(xy[1], 'y')];
    });
    const depths = list(field(tr, 'depths', `triangles[${i}]`), `triangles[${i}].depths`).map((z) => num(z, 'depth'));
    if (vertices.length !== 3 || depths.length !== 3) throw new Error(`rasterization: triangles[${i}] 가 꼭짓점 셋이 아니다`);
    return { id: str(field(tr, 'id', `triangles[${i}]`), 'id'), vertices, depths };
  });
  if (triangles.length !== 2) throw new Error('rasterization: 삼각형이 둘이 아니다');
  const knobRaw = field(raw, 'knob', 'data');
  const knob = { triangle: str(field(knobRaw, 'triangle', 'knob'), 'knob.triangle'), vertex: int(field(knobRaw, 'vertex', 'knob'), 'knob.vertex') };
  // 계기 b-wins 와 IR 의 owner == 2 는 둘째 삼각형을 센다 — 손잡이 삼각형이 둘째여야 한다
  if (triangles[1].id !== knob.triangle) throw new Error(`rasterization: 손잡이 삼각형 ${knob.triangle} 가 둘째 삼각형이 아니다`);
  if (knob.vertex < 0 || knob.vertex > 2) throw new Error('rasterization: knob.vertex 가 0..2 밖이다');
  const depthLadder = list(field(raw, 'depthLadder', 'data'), 'depthLadder').map((z) => num(z, 'depthLadder'));
  const hidingModes = list(field(raw, 'hidingModes', 'data'), 'hidingModes').map((m) => str(m, 'hidingModes'));
  const data: RasterizationData = {
    type: 'rasterization',
    stepMs: num(field(raw, 'stepMs', 'data'), 'stepMs'),
    motionMs: num(field(raw, 'motionMs', 'data'), 'motionMs'),
    width: int(field(raw, 'width', 'data'), 'width'),
    height: int(field(raw, 'height', 'data'), 'height'),
    triangles,
    knob,
    depthLadder,
    defaultDepth: num(field(raw, 'defaultDepth', 'data'), 'defaultDepth'),
    hidingModes,
    defaultHiding: int(field(raw, 'defaultHiding', 'data'), 'defaultHiding'),
    nearDepth: num(field(raw, 'nearDepth', 'data'), 'nearDepth'),
    clearDepth: num(field(raw, 'clearDepth', 'data'), 'clearDepth'),
  };
  if (!depthLadder.includes(data.defaultDepth)) throw new Error('rasterization: defaultDepth 가 사다리에 없다');
  if (data.defaultHiding < 0 || data.defaultHiding >= hidingModes.length) throw new Error('rasterization: defaultHiding 이 방식 목록 밖이다');
  return data;
}

// ── 셈 (IR 과 같은 식 · 같은 차례) ─────────────────────────────────────────────────

/** 모서리 함수 E(a, b; p) — IR 의 edge 와 같은 식 */
export function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/** 덮는 칸과 보간 깊이 — 행 · 열 차례. 경계 위 중심과 거꾸로 적힌 꼭짓점은 던진다 */
function rasterTriangle(tri: RasterTriangle, zs: number[], w: number, h: number): { k: number; z: number }[] {
  const [a, b, c] = tri.vertices;
  const area = edge(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (area <= 0) throw new Error(`rasterization: ${tri.id} 의 꼭짓점 차례가 E(v1, v2; v3) > 0 이 아니다`);
  const out: { k: number; z: number }[] = [];
  for (let r = 0; r < h; r += 1) {
    for (let col = 0; col < w; col += 1) {
      const px = col + 0.5;
      const py = r + 0.5;
      const w0 = edge(b[0], b[1], c[0], c[1], px, py);
      const w1 = edge(c[0], c[1], a[0], a[1], px, py);
      const w2 = edge(a[0], a[1], b[0], b[1], px, py);
      if (w0 === 0 || w1 === 0 || w2 === 0) throw new Error(`rasterization: 칸 (${col}, ${r}) 중심이 ${tri.id} 의 모서리 위다`);
      if (w0 > 0 && w1 > 0 && w2 > 0) {
        out.push({ k: r * w + col, z: (w0 * zs[0] + w1 * zs[1] + w2 * zs[2]) / area });
      }
    }
  }
  return out;
}

/** 삼각형 평면의 깊이 — 격자 안 어느 점이든 (만나는 선용) */
function planeDepth(tri: RasterTriangle, zs: number[], px: number, py: number): number {
  const [a, b, c] = tri.vertices;
  const area = edge(a[0], a[1], b[0], b[1], c[0], c[1]);
  return (edge(b[0], b[1], c[0], c[1], px, py) * zs[0] + edge(c[0], c[1], a[0], a[1], px, py) * zs[1] + edge(a[0], a[1], b[0], b[1], px, py) * zs[2]) / area;
}

/**
 * 만나는 선 — 두 평면의 깊이가 같은 직선을 두 삼각형의 반평면 여섯으로 자른 선분. 안을 지나지 않으면 null.
 * 깊이 차 d(p) = z_B(p) − z_A(p) 가 p 에 선형이라 d = gx·x + gy·y + k 로 놓고, 직선 위 한 점 p0 에서 방향 (−gy, gx) 로
 * 매개변수 s 를 잡아 E(u, v; p0 + s·d) > 0 을 s 에 대해 푼다.
 */
function meetLine(first: RasterTriangle, firstZ: number[], second: RasterTriangle, secondZ: number[]): MeetLine | null {
  const diff = (x: number, y: number) => planeDepth(second, secondZ, x, y) - planeDepth(first, firstZ, x, y);
  const k = diff(0, 0);
  const gx = diff(1, 0) - k;
  const gy = diff(0, 1) - k;
  const g2 = gx * gx + gy * gy;
  if (g2 === 0) return null;
  const p0x = (gx * -k) / g2;
  const p0y = (gy * -k) / g2;
  const dx = -gy;
  const dy = gx;
  let lo = -Infinity;
  let hi = Infinity;
  for (const tri of [first, second]) {
    const vs = tri.vertices;
    for (let i = 0; i < 3; i += 1) {
      const u = vs[i];
      const v = vs[(i + 1) % 3];
      const e0 = edge(u[0], u[1], v[0], v[1], p0x, p0y);
      const e1 = edge(u[0], u[1], v[0], v[1], p0x + dx, p0y + dy) - e0;
      if (Math.abs(e1) < 1e-15) {
        if (e0 <= 0) return null;
        continue;
      }
      const s = -e0 / e1;
      if (e1 > 0) lo = Math.max(lo, s);
      else hi = Math.min(hi, s);
    }
  }
  if (!(lo < hi)) return null;
  return { x1: p0x + lo * dx, y1: p0y + lo * dy, x2: p0x + hi * dx, y2: p0y + hi * dy };
}

/** 한 판의 셈 전부 — 손잡이 깊이 zb 와 방식 색인 modeIdx 로 */
export function rasterizeRound(data: RasterizationData, zb: number, modeIdx: number): RasterRound {
  const mode = data.hidingModes[modeIdx];
  if (mode !== 'depth-buffer' && mode !== 'painter') throw new Error(`rasterization: 모르는 가림 방식 ${String(mode)}`);
  const [first, second] = data.triangles;
  const zs = data.triangles.map((tr) => (tr.id === data.knob.triangle ? tr.depths.map((z, i) => (i === data.knob.vertex ? zb : z)) : [...tr.depths]));
  const cells = data.triangles.map((tr, i) => ({ id: tr.id, cells: rasterTriangle(tr, zs[i], data.width, data.height) }));
  const inSecond = new Set(cells[1].cells.map((c) => c.k));
  const overlap = cells[0].cells.map((c) => c.k).filter((k) => inSecond.has(k));

  // 깊이 버퍼 — 참. triangles 차례로 넣는다
  const depth = new Map<number, number>();
  const truth = new Map<number, string>();
  const inserts: DepthInsert[] = [];
  for (const layer of cells) {
    const ins: DepthInsert = { triangle: layer.id, empty: [], overwritten: [], discarded: [] };
    for (const { k, z } of layer.cells) {
      const cur = depth.get(k) ?? data.clearDepth; // 버퍼 시작값 — 아직 쓰지 않은 칸
      if (z === cur) throw new Error(`rasterization: 칸 ${k} 에서 깊이 동률 (${z})`);
      if (z < cur) {
        if (truth.has(k)) ins.overwritten.push(k);
        else ins.empty.push(k);
        depth.set(k, z);
        truth.set(k, layer.id);
      } else {
        ins.discarded.push(k);
      }
    }
    inserts.push(ins);
  }

  // 화가 알고리즘 — 무게중심 깊이로 삼각형째 차례
  const centroids = data.triangles.map((tr, i) => ({ id: tr.id, depth: (zs[i][0] + zs[i][1] + zs[i][2]) / 3 }));
  if (centroids[0].depth === centroids[1].depth) throw new Error('rasterization: 무게중심 깊이 동률');
  const backIdx = centroids[1].depth > centroids[0].depth ? 1 : 0;
  const paintOrder = [cells[backIdx].id, cells[1 - backIdx].id];

  let owner: Map<number, string>;
  if (mode === 'depth-buffer') {
    owner = truth;
  } else {
    owner = new Map<number, string>();
    for (const idx of [backIdx, 1 - backIdx]) {
      for (const { k } of cells[idx].cells) owner.set(k, cells[idx].id);
    }
  }

  let countedWins = 0;
  let truthCountedWins = 0;
  const wrong: number[] = [];
  for (const k of overlap) {
    const o = owner.get(k);
    const tr = truth.get(k);
    if (o === undefined || tr === undefined) throw new Error(`rasterization: 겹친 칸 ${k} 에 주인이 없다`);
    if (o === second.id) countedWins += 1;
    if (tr === second.id) truthCountedWins += 1;
    if (o !== tr) wrong.push(k);
  }

  const range = cells.map((c) => {
    if (c.cells.length === 0) throw new Error(`rasterization: ${c.id} 가 덮는 칸이 없다`);
    const z = c.cells.map((x) => x.z);
    return { id: c.id, min: Math.min(...z), max: Math.max(...z) };
  });

  return {
    mode,
    zs,
    cells,
    overlap,
    truth,
    owner,
    inserts,
    centroids,
    paintOrder,
    countedWins,
    truthCountedWins,
    otherWins: overlap.length - countedWins,
    wrong,
    line: meetLine(first, zs[0], second, zs[1]),
    range,
  };
}

// ── 알고리즘 ───────────────────────────────────────────────────────────────────

function inputValue(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as { value?: unknown }).value;
}

export async function rasterizationAlgorithm(ctx: FacetContext<RasterizationData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RasterizationData>;
  const data = readRasterizationData(ctx.data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === undefined || value !== prev) ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };

  const ticks = [0, 1, 2, 3, 4].map((i) => data.nearDepth + ((data.clearDepth - data.nearDepth) * i) / 4);
  let zb = data.defaultDepth;
  let modeIdx = data.defaultHiding;
  let previousDepth: number | null = null;
  let previousLine: MeetLine | null = null;

  try {
    while (true) {
      if (ctx.cancelled) return;
      const round = rasterizeRound(data, zb, modeIdx);
      const [first, second] = data.triangles;

      await ctx.emit({
        type: 'init',
        silent: true,
        payload: {
          mode: round.mode,
          width: data.width,
          height: data.height,
          motionMs: data.motionMs,
          triangles: data.triangles.map((tr, i) => ({ id: tr.id, vertices: tr.vertices, depths: round.zs[i] })),
          knob: { triangle: data.knob.triangle, vertex: data.knob.vertex, depth: zb, previousDepth },
          nearDepth: data.nearDepth,
          clearDepth: data.clearDepth,
          ticks,
          previousLine,
        },
      });
      setMetric('b-wins', 0);
      setMetric('wrong-cells', 0);
      if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;

      // 걸음 1 — 덮는 칸
      await phase('cover');
      await ctx.emit({
        type: 'cover',
        payload: { triangles: round.cells.map((c) => ({ id: c.id, cells: c.cells.map((x) => x.k) })), overlap: round.overlap },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      if (round.mode === 'depth-buffer') {
        // 걸음 2 — 손잡이 삼각형의 보간 깊이
        await phase('interpolate');
        const bRange = round.range[1];
        const aRange = round.range[0];
        await ctx.emit({
          type: 'interpolate',
          payload: {
            triangle: second.id,
            cells: round.cells[1].cells.map((x) => ({ k: x.k, z: x.z })),
            min: bRange.min,
            max: bRange.max,
            other: { id: first.id, min: aRange.min, max: aRange.max, flat: first.depths.every((z) => z === first.depths[0]) },
          },
        });
        if (!(await rctx.sleep(data.stepMs))) return;
        // 걸음 3 · 4 — 차례대로 버퍼에 넣는다
        for (const ins of round.inserts) {
          if (ctx.cancelled) return;
          await phase('depth-test');
          await ctx.emit({
            type: 'depth-insert',
            payload: { triangle: ins.triangle, empty: ins.empty, overwritten: ins.overwritten, discarded: ins.discarded },
          });
          if (!(await rctx.sleep(data.stepMs))) return;
        }
      } else {
        // 걸음 2 — 무게중심 깊이로 차례
        await phase('order');
        await ctx.emit({
          type: 'order',
          payload: { centroids: round.centroids, first: round.paintOrder[0], second: round.paintOrder[1] },
        });
        if (!(await rctx.sleep(data.stepMs))) return;
        // 걸음 3 · 4 — 먼 쪽 다음 가까운 쪽, 깊이 견줌 없이
        const painted = new Set<number>();
        for (const [rank, id] of round.paintOrder.entries()) {
          if (ctx.cancelled) return;
          const layer = round.cells.find((c) => c.id === id);
          if (!layer) throw new Error(`rasterization: 칠할 삼각형 ${id} 가 없다`);
          const ks = layer.cells.map((x) => x.k);
          const covered = ks.filter((k) => painted.has(k));
          for (const k of ks) painted.add(k);
          await phase('paint');
          await ctx.emit({ type: 'paint', payload: { triangle: id, rank: rank === 0 ? 'far' : 'near', cells: ks, covered } });
          if (!(await rctx.sleep(data.stepMs))) return;
        }
      }

      // 걸음 5 — 센다
      await phase('count');
      setMetric('b-wins', round.countedWins);
      setMetric('wrong-cells', round.wrong.length);
      await ctx.emit({
        type: 'count',
        payload: {
          mode: round.mode,
          counted: second.id,
          other: first.id,
          countedWins: round.countedWins,
          truthCountedWins: round.truthCountedWins,
          otherWins: round.otherWins,
          overlap: round.overlap.length,
          owners: round.overlap.map((k) => ({ k, id: round.owner.get(k) })),
          wrong: round.wrong,
          line: round.line,
        },
      });
      previousDepth = zb;
      previousLine = round.line;

      // 입력 대기 — 우리 손잡이만 받고 나머지는 흘린다
      while (true) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const value = inputValue(input.payload);
        if (input.type === 'set-vertex-depth') {
          if (typeof value !== 'number' || !data.depthLadder.includes(value)) {
            throw new Error(`rasterization: 꼭짓점 깊이 ${String(value)} 가 사다리에 없다`);
          }
          zb = value;
          break;
        }
        if (input.type === 'set-hiding') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.hidingModes.length) {
            throw new Error(`rasterization: 가림 방식 ${String(value)} 가 목록에 없다`);
          }
          modeIdx = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
