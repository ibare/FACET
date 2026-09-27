/**
 * 카메라와 투영 — 눈의 거리를 바꾸면 앞/뒤 두 상자의 상의 폭 비가 어떻게 옮겨 가는가.
 *
 * 한 판(판 머리 + 네 걸음)은 지금 손잡이 값(눈의 거리 d · 투영)으로 셈한다:
 *   look-at(판 머리 한 번) → 모서리마다 카메라 좌표 → 가까운 면 자르기(카메라 공간, 투영 앞)
 *   → 원근 x′ = f·x/(−z) 또는 직교 x′ = x/orthoHalf → 상의 폭 = x′ 최대 − 최소 → 앞/뒤 비.
 * IR(`irs.ts`) 의 widthRatio / boxWidth 와 같은 차례 · 같은 산술로 셈한다 (seg 를 한 끝씩 채우고,
 * 잘린 끝은 안쪽 끝에서 along 만큼 간 점으로 바꾼다).
 *
 * 좌표: 오른손 · y 위 · 카메라는 −z 를 본다 · 깊이 = −z (양수가 앞). 시야각은 도.
 * 초점 f = 1 / tan(fovDeg / 2) 는 여기서 셈해 IR 에 넘긴다 (IR 에 삼각함수가 없다).
 * 동률: 실수 동률이 가를 자리가 없다. 깊이가 near 와 같은 꼭짓점은 셈할 수 없어 던진다
 * (IR 은 −1 을 돌려준다). 길이 0 인 시선 · 외적도 던진다.
 *
 * 이벤트 (silent 는 round 와 phase 뿐 — 걸음 이벤트는 silent 가 아니다):
 *   round    (silent, 판 머리) { distance: number, projection: 'perspective'|'orthographic',
 *              eye: V3, axes: { right: V3, up: V3, forward: V3 }, near: number, orthoHalf: number,
 *              halfTan: number (= tan(fovDeg/2), 원근 쐐기의 기울기), motionMs: number,
 *              boxes: { id: string, corners: V3[8] (세계), edges: [number, number][] }[],
 *              topRange: { zMin: number, zMax: number } (위에서 본 그림의 세계 z 범위),
 *              ratioScale: { min: number, max: number } (비 눈금 — 사다리 전체의 비가 들어간다) }
 *   camera   (걸음 1) { boxes: { id, depthMin, depthMax, nearAt: V3, farAt: V3 }[] }
 *              nearAt / farAt = 눈 + 앞 축 × 깊이 (깊이 막대의 두 끝, 세계)
 *   clip     (걸음 2) { near, behind, cut, dropped, added, cutEdges,
 *              boxes: { id, edges: { a, b, status: 'kept'|'cut'|'dropped', from: V3, to: V3 }[] }[] }
 *              from / to 는 자른 뒤의 두 끝(세계). 버린 모서리는 자르기 전 두 끝
 *   project  (걸음 3) { projection, boxes: { id, width, bounds: { xMin, xMax, yMin, yMax },
 *              segments: [x1, y1, x2, y2][] (화면 NDC) }[] }
 *   compare  (걸음 4) { ratio: number, pct: number, frontWidth: number, backWidth: number }
 *   phase    (silent) { phase: 'view' | 'clip' | 'project' | 'compare' } — 그 걸음의 발신 바로 앞
 *
 * phase 어휘: view · clip · project · compare (irs.ts 와 같다)
 *
 * 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다, 판 머리에서 0 으로):
 *   cut-edges        그 판에서 가까운 면이 자른 모서리 수 (걸음 2)
 *   width-ratio-pct  floor(앞/뒤 × 100 + 0.5) (걸음 4)
 *
 * 입력: distance { value: 사다리의 수 } · projection { value: 0 원근 · 1 직교 }.
 * 재생 = 판 머리 뒤 sleep(stepMs + motionMs) + 걸음 1..3 뒤 sleep(stepMs + motionMs) — 마지막 걸음 뒤는 입력 대기.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type V3 = [number, number, number];

export type ProjectionData = {
  type: 'projection';
  stepMs: number;
  motionMs: number;
  boxes: { id: string; center: number[]; size: number }[];
  cornerSigns: number[][];
  edges: number[][];
  target: number[];
  up: number[];
  fovDeg: number;
  near: number;
  orthoHalf: number;
  distances: number[];
  projections: string[];
  startDistance: number;
  startProjection: string;
};

export type ProjectionMode = 'perspective' | 'orthographic';

// ─── 좁히개 ──────────────────────────────────────────────────────────────────

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`projection: ${what} 가 수가 아니다`);
  return v;
}

function numList(v: unknown, len: number | null, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`projection: ${what} 가 배열이 아니다`);
  if (len !== null && v.length !== len) throw new Error(`projection: ${what} 의 길이가 ${len} 이 아니다`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
}

function mode(v: unknown): ProjectionMode {
  if (v === 'perspective' || v === 'orthographic') return v;
  throw new Error(`projection: 모르는 투영 ${String(v)}`);
}

export function readProjectionData(raw: unknown): ProjectionData {
  if (typeof raw !== 'object' || raw === null) throw new Error('projection: 자료가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'projection') throw new Error(`projection: type 이 projection 이 아니다 (${String(r.type)})`);
  if (!Array.isArray(r.boxes) || r.boxes.length !== 2) throw new Error('projection: 상자는 둘이다');
  const boxes = r.boxes.map((b, i) => {
    if (typeof b !== 'object' || b === null) throw new Error(`projection: boxes[${i}] 가 없다`);
    const o = b as Record<string, unknown>;
    if (typeof o.id !== 'string') throw new Error(`projection: boxes[${i}].id 가 없다`);
    return { id: o.id, center: numList(o.center, 3, `boxes[${i}].center`), size: num(o.size, `boxes[${i}].size`) };
  });
  if (boxes[0]?.id !== 'front' || boxes[1]?.id !== 'back') throw new Error('projection: 상자 차례는 front · back 이다');
  if (!Array.isArray(r.cornerSigns) || r.cornerSigns.length !== 8) throw new Error('projection: 꼭짓점 부호는 여덟이다');
  const cornerSigns = r.cornerSigns.map((s, i) => numList(s, 3, `cornerSigns[${i}]`));
  if (!Array.isArray(r.edges) || r.edges.length === 0) throw new Error('projection: 모서리가 없다');
  const edges = r.edges.map((e, i) => {
    const pair = numList(e, 2, `edges[${i}]`);
    for (const k of pair) {
      if (!Number.isInteger(k) || k < 0 || k > 7) throw new Error(`projection: edges[${i}] 의 꼭짓점 번호 ${k} 가 0..7 밖이다`);
    }
    return pair;
  });
  const distances = numList(r.distances, null, 'distances');
  if (distances.length === 0) throw new Error('projection: 거리 사다리가 비었다');
  if (!Array.isArray(r.projections)) throw new Error('projection: 투영 사다리가 없다');
  const projections = r.projections.map((p) => mode(p));
  const startDistance = num(r.startDistance, 'startDistance');
  if (!distances.includes(startDistance)) throw new Error(`projection: 처음 거리 ${startDistance} 가 사다리에 없다`);
  const startProjection = mode(r.startProjection);
  if (!projections.includes(startProjection)) throw new Error(`projection: 처음 투영 ${startProjection} 가 사다리에 없다`);
  const near = num(r.near, 'near');
  if (near <= 0) throw new Error('projection: near 는 양수다');
  const orthoHalf = num(r.orthoHalf, 'orthoHalf');
  if (orthoHalf <= 0) throw new Error('projection: orthoHalf 는 양수다');
  const fovDeg = num(r.fovDeg, 'fovDeg');
  if (fovDeg <= 0 || fovDeg >= 180) throw new Error('projection: fovDeg 는 0 과 180 사이다');
  return {
    type: 'projection',
    stepMs: num(r.stepMs, 'stepMs'),
    motionMs: num(r.motionMs, 'motionMs'),
    boxes,
    cornerSigns,
    edges,
    target: numList(r.target, 3, 'target'),
    up: numList(r.up, 3, 'up'),
    fovDeg,
    near,
    orthoHalf,
    distances,
    projections,
    startDistance,
    startProjection,
  };
}

// ─── 셈 ──────────────────────────────────────────────────────────────────────

/** 초점 f = 1 / tan(fovDeg / 2) */
export function focalOf(fovDeg: number): number {
  return 1 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

/** 상자 하나의 꼭짓점 여덟 (세계) — 중심 + 부호 × 한 변의 절반 */
export function boxCorners(data: ProjectionData, boxIndex: number): V3[] {
  const box = data.boxes[boxIndex];
  if (!box) throw new Error(`projection: 상자 ${boxIndex} 가 없다`);
  const h = box.size / 2;
  return data.cornerSigns.map((s) => [
    (box.center[0] as number) + h * (s[0] as number),
    (box.center[1] as number) + h * (s[1] as number),
    (box.center[2] as number) + h * (s[2] as number),
  ]);
}

/** look-at 세 축 — IR lookAt 과 같은 산술. 길이 0 이면 던진다 */
export function lookAt(eye: V3, target: number[], up: number[]): { right: V3; up: V3; forward: V3 } {
  let fx = (target[0] as number) - eye[0];
  let fy = (target[1] as number) - eye[1];
  let fz = (target[2] as number) - eye[2];
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (fl === 0) throw new Error('projection: 눈과 바라보는 점이 같다 (시선 길이 0)');
  fx = fx / fl;
  fy = fy / fl;
  fz = fz / fl;
  const ux = up[0] as number;
  const uy = up[1] as number;
  const uz = up[2] as number;
  let rx = fy * uz - fz * uy;
  let ry = fz * ux - fx * uz;
  let rz = fx * uy - fy * ux;
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rl === 0) throw new Error('projection: 시선과 위쪽이 나란하다 (외적 길이 0)');
  rx = rx / rl;
  ry = ry / rl;
  rz = rz / rl;
  return {
    right: [rx, ry, rz],
    up: [ry * fz - rz * fy, rz * fx - rx * fz, rx * fy - ry * fx],
    forward: [fx, fy, fz],
  };
}

