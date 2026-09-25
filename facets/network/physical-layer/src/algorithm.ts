/**
 * physical-layer — 부호와 틀 (Line codes and framing).
 *
 * 받는 쪽은 선에서 두 가지 경계를 찾는다 — 비트의 경계(전압이 뒤집히는 자리)와 틀의 경계(표식 바이트).
 * 같은 다섯 바이트를 PPP 식 바이트 채워 넣기로 틀에 담고(`stuff`), 부호(NRZ · NRZI · 맨체스터)로 전압 선에
 * 실은 뒤(`encode`), 받는 쪽이 선 위 바이트를 하나씩 읽어 다섯 바이트를 되찾는다(`receive`).
 *
 * 손잡이 둘 (reactive):
 *   - `scheme`  0 NRZ · 1 NRZI · 2 맨체스터 (`initialData.schemes` 의 색인)
 *   - `payload` 0 `48…42` · 1 `00…00` · 2 `FF…FF` · 3 `7E…7E` (`initialData.payloads` 의 색인)
 * 한 판을 끝까지 재생 → `waitForInput` → 받은 값으로 다시 재생한다.
 *
 * 규약 (줄인 자리 — 설명 글이 밝힌다):
 *   - 틀은 PPP 식 바이트 채워 넣기. 앞뒤 표식 `7E` 하나씩, 데이터 속 `7E` · `7D` 는 `7D` + (그 바이트 XOR `20`).
 *     XOR `20` 은 산술로 — 32 의 자리가 1 이면 -32, 아니면 +32. 주소 · 제어 · 프로토콜 칸과 FCS 는 없다
 *   - 비트는 높은 자리 먼저. 비트 하나 = 반 칸 둘. NRZ · NRZI 도 반 칸 둘을 같은 값으로 채워 시간 축을 맞춘다
 *   - NRZ 1 = 높음 · 0 = 낮음. NRZI 는 1 이면 비트 머리에서 뒤집힘, 선은 낮음에서 시작.
 *     맨체스터(IEEE 802.3) 1 = 낮음→높음 · 0 = 높음→낮음
 *   - 뒤집힘 = 이웃한 반 칸이 다른 자리의 수 (첫 반 칸 앞은 세지 않는다)
 *   - 가장 긴 평평 = 같은 값이 이어진 반 칸의 가장 긴 수 ÷ 2 (비트). 반 칸 수가 홀수면 던진다.
 *     놓인 자리는 첫 반 칸 색인 — 동률이면 앞의 것 (이 데이터에서 동률이 걸리는 자리는 테스트가 센다)
 *   - 신호 칸 = 비트 수 × (맨체스터 2 · 나머지 1)
 *   - 받는 쪽 상태 셋 — 0 열리기 전 · 1 열림 · 2 탈출 뒤. 열리기 전에 표식이 아닌 바이트 · 닫히지 않은 틀 ·
 *     되찾은 바이트가 보낸 것과 다름 → 던진다
 *
 * 이벤트 (silent 가 아닌 것은 모두 걸음 경계 앞에 하나씩):
 *   - `phase`  { phase: string }                                       silent
 *   - `frame`  걸음 0. { scheme: number, payload: number, data: number[], wire: number[],
 *              kinds: ('flag'|'escape'|'stuffed'|'data')[], dataAt: number[], dataSpan: number[],
 *              stuffed: number }
 *              dataAt[j] 는 데이터 j 번째 바이트가 놓인 선 위 색인, dataSpan[j] 는 차지한 선 위 바이트 수(1 · 2)
 *   - `line`   걸음 1. { scheme: number, half: number[] (1 = 높음 · 0 = 낮음), cellsPerBit: number,
 *              signalCells: number, transitions: number, flatStart: number, flatHalf: number, flatBits: number }
 *   - `read`   걸음 2…. { index: number, byte: number, branch: 'open-frame'|'keep-byte'|'escape'|'restore-byte'|'close-frame',
 *              state?: number (읽은 뒤 상태 0 · 1 · 2 — close-frame 에는 없다. 닫힌 틀에서는 어느 상태도 켜지 않는다), got: number (담은 바이트, 담지 않았으면 -1),
 *              recovered: number[], sent: number[] }
 *
 * phase 어휘 (irs.ts 와 같다 — 일곱):
 *   `stuff` (걸음 0) · `longest-flat` (걸음 1) · `open-frame` · `keep-byte` · `escape` · `restore-byte` · `close-frame` (걸음 2…)
 *
 * 계기 (판마다 차이만 보낸다 — 걸음 0 에 다섯 모두 0 으로 되돌린 뒤):
 *   - `wire-bytes`      선 위 바이트 (걸음 0)
 *   - `signal-cells`    신호 칸 (걸음 1)
 *   - `transitions`     뒤집힘 (걸음 1)
 *   - `longest-flat`    가장 긴 평평, 비트 (걸음 1)
 *   - `recovered-bytes` 되찾은 바이트 (keep-byte · restore-byte 걸음마다 +1)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PhysicalLayerData = {
  type: 'physical-layer';
  stepMs: number;
  flag: number;
  escape: number;
  schemes: string[];
  payloads: number[][];
  initialScheme: number;
  initialPayload: number;
};

export type PhysicalLayerRun = {
  wire: number[];
  kinds: ('flag' | 'escape' | 'stuffed' | 'data')[];
  dataAt: number[];
  dataSpan: number[];
  stuffed: number;
  half: number[];
  cellsPerBit: number;
  signalCells: number;
  transitions: number;
  flatStart: number;
  flatHalf: number;
  flatBits: number;
  reads: { index: number; byte: number; branch: ReadBranch; state: number | null; got: number }[];
  recovered: number[];
};

export type ReadBranch = 'open-frame' | 'keep-byte' | 'escape' | 'restore-byte' | 'close-frame';

/** XOR 0x20 을 산술로 — 32 의 자리가 1 이면 -32, 아니면 +32 */
function flip32(b: number): number {
  return Math.floor(b / 32) % 2 === 1 ? b - 32 : b + 32;
}

