/**
 * vectorSimilarity — 무엇으로 재느냐가 누가 닮았는지를 바꾼다.
 *
 * 질의 하나와 후보 다섯을 놓고 **재는 법을 손으로 갈아 끼운다.** 코사인 ·
 * 유클리드 · 내적 셋은 같은 여섯 점을 보고도 서로 다른 순위를 내놓는다.
 * 코사인 1등인 `Q` 가 유클리드에서는 꼴찌다.
 *
 * ── 1차 데이터는 좌표뿐이다
 *
 * `initialData` 에는 점 여섯의 정수 좌표만 있다. 길이 · 코사인 · 거리 · 내적 ·
 * 순위는 **전부 여기서 셈한다.** 파생값을 선언에 박으면 그것이 선언과 어긋나도
 * 화면은 멀쩡히 뜬다.
 *
 * ── 동률 규칙
 *
 * 두 후보의 잰 값이 같으면 **`candidates` 에 적힌 차례가 앞선 쪽이 앞선다.**
 * 지금 데이터에는 동률이 하나도 없지만 규칙을 정해 두지 않으면 좌표를 손대는
 * 순간 실행마다 다른 순위가 나온다 — `Array.prototype.sort` 의 안정성에
 * 기대는 대신 비교 함수가 직접 차례를 진다.
 *
 * ── 이벤트 (facet 고유. 표준 어휘는 `done` 하나)
 *
 * | type             | payload                                        | silent |
 * | ---------------- | ---------------------------------------------- | ------ |
 * | `measure-chosen` | `{ measure: MeasureKind }`                     | 아님   |
 * | `measured`       | `{ id, x, y, value, measure }`                 | 아님   |
 * | `ranked`         | `{ order: string[], changed: number }`         | 아님   |
 * | `done`           | 없음                                            | 아님   |
 *
 * `measure-chosen` 은 손에 쥔 자가 바뀌었음을 알린다 — stage 가 재는 도구의
 * 그림을 갈아 끼우므로 시각 변화가 있고, 따라서 silent 가 아니다.
 * `measured` 는 후보 하나를 재는 한 걸음이고, `ranked` 는 그 결과로 다섯이
 * 자리를 맞바꾸는 걸음이다. `order` 는 1등부터 5등까지의 후보 id 이고
 * `changed` 는 첫 잣대(코사인)의 자리와 견주어 **자리가 달라진 후보의 수**다.
 *
 * ── 계기 (C5. 선언은 `facet.ts` 의 metrics)
 *
 * `measure-count`      한 판에 잰 후보 수. 잣대를 바꿔도 늘 다섯이다.
 * `rank-change-count`  첫 잣대의 자리에서 옮겨 간 후보 수. 0 · 5 · 4 로 갈린다.
 *
 * `ctx.metric` 은 누적 채널이고 러너는 **되감기 때만** 계기를 비운다. 손잡이를
 * 돌려 다시 도는 것은 되감기가 아니므로, 그대로 더하면 판을 거듭할수록 수가
 * 쌓인다. 아래 `gauge` 가 지금 값을 들고 **차이만** 보낸다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 재는 법. 화면에 그대로 새겨지는 표식이라 번역하지 않는다 (C10). */
export type MeasureKind = 'cosine' | 'euclidean' | 'dot';

/**
 * 손잡이의 구간 차례. `facet.ts` 의 `segments[].value` 가 이 배열의 색인이다.
 * 0 번이 기본값이자 `rank-change-count` 의 견줌 기준이다.
 */
export const VECTOR_SIMILARITY_MEASURES: readonly MeasureKind[] = ['cosine', 'euclidean', 'dot'];

export type VectorPoint = { id: string; x: number; y: number };

