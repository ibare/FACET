/**
 * 2D 행렬 변환 (graphics 2D matrix transform) facet 알고리즘 — ReactiveMechanism + 자동 시연.
 *
 * 시그니처 행동: 행렬의 한 셀을 잡고 흔들면 정확히 한 기저 벡터의 한 좌표만 변하고,
 * 격자 전체와 그 위의 한 점이 같은 운동 법칙으로 즉시 따라 휜다. 6단 동시 운동
 * (셀 → 화살표 → 격자 → 평행사변형 → |det| 게이지 → 보조 점) 이 한 입력에
 * 1:1 대응된다.
 *
 * 진행 모델: 입력 반응형. mount 직후 1.5초 자동 시연 (a 1→1.5, c 0→0.3, b 0→-0.5)
 * 이후 idle 로 진입해 사용자 입력 대기. 모든 입력은 ctx.waitForInput 으로 받는다.
 *
 * 입력 어휘 (모두 facet 로컬, 'reset' 만 mechanism 표준):
 *   - cell           payload: { name: 'a'|'b'|'c'|'d', value }      행렬 셀 한 칸 직접 갱신
 *   - drag-tip       payload: { which: 'i'|'j', x, y }              화살표 끝 드래그 (두 셀 동시)
 *   - preset         payload: { mode, segmentIndex }                4종 + 자유 토글
 *   - preset-param   payload: { kind, value }                       활성 프리셋의 보조 슬라이더
 *   - point-add      payload: { u, v }                              보조 점 추가 (최대 3)
 *   - point-remove   payload: { id }                                보조 점 제거
 *   - point-drag     payload: { id, u, v }                          보조 점 드래그 (변환 격자 위 좌표)
 *   - identity       payload?: unknown                              항등으로 리셋 (점 보존)
 *
 * 식별자 (C1):
 *   - `cell:a` `cell:b` `cell:c` `cell:d`     — 행렬 4 셀.
 *   - `arrow:i` `arrow:j`                       — 두 기저 화살표.
 *   - `grid:identity` `grid:transformed`        — 두 겹 격자.
 *   - `parallelogram:unit`                      — 단위 평행사변형.
 *   - `gauge:det`                               — |det| 게이지.
 *   - `point:p<id>`                             — 보조 점 (id 0,1,2).
 *   - `preset:free|rotate|scale|shear|reflect`  — 프리셋 모드 토글.
 *
 * 이벤트 어휘 (모두 facet 로컬):
 *   - init                  { matrix, det, preset, presetParams, points, axes }
 *   - matrix-changed        { matrix, det, dim: 'a'|'b'|'c'|'d'|'all', cause }
 *   - preset-changed        { mode, params }
 *   - preset-param-changed  { kind, value }
 *   - point-added           { id, u, v }
 *   - point-removed         { id }
 *   - point-moved           { id, u, v }
 *   - det-zero              { matrix }
 *   - det-flipped           { sign: 'pos'|'neg', det }
 *   - mode                  { mode: 'auto' | 'idle' }, silent
 *   - phase                 { phase: 'demo' | 'idle' }, silent
 *
 * phase 어휘: 'demo' (자동 시연) | 'idle' (사용자 입력 대기).
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type Matrix2x2 = { a: number; b: number; c: number; d: number };

export type PresetMode = 'free' | 'rotate' | 'scale' | 'shear' | 'reflect';
export type ReflectAxis = 'x' | 'y' | 'origin';

export type PresetParams = {
  /** 회전각 (rad). */
  theta: number;
  /** 가로 스케일. */
  s: number;
  /** 세로 스케일. */
  t: number;
  /** 전단 계수 (가로 전단). */
  k: number;
  /** 반사 축. */
  axis: ReflectAxis;
};

export type HelperPoint = {
  id: number;
  u: number;
  v: number;
};