/** 높은 자리 먼저, k = 0..7 */
function bitAt(b: number, k: number): number {
  let d = 128;
  for (let i = 0; i < k; i++) d = Math.floor(d / 2);
  return Math.floor(b / d) % 2;
}

/** 한 판의 셈 전부 — 부호 색인과 데이터에서 */
export function computePhysicalLayer(
  data: readonly number[],
  scheme: number,
  flag: number,
  escape: number,
): PhysicalLayerRun {
  if (scheme !== 0 && scheme !== 1 && scheme !== 2) throw new Error(`physical-layer: 모르는 부호 ${scheme}`);
  for (const b of data) {
    if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error(`physical-layer: 바이트가 아니다 ${b}`);
  }

  // 틀 — 바이트 채워 넣기
  const wire: number[] = [flag];
  const kinds: PhysicalLayerRun['kinds'] = ['flag'];
  const dataAt: number[] = [];
  const dataSpan: number[] = [];
  let stuffed = 0;
  for (const b of data) {
    dataAt.push(wire.length);
    if (b === flag || b === escape) {
      wire.push(escape, flip32(b));
      kinds.push('escape', 'stuffed');
      dataSpan.push(2);
      stuffed += 1;
    } else {
      wire.push(b);
      kinds.push('data');
      dataSpan.push(1);
    }
  }
  wire.push(flag);
  kinds.push('flag');

  // 부호 — 반 칸 열
  const half: number[] = [];
  let level = 0;
  for (const byte of wire) {
    for (let k = 0; k < 8; k++) {
      const bit = bitAt(byte, k);
      if (scheme === 0) {
        half.push(bit, bit);
      } else if (scheme === 1) {
        if (bit === 1) level = 1 - level;
        half.push(level, level);
      } else {
        half.push(1 - bit, bit);
      }
    }
  }

  // 뒤집힘 · 가장 긴 평평 (동률이면 앞의 것)
  let transitions = 0;
  let run = 1;
  let runStart = 0;
  let best = 1;
  let bestStart = 0;
  for (let i = 1; i < half.length; i++) {
    if (half[i] !== half[i - 1]) {
      transitions += 1;
      run = 1;
      runStart = i;
    } else {
      run += 1;
    }
    if (run > best) {
      best = run;
      bestStart = runStart;
    }
  }
  if (best % 2 !== 0) throw new Error('physical-layer: 가장 긴 평평이 반 칸 홀수 — 비트로 셀 수 없다');

  // 받는 쪽
  const reads: PhysicalLayerRun['reads'] = [];
  const recovered: number[] = [];
  let state = 0;
  let closed = false;
  for (let i = 0; i < wire.length; i++) {
    const b = wire[i]!;
    if (state === 0) {
      if (b !== flag) throw new Error(`physical-layer: 열리기 전에 표식이 아닌 바이트 ${b}`);
      state = 1;
      reads.push({ index: i, byte: b, branch: 'open-frame', state, got: -1 });
    } else if (state === 1) {
      if (b === flag) {
        reads.push({ index: i, byte: b, branch: 'close-frame', state: null, got: -1 });
        state = 0; // 다음 틀을 위한 복귀 — 화면에는 싣지 않는다
        closed = true;
        if (i !== wire.length - 1) throw new Error('physical-layer: 틀이 선 끝보다 먼저 닫혔다');
        break;
      }
      if (b === escape) {
        state = 2;
        reads.push({ index: i, byte: b, branch: 'escape', state, got: -1 });
      } else {
        recovered.push(b);
        reads.push({ index: i, byte: b, branch: 'keep-byte', state, got: b });
      }
    } else {
      const g = flip32(b);
      recovered.push(g);
      state = 1;
      reads.push({ index: i, byte: b, branch: 'restore-byte', state, got: g });
    }
  }
  if (!closed) throw new Error('physical-layer: 닫히지 않은 틀');
  if (recovered.length !== data.length || recovered.some((g, j) => g !== data[j])) {
    throw new Error('physical-layer: 되찾은 바이트가 보낸 것과 다르다');
  }

  const cellsPerBit = scheme === 2 ? 2 : 1;
  return {
    wire,
    kinds,
    dataAt,
    dataSpan,
    stuffed,
    half,
    cellsPerBit,
    signalCells: 8 * wire.length * cellsPerBit,
    transitions,
    flatStart: bestStart,
    flatHalf: best,
    flatBits: best / 2,
    reads,
    recovered,
  };
}