type Axes = { right: V3; up: V3; forward: V3 };

function toCamera(axes: Axes, eye: V3, p: V3): V3 {
  const dx = p[0] - eye[0];
  const dy = p[1] - eye[1];
  const dz = p[2] - eye[2];
  return [
    axes.right[0] * dx + axes.right[1] * dy + axes.right[2] * dz,
    axes.up[0] * dx + axes.up[1] * dy + axes.up[2] * dz,
    -(axes.forward[0] * dx + axes.forward[1] * dy + axes.forward[2] * dz),
  ];
}

function toWorld(axes: Axes, eye: V3, c: V3): V3 {
  // p − eye = x·r + y·u − z·f  (카메라 z = −f·(p − eye))
  return [
    eye[0] + c[0] * axes.right[0] + c[1] * axes.up[0] - c[2] * axes.forward[0],
    eye[1] + c[0] * axes.right[1] + c[1] * axes.up[1] - c[2] * axes.forward[1],
    eye[2] + c[0] * axes.right[2] + c[1] * axes.up[2] - c[2] * axes.forward[2],
  ];
}

export type EdgeStatus = 'kept' | 'cut' | 'dropped';

export type BoxResult = {
  id: string;
  corners: V3[];
  depthMin: number;
  depthMax: number;
  behind: number;
  kept: number;
  cut: number;
  dropped: number;
  edges: { a: number; b: number; status: EdgeStatus; camFrom: V3; camTo: V3; from: V3; to: V3 }[];
  segments: [number, number, number, number][];
  width: number;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
};