export type MatrixTransformData = {
  type: '2d-matrix-transform';
  /** 시연 운동 길이 (1× 기준 ms). */
  demoStepMs: number;
  /** 시연 한 운동의 프레임 수. */
  demoFrames: number;
  /** 보조 점 최대 개수. */
  maxPoints: number;
  /** 초기 행렬. */
  initialMatrix: Matrix2x2;
  /** 초기 보조 점 (u, v). */
  initialPoints: Array<{ u: number; v: number }>;
  /** 좌표 범위 (-axisMax ~ +axisMax). */
  axisMax: number;
};

export type PresetSegment = {
  value: number;
  mode: PresetMode;
};

export type MatrixInputEvent =
  | { type: 'cell'; payload?: { name?: 'a' | 'b' | 'c' | 'd'; value?: number } }
  | { type: 'drag-tip'; payload?: { which?: 'i' | 'j'; x?: number; y?: number } }
  | { type: 'preset'; payload?: { mode?: PresetMode; segmentIndex?: number } }
  | {
      type: 'preset-param';
      payload?: { kind?: 'theta' | 's' | 't' | 'k' | 'axis'; value?: number | ReflectAxis };
    }
  | { type: 'point-add'; payload?: { u?: number; v?: number } }
  | { type: 'point-remove'; payload?: { id?: number } }
  | { type: 'point-drag'; payload?: { id?: number; u?: number; v?: number } }
  | { type: 'identity'; payload?: unknown };

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function det(m: Matrix2x2): number {
  return m.a * m.d - m.b * m.c;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sign(v: number): 'pos' | 'neg' | 'zero' {
  if (Math.abs(v) < 1e-9) return 'zero';
  return v > 0 ? 'pos' : 'neg';
}

function rotateMatrix(theta: number): Matrix2x2 {
  const co = Math.cos(theta);
  const si = Math.sin(theta);
  return { a: co, b: -si, c: si, d: co };
}

function scaleMatrix(s: number, t: number): Matrix2x2 {
  return { a: s, b: 0, c: 0, d: t };
}

function shearMatrix(k: number): Matrix2x2 {
  return { a: 1, b: k, c: 0, d: 1 };
}

function reflectMatrix(axis: ReflectAxis): Matrix2x2 {
  if (axis === 'x') return { a: 1, b: 0, c: 0, d: -1 };
  if (axis === 'y') return { a: -1, b: 0, c: 0, d: 1 };
  return { a: -1, b: 0, c: 0, d: -1 };
}

/** 두 셀 동시 갱신 — drag-tip 의 i / j 끝점에서 두 좌표를 한꺼번에 받는다. */
function applyTipDrag(m: Matrix2x2, which: 'i' | 'j', x: number, y: number): Matrix2x2 {
  if (which === 'i') return { ...m, a: x, c: y };
  return { ...m, b: x, d: y };
}

// ── 알고리즘 본체 ─────────────────────────────────────────────────────────

export async function matrixTransform(
  ctxBase: FacetContext<MatrixTransformData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<MatrixTransformData>;
  const data = ctx.data;
  const { demoStepMs, demoFrames, maxPoints, initialMatrix, initialPoints, axisMax } = data;

  let matrix: Matrix2x2 = { ...initialMatrix };
  let preset: PresetMode = 'free';
  const presetParams: PresetParams = {
    theta: 0,
    s: 1,
    t: 1,
    k: 0,
    axis: 'x',
  };
  let nextPointId = 0;
  const points: HelperPoint[] = initialPoints.map((p) => ({
    id: nextPointId++,
    u: p.u,
    v: p.v,
  }));
  let lastDetSign: 'pos' | 'neg' | 'zero' = sign(det(matrix));

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      matrix: { ...matrix },
      det: det(matrix),
      preset,
      presetParams: { ...presetParams },
      points: points.map((p) => ({ ...p })),
      axisMax,
      maxPoints,
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'demo' }, silent: true });

  /** 행렬 갱신 → matrix-changed + det 사건 발화. */
  async function applyMatrix(
    next: Matrix2x2,
    dim: 'a' | 'b' | 'c' | 'd' | 'all',
    cause: 'cell' | 'tip' | 'preset' | 'demo' | 'identity',
  ): Promise<void> {
    matrix = next;
    const d = det(matrix);
    await ctx.emit({
      type: 'matrix-changed',
      payload: { matrix: { ...matrix }, det: d, dim, cause },
    });
    const s = sign(d);
    if (s === 'zero' && lastDetSign !== 'zero') {
      await ctx.emit({ type: 'det-zero', payload: { matrix: { ...matrix } } });
    } else if (s !== 'zero' && s !== lastDetSign) {
      await ctx.emit({ type: 'det-flipped', payload: { sign: s, det: d } });
    }
    lastDetSign = s;
  }

  /**
   * 자동 시연 — 한 셀을 from → to 로 demoFrames 단계에 걸쳐 미끄러뜨린다.
   * 매 프레임 사이 pollInput 검사로 사용자 입력 발생 시 즉시 빠져나온다.
   */
  async function demoSlide(
    name: 'a' | 'b' | 'c' | 'd',
    from: number,
    to: number,
  ): Promise<MatrixInputEvent | null> {
    const stepMs = demoStepMs / demoFrames;
    for (let i = 1; i <= demoFrames; i++) {
      if (ctx.cancelled) return null;
      const t = i / demoFrames;
      const v = from + (to - from) * t;
      const next = { ...matrix, [name]: v };
      await applyMatrix(next, name, 'demo');
      const ok = await ctx.sleep(stepMs);
      if (!ok || ctx.cancelled) return null;
      const pending = ctx.pollInput<MatrixInputEvent>();
      if (pending) return pending;
    }
    return null;
  }

  async function autoRun(): Promise<MatrixInputEvent | null> {
    await ctx.emit({ type: 'mode', payload: { mode: 'auto' }, silent: true });
    const seq: Array<['a' | 'b' | 'c' | 'd', number, number]> = [
      ['a', 1, 1.5],
      ['c', 0, 0.3],
      ['b', 0, -0.5],
    ];
    for (const [name, from, to] of seq) {
      const interrupt = await demoSlide(name, from, to);
      if (interrupt) {
        await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
        return interrupt;
      }
    }
    await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
    await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
    return null;
  }

  /** 프리셋 모드의 현재 보조 슬라이더 값으로 행렬을 만든다. */
  function buildPresetMatrix(): Matrix2x2 {
    if (preset === 'rotate') return rotateMatrix(presetParams.theta);
    if (preset === 'scale') return scaleMatrix(presetParams.s, presetParams.t);
    if (preset === 'shear') return shearMatrix(presetParams.k);
    if (preset === 'reflect') return reflectMatrix(presetParams.axis);
    return matrix;
  }

  // mount 직후 자동 시연 한 호흡.
  let interrupted = await autoRun();

  // 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;

    let ev: MatrixInputEvent;
    if (interrupted) {
      ev = interrupted;
      interrupted = null;
    } else {
      try {
        ev = await ctx.waitForInput<MatrixInputEvent>();
      } catch {
        return;
      }
    }

    if (ev.type === 'cell') {
      const name = ev.payload?.name;
      const value = ev.payload?.value;
      if (!name || typeof value !== 'number') continue;
      const next = { ...matrix, [name]: clamp(value, -axisMax, axisMax) };
      await applyMatrix(next, name, 'cell');
      // 자유 모드로 자동 복귀 (셀 직접 입력은 프리셋 외부 운동).
      if (preset !== 'free') {
        preset = 'free';
        await ctx.emit({
          type: 'preset-changed',
          payload: { mode: preset, params: { ...presetParams } },
        });
      }
      continue;
    }

    if (ev.type === 'drag-tip') {
      const which = ev.payload?.which;
      const x = ev.payload?.x;
      const y = ev.payload?.y;
      if (!which || typeof x !== 'number' || typeof y !== 'number') continue;
      const next = applyTipDrag(matrix, which, clamp(x, -axisMax, axisMax), clamp(y, -axisMax, axisMax));
      await applyMatrix(next, 'all', 'tip');
      if (preset !== 'free') {
        preset = 'free';
        await ctx.emit({
          type: 'preset-changed',
          payload: { mode: preset, params: { ...presetParams } },
        });
      }
      continue;
    }

    if (ev.type === 'preset') {
      const mode = ev.payload?.mode;
      if (
        mode !== 'free' &&
        mode !== 'rotate' &&
        mode !== 'scale' &&
        mode !== 'shear' &&
        mode !== 'reflect'
      ) {
        continue;
      }
      preset = mode;
      // 프리셋 진입 시 보조 슬라이더 기본값으로 행렬 구성 (자유는 현재 행렬 유지).
      if (preset !== 'free') {
        const pm = buildPresetMatrix();
        await ctx.emit({
          type: 'preset-changed',
          payload: { mode: preset, params: { ...presetParams } },
        });
        await applyMatrix(pm, 'all', 'preset');
      } else {
        await ctx.emit({
          type: 'preset-changed',
          payload: { mode: preset, params: { ...presetParams } },
        });
      }
      continue;
    }

    if (ev.type === 'preset-param') {
      const kind = ev.payload?.kind;
      const valueRaw = ev.payload?.value;
      if (kind === 'theta' && typeof valueRaw === 'number') {
        presetParams.theta = clamp(valueRaw, -Math.PI, Math.PI);
      } else if (kind === 's' && typeof valueRaw === 'number') {
        presetParams.s = clamp(valueRaw, -2, 2);
      } else if (kind === 't' && typeof valueRaw === 'number') {
        presetParams.t = clamp(valueRaw, -2, 2);
      } else if (kind === 'k' && typeof valueRaw === 'number') {
        presetParams.k = clamp(valueRaw, -2, 2);
      } else if (kind === 'axis' && (valueRaw === 'x' || valueRaw === 'y' || valueRaw === 'origin')) {
        presetParams.axis = valueRaw;
      } else {
        continue;
      }
      await ctx.emit({
        type: 'preset-param-changed',
        payload: { kind, value: valueRaw },
      });
      // 활성 프리셋 모드의 행렬 자동 재계산.
      if (preset !== 'free') {
        const pm = buildPresetMatrix();
        await applyMatrix(pm, 'all', 'preset');
      }
      continue;
    }

    if (ev.type === 'point-add') {
      if (points.length >= maxPoints) continue;
      const u = typeof ev.payload?.u === 'number' ? ev.payload.u : 0;
      const v = typeof ev.payload?.v === 'number' ? ev.payload.v : 0;
      const id = nextPointId++;
      points.push({ id, u, v });
      await ctx.emit({ type: 'point-added', payload: { id, u, v } });
      continue;
    }

    if (ev.type === 'point-remove') {
      const id = ev.payload?.id;
      let removedId: number | null = null;
      if (typeof id === 'number') {
        const idx = points.findIndex((p) => p.id === id);
        if (idx >= 0) {
          points.splice(idx, 1);
          removedId = id;
        }
      } else if (points.length > 0) {
        // id 미지정 — 가장 마지막 점 제거 (control-bar [점 제거] 의 자연 의미).
        const last = points.pop()!;
        removedId = last.id;
      }
      if (removedId !== null) {
        await ctx.emit({ type: 'point-removed', payload: { id: removedId } });
      }
      continue;
    }

    if (ev.type === 'point-drag') {
      const id = ev.payload?.id;
      const u = ev.payload?.u;
      const v = ev.payload?.v;
      if (typeof id !== 'number' || typeof u !== 'number' || typeof v !== 'number') continue;
      const p = points.find((q) => q.id === id);
      if (!p) continue;
      p.u = clamp(u, -axisMax, axisMax);
      p.v = clamp(v, -axisMax, axisMax);
      await ctx.emit({ type: 'point-moved', payload: { id, u: p.u, v: p.v } });
      continue;
    }

    if (ev.type === 'identity') {
      preset = 'free';
      const next: Matrix2x2 = { a: 1, b: 0, c: 0, d: 1 };
      await ctx.emit({
        type: 'preset-changed',
        payload: { mode: preset, params: { ...presetParams } },
      });
      await applyMatrix(next, 'all', 'identity');
      continue;
    }
  }
}