function inLadder(v: unknown, n: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
}

export async function physicalLayerAlgorithm(ctx0: FacetContext<PhysicalLayerData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<PhysicalLayerData>;
  const d = ctx.data;
  if (!Array.isArray(d.schemes) || !Array.isArray(d.payloads)) throw new Error('physical-layer: 사다리가 없다');
  if (typeof d.stepMs !== 'number') throw new Error('physical-layer: stepMs 가 없다');
  let scheme = d.initialScheme;
  let payload = d.initialPayload;
  if (!inLadder(scheme, d.schemes.length)) throw new Error(`physical-layer: 사다리 밖 부호 ${scheme}`);
  if (!inLadder(payload, d.payloads.length)) throw new Error(`physical-layer: 사다리 밖 데이터 ${payload}`);

  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    const prev = shown[name];
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playOne = async (): Promise<boolean> => {
    const data = d.payloads[payload];
    if (!data) throw new Error(`physical-layer: 데이터 ${payload} 가 없다`);
    const r = computePhysicalLayer(data, scheme, d.flag, d.escape);

    // 걸음 0 — 틀에 담는다
    await phase('stuff');
    await ctx.emit({
      type: 'frame',
      payload: {
        scheme,
        payload,
        data: [...data],
        wire: r.wire,
        kinds: r.kinds,
        dataAt: r.dataAt,
        dataSpan: r.dataSpan,
        stuffed: r.stuffed,
      },
    });
    setMetric('wire-bytes', 0);
    setMetric('signal-cells', 0);
    setMetric('transitions', 0);
    setMetric('longest-flat', 0);
    setMetric('recovered-bytes', 0);
    setMetric('wire-bytes', r.wire.length);
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 1 — 선에 싣는다
    if (ctx.cancelled) return false;
    await phase('longest-flat');
    await ctx.emit({
      type: 'line',
      payload: {
        scheme,
        half: r.half,
        cellsPerBit: r.cellsPerBit,
        signalCells: r.signalCells,
        transitions: r.transitions,
        flatStart: r.flatStart,
        flatHalf: r.flatHalf,
        flatBits: r.flatBits,
      },
    });
    setMetric('signal-cells', r.signalCells);
    setMetric('transitions', r.transitions);
    setMetric('longest-flat', r.flatBits);
    if (!(await ctx.sleep(d.stepMs))) return false;

    // 걸음 2… — 받는 쪽이 한 바이트씩 읽는다
    let count = 0;
    for (const rd of r.reads) {
      if (ctx.cancelled) return false;
      if (rd.branch === 'open-frame') await phase('open-frame');
      else if (rd.branch === 'keep-byte') await phase('keep-byte');
      else if (rd.branch === 'escape') await phase('escape');
      else if (rd.branch === 'restore-byte') await phase('restore-byte');
      else await phase('close-frame');
      if (rd.got >= 0) count += 1;
      await ctx.emit({
        type: 'read',
        payload: {
          index: rd.index,
          byte: rd.byte,
          branch: rd.branch,
          ...(rd.state === null ? {} : { state: rd.state }),
          got: rd.got,
          recovered: r.recovered.slice(0, count),
          sent: [...data],
        },
      });
      setMetric('recovered-bytes', count);
      if (!(await ctx.sleep(d.stepMs))) return false;
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playOne())) return;
      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = p && typeof p === 'object' ? (p as { value?: unknown }).value : undefined;
        if (input.type === 'scheme') {
          if (!inLadder(value, d.schemes.length)) throw new Error(`physical-layer: 사다리 밖 부호 ${String(value)}`);
          scheme = value;
          break;
        }
        if (input.type === 'payload') {
          if (!inLadder(value, d.payloads.length)) throw new Error(`physical-layer: 사다리 밖 데이터 ${String(value)}`);
          payload = value;
          break;
        }
        continue;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