export type RoundResult = {
  distance: number;
  projection: ProjectionMode;
  eye: V3;
  axes: Axes;
  focal: number;
  boxes: BoxResult[];
  ratio: number;
  pct: number;
};

/** 눈의 거리 d · 투영 하나로 한 판을 셈한다 — IR widthRatio 와 같은 길 */
export function computeRound(data: ProjectionData, distance: number, projection: ProjectionMode): RoundResult {
  const eye: V3 = [0, 0, distance];
  const axes = lookAt(eye, data.target, data.up);
  const focal = focalOf(data.fovDeg);
  const near = data.near;
  const boxes: BoxResult[] = data.boxes.map((box, bi) => {
    const corners = boxCorners(data, bi);
    const cam = corners.map((p) => toCamera(axes, eye, p));
    const depths = cam.map((c) => -c[2]);
    for (const d of depths) {
      if (d === near) throw new Error(`projection: ${box.id} 의 꼭짓점이 가까운 면 위에 있다 (깊이 ${d})`);
    }
    const edges: BoxResult['edges'] = [];
    const segments: BoxResult['segments'] = [];
    let has = false;
    let lo = 0;
    let hi = 0;
    let yLo = 0;
    let yHi = 0;
    let kept = 0;
    let cut = 0;
    let dropped = 0;
    for (const [ia, ib] of data.edges as [number, number][]) {
      const ca = cam[ia];
      const cb = cam[ib];
      if (!ca || !cb) throw new Error(`projection: 모서리 (${ia}, ${ib}) 의 꼭짓점이 없다`);
      const seg = [ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]];
      const da = -(seg[2] as number);
      const db = -(seg[5] as number);
      if (da < near && db < near) {
        dropped += 1;
        edges.push({ a: ia, b: ib, status: 'dropped', camFrom: ca, camTo: cb, from: corners[ia] as V3, to: corners[ib] as V3 });
        continue;
      }
      let status: EdgeStatus = 'kept';
      if (da < near) {
        const along = (db - near) / (db - da);
        for (let k = 0; k < 3; k += 1) seg[k] = (seg[k + 3] as number) + along * ((seg[k] as number) - (seg[k + 3] as number));
        status = 'cut';
      } else if (db < near) {
        const along = (da - near) / (da - db);
        for (let k = 0; k < 3; k += 1) seg[k + 3] = (seg[k] as number) + along * ((seg[k + 3] as number) - (seg[k] as number));
        status = 'cut';
      }
      if (status === 'cut') cut += 1;
      else kept += 1;
      const camFrom: V3 = [seg[0] as number, seg[1] as number, seg[2] as number];
      const camTo: V3 = [seg[3] as number, seg[4] as number, seg[5] as number];
      const screen: number[] = [];
      for (const c of [camFrom, camTo]) {
        let sx: number;
        let sy: number;
        if (projection === 'perspective') {
          sx = (focal * c[0]) / -c[2];
          sy = (focal * c[1]) / -c[2];
        } else {
          sx = c[0] / data.orthoHalf;
          sy = c[1] / data.orthoHalf;
        }
        if (!has) {
          lo = sx;
          hi = sx;
          yLo = sy;
          yHi = sy;
          has = true;
        } else {
          if (sx < lo) lo = sx;
          if (sx > hi) hi = sx;
          if (sy < yLo) yLo = sy;
          if (sy > yHi) yHi = sy;
        }
        screen.push(sx, sy);
      }
      segments.push([screen[0] as number, screen[1] as number, screen[2] as number, screen[3] as number]);
      edges.push({ a: ia, b: ib, status, camFrom, camTo, from: toWorld(axes, eye, camFrom), to: toWorld(axes, eye, camTo) });
    }
    if (!has) throw new Error(`projection: ${box.id} 의 모서리가 모두 가까운 면 뒤다 (폭을 셈할 수 없다)`);
    return {
      id: box.id,
      corners,
      depthMin: Math.min(...depths),
      depthMax: Math.max(...depths),
      behind: depths.filter((d) => d < near).length,
      kept,
      cut,
      dropped,
      edges,
      segments,
      width: hi - lo,
      bounds: { xMin: lo, xMax: hi, yMin: yLo, yMax: yHi },
    };
  });
  const front = boxes[0] as BoxResult;
  const back = boxes[1] as BoxResult;
  if (back.width <= 0) throw new Error('projection: 뒤 상자의 폭이 0 이다 (비를 셈할 수 없다)');
  const ratio = front.width / back.width;
  return { distance, projection, eye, axes, focal, boxes, ratio, pct: Math.floor(ratio * 100 + 0.5) };
}