export type VectorSimilarityData = {
  type: string;
  query: VectorPoint;
  candidates: VectorPoint[];
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

function length(p: VectorPoint): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

function dot(a: VectorPoint, b: VectorPoint): number {
  return a.x * b.x + a.y * b.y;
}

function euclidean(a: VectorPoint, b: VectorPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cosine(a: VectorPoint, b: VectorPoint): number {
  const denom = length(a) * length(b);
  // 길이 0 인 벡터는 방향이 없다. 데이터가 그런 점을 담으면 코사인은 뜻을 잃으므로
  // 0 으로 떨어뜨려 맨 뒤로 보낸다 (나눗셈이 NaN 을 내면 정렬이 통째로 무너진다).
  return denom === 0 ? 0 : dot(a, b) / denom;
}

/** 잣대 하나로 후보 하나를 잰 값. 화면에 그대로 뜨는 수다. */
export function measureValue(measure: MeasureKind, query: VectorPoint, v: VectorPoint): number {
  if (measure === 'euclidean') return euclidean(query, v);
  if (measure === 'dot') return dot(query, v);
  return cosine(query, v);
}

/**
 * 잰 값을 **작을수록 앞선** 하나의 자로 옮긴다. 코사인과 내적은 클수록 닮았고
 * 유클리드는 작을수록 가까우므로, 앞의 둘만 부호를 뒤집으면 세 잣대가 한 비교
 * 함수를 함께 쓴다.
 */
function rankKey(measure: MeasureKind, value: number): number {
  return measure === 'euclidean' ? value : -value;
}

/**
 * 1등부터 꼴찌까지의 후보 id.
 *
 * 동률이면 `candidates` 에 적힌 차례가 앞선 쪽이 앞선다 (위 머리말).
 */
export function rankOrder(measure: MeasureKind, data: VectorSimilarityData): string[] {
  return data.candidates
    .map((v, index) => ({ id: v.id, index, key: rankKey(measure, measureValue(measure, data.query, v)) }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key - b.key))
    .map((row) => row.id);
}

/** 두 차례를 견주어 자리가 달라진 후보의 수를 센다. */
function changedSeats(baseline: string[], order: string[]): number {
  let n = 0;
  for (let i = 0; i < order.length; i += 1) {
    if (baseline[i] !== order[i]) n += 1;
  }
  return n;
}

function isPoint(v: unknown): v is VectorPoint {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
}

/** `ctx.data` 를 좁힌다. 러너가 넘기는 것은 선언에서 온 열린 객체다 (C9). */
function readData(raw: unknown): VectorSimilarityData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vectorSimilarity: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (!isPoint(d.query)) throw new Error('vectorSimilarity: query 좌표가 없다');
  if (!Array.isArray(d.candidates) || !d.candidates.every(isPoint)) {
    throw new Error('vectorSimilarity: candidates 가 좌표 목록이 아니다');
  }
  return {
    type: typeof d.type === 'string' ? d.type : 'vector-similarity',
    query: d.query,
    candidates: d.candidates,
    stepMs: typeof d.stepMs === 'number' ? d.stepMs : 460,
  };
}

/** 손잡이가 보낸 구간 값을 잣대 색인으로 읽는다. 범위를 벗어나면 null. */
function readSegment(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const raw = typeof p.value === 'number' ? p.value : Number(p.value);
  if (!Number.isInteger(raw) || raw < 0 || raw >= VECTOR_SIMILARITY_MEASURES.length) return null;
  return raw;
}

export const vectorSimilarityAlgorithm = async (ctx: FacetContext<unknown>): Promise<void> => {
  const rc = ctx as ReactiveContext<unknown>;
  const data = readData(ctx.data);
  const baseline = rankOrder(VECTOR_SIMILARITY_MEASURES[0]!, data);

  /**
   * 지금 화면에 뜬 값을 들고 **차이만** 보낸다.
   *
   * 델타가 0 이어도 보낸다 — 안 보내면 갈리지 않는 잣대에서 계기 이름이 통째로
   * 빠져 "선언한 계기가 없는 것" 과 구별되지 않는다.
   */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - prev);
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return rc.sleep(data.stepMs);
  };

  /** 한 판 — 잣대를 들고 다섯을 잰 뒤 줄을 다시 세운다. */
  const round = async (measure: MeasureKind): Promise<boolean> => {
    if (ctx.cancelled) return false;
    await ctx.emit({ type: 'measure-chosen', payload: { measure } });
    if (!(await gate())) return false;

    for (const v of data.candidates) {
      // 문이 루프 바디의 첫 줄이라 이것이 곧 진입 검사다 (C8).
      if (ctx.cancelled) return false;
      await ctx.emit({
        type: 'measured',
        payload: { id: v.id, x: v.x, y: v.y, value: measureValue(measure, data.query, v), measure },
      });
      if (!(await gate())) return false;
    }

    const order = rankOrder(measure, data);
    const changed = changedSeats(baseline, order);
    await ctx.emit({ type: 'ranked', payload: { order, changed } });
    // 줄이 다시 서는 것을 한 박자 보여 준 뒤에 판을 닫는다. `ranked` 가 1등을
    // 말하고 `done` 이 몇이 옮겼는지로 닫는데, 사이에 틈이 없으면 뒤엣것이
    // 앞엣것을 곧바로 덮어써 읽을 틈이 없다.
    if (!(await gate())) return false;

    gauge('measure-count', data.candidates.length);
    gauge('rank-change-count', changed);
    await ctx.emit({ type: 'done' });
    return !ctx.cancelled;
  };

  /**
   * 다음 잣대를 기다린다. 고른 색인이거나, 취소면 null.
   *
   * 취소를 색인과 같은 자리에 겹치지 않는다 — 뜻이 둘이면 부르는 쪽이 가른다 (C8).
   */
  const waitMeasure = async (): Promise<number | null> => {
    try {
      for (;;) {
        if (ctx.cancelled) return null; // 앞 — continue 로 돌아와도 여기를 지난다
        const input = await rc.waitForInput();
        if (ctx.cancelled) return null; // 뒤 — throw 규약에 기대지 않는다
        if (input.type !== 'measure') continue;
        const picked = readSegment(input.payload);
        if (picked === null) continue;
        return picked;
      }
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!ctx.cancelled) throw err;
      return null;
    }
  };

  let picked = 0;
  for (;;) {
    if (ctx.cancelled) return;
    const measure = VECTOR_SIMILARITY_MEASURES[picked];
    if (measure === undefined) return;
    if (!(await round(measure))) return;
    const next = await waitMeasure();
    if (next === null) return;
    picked = next;
  }
};