/** IR widthRatio / boxWidth 에 넘길 인자 — 코드 패널의 셈과 화면의 셈을 잇는다 */
export function projectionIRArgs(
  data: ProjectionData,
  distance: number,
  projection: ProjectionMode,
): {
  vx: number[]; vy: number[]; vz: number[]; ea: number[]; eb: number[];
  eye: number[]; target: number[]; up: number[];
  focal: number; near: number; half: number; persp: number; axes: number[]; seg: number[];
} {
  const all = [...boxCorners(data, 0), ...boxCorners(data, 1)];
  return {
    vx: all.map((p) => p[0]),
    vy: all.map((p) => p[1]),
    vz: all.map((p) => p[2]),
    ea: data.edges.map((e) => e[0] as number),
    eb: data.edges.map((e) => e[1] as number),
    eye: [0, 0, distance],
    target: [...data.target],
    up: [...data.up],
    focal: focalOf(data.fovDeg),
    near: data.near,
    half: data.orthoHalf,
    persp: projection === 'perspective' ? 1 : 0,
    axes: new Array<number>(9).fill(0),
    seg: new Array<number>(6).fill(0),
  };
}

// ─── 알고리즘 ────────────────────────────────────────────────────────────────

export async function projectionAlgorithm(ctx: FacetContext<ProjectionData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ProjectionData>;
  const data = readProjectionData(ctx.data);
  const pause = (): Promise<boolean> => rctx.sleep(data.stepMs + data.motionMs);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 값을 들고 차이만 보낸다
  const shown = { cutEdges: 0, ratioPct: 0 };
  const setCutEdges = (v: number) => {
    ctx.metric('cut-edges', v - shown.cutEdges);
    shown.cutEdges = v;
  };
  const setRatioPct = (v: number) => {
    ctx.metric('width-ratio-pct', v - shown.ratioPct);
    shown.ratioPct = v;
  };

  // 판마다 같은 틀 — 위에서 본 그림의 z 범위 · 비 눈금 (사다리 전체를 셈해 처음부터 잡는다)
  const zs = data.boxes.flatMap((_, bi) => boxCorners(data, bi).map((p) => p[2]));
  const topRange = { zMin: Math.min(...zs) - 0.5, zMax: Math.max(...data.distances) + 1 };
  let ratioLo = Infinity;
  let ratioHi = -Infinity;
  for (const d of data.distances) {
    for (const p of data.projections as ProjectionMode[]) {
      const r = computeRound(data, d, p).ratio;
      if (r < ratioLo) ratioLo = r;
      if (r > ratioHi) ratioHi = r;
    }
  }
  const ratioScale = { min: Math.floor(ratioLo), max: Math.ceil(ratioHi) };
  const halfTan = Math.tan(((data.fovDeg / 2) * Math.PI) / 180);

  let distance = data.startDistance;
  let projection = mode(data.startProjection);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const res = computeRound(data, distance, projection);

      // 0 판 머리
      setCutEdges(0);
      setRatioPct(0);
      await ctx.emit({
        type: 'round',
        silent: true,
        payload: {
          distance,
          projection,
          eye: res.eye,
          axes: res.axes,
          near: data.near,
          orthoHalf: data.orthoHalf,
          halfTan,
          motionMs: data.motionMs,
          boxes: res.boxes.map((b) => ({ id: b.id, corners: b.corners, edges: data.edges.map((e) => [e[0], e[1]]) })),
          topRange,
          ratioScale,
        },
      });
      if (!(await pause())) return;

      // 1 카메라 좌표
      await phase('view');
      await ctx.emit({
        type: 'camera',
        payload: {
          boxes: res.boxes.map((b) => ({
            id: b.id,
            depthMin: b.depthMin,
            depthMax: b.depthMax,
            nearAt: toWorld(res.axes, res.eye, [0, 0, -b.depthMin]),
            farAt: toWorld(res.axes, res.eye, [0, 0, -b.depthMax]),
          })),
        },
      });
      if (!(await pause())) return;

      // 2 가까운 면 자르기
      const behind = res.boxes.reduce((s, b) => s + b.behind, 0);
      const cut = res.boxes.reduce((s, b) => s + b.cut, 0);
      const dropped = res.boxes.reduce((s, b) => s + b.dropped, 0);
      await phase('clip');
      await ctx.emit({
        type: 'clip',
        payload: {
          near: data.near,
          behind,
          cut,
          dropped,
          added: cut,
          cutEdges: cut,
          boxes: res.boxes.map((b) => ({
            id: b.id,
            edges: b.edges.map((e) => ({ a: e.a, b: e.b, status: e.status, from: e.from, to: e.to })),
          })),
        },
      });
      setCutEdges(cut);
      if (!(await pause())) return;

      // 3 투영
      await phase('project');
      await ctx.emit({
        type: 'project',
        payload: {
          projection,
          boxes: res.boxes.map((b) => ({ id: b.id, width: b.width, bounds: b.bounds, segments: b.segments })),
        },
      });
      if (!(await pause())) return;

      // 4 앞/뒤 비
      const front = res.boxes[0] as BoxResult;
      const back = res.boxes[1] as BoxResult;
      await phase('compare');
      await ctx.emit({
        type: 'compare',
        payload: { ratio: res.ratio, pct: res.pct, frontWidth: front.width, backWidth: back.width },
      });
      setRatioPct(res.pct);

      // 입력 대기 — 우리 것이 아닌 type 만 흘린다, 제 type 인데 값이 어긋나면 던진다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).value : undefined;
        if (input.type === 'distance') {
          if (typeof value !== 'number' || !data.distances.includes(value)) {
            throw new Error(`projection: 눈의 거리 ${String(value)} 가 사다리에 없다`);
          }
          distance = value;
          break;
        }
        if (input.type === 'projection') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.projections.length) {
            throw new Error(`projection: 투영 번호 ${String(value)} 가 사다리에 없다`);
          }
          projection = mode(data.projections[value]);
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
