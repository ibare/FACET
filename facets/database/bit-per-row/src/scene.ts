import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 이번 걸음 — 무엇이 일어났는지 (좌표 · 문안 없음). */
export type BitPerRowStep =
  | { kind: 'start' }
  | { kind: 'row'; index: number; value: string }
  | { kind: 'done'; ones: number[]; total: number; bits: number; rows: number; values: number };

export type BitPerRowScene = {
  /** 바탕 — 표 이름 · 열 이름 · 줄마다의 값 (initialData 에서 베낌) */
  table: string;
  column: string;
  rows: string[];
  /** 바탕 — 비트 줄의 차례 (알고리즘의 init 이 정한다) */
  values: string[];
  /** 자취 — 비트 줄마다 지금까지 적힌 글자. values 와 같은 차례 */
  bits: string[];
  /** 이번 걸음 */
  step: BitPerRowStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function stringArray(x: unknown, what: string): string[] {
  if (!Array.isArray(x)) throw new Error(`bit-per-row 장면: ${what} 이 배열이 아니다`);
  return x.map((v, i) => {
    if (typeof v !== 'string') throw new Error(`bit-per-row 장면: ${what}[${i}] 가 글자가 아니다`);
    return v;
  });
}

function numberArray(x: unknown, what: string): number[] {
  if (!Array.isArray(x)) throw new Error(`bit-per-row 장면: ${what} 이 배열이 아니다`);
  return x.map((v, i) => {
    if (typeof v !== 'number') throw new Error(`bit-per-row 장면: ${what}[${i}] 가 수가 아니다`);
    return v;
  });
}

function num(x: unknown, what: string): number {
  if (typeof x !== 'number') throw new Error(`bit-per-row 장면: ${what} 가 수가 아니다`);
  return x;
}

export const bitPerRowScene: ScenePlan<BitPerRowScene> = {
  initial(initialData: unknown): BitPerRowScene {
    if (!isRecord(initialData)) throw new Error('bit-per-row 장면: initialData 가 없다');
    const { table, column, rows } = initialData;
    if (typeof table !== 'string') throw new Error('bit-per-row 장면: table 이 글자가 아니다');
    if (typeof column !== 'string') throw new Error('bit-per-row 장면: column 이 글자가 아니다');
    return {
      table,
      column,
      rows: stringArray(rows, 'rows'),
      values: [],
      bits: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: BitPerRowScene, event: FacetRuntimeEvent): BitPerRowScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        if (!isRecord(p)) throw new Error('bit-per-row 장면: init 의 payload 가 없다');
        const values = stringArray(p.values, 'values');
        return { ...scene, values, bits: values.map(() => ''), step: { kind: 'start' } };
      }
      case 'row': {
        if (!isRecord(p)) throw new Error('bit-per-row 장면: row 의 payload 가 없다');
        const index = num(p.index, 'index');
        const value = p.value;
        if (typeof value !== 'string') throw new Error('bit-per-row 장면: value 가 글자가 아니다');
        const digits = stringArray(p.digits, 'digits');
        if (digits.length !== scene.bits.length) {
          throw new Error('bit-per-row 장면: digits 의 수가 비트 줄의 수와 다르다');
        }
        const bits = scene.bits.map((line, k) => {
          if (line.length !== index) throw new Error(`bit-per-row 장면: 비트 줄 ${k} 의 길이가 자리 ${index} 와 어긋난다`);
          return line + digits[k];
        });
        return { ...scene, bits, step: { kind: 'row', index, value } };
      }
      case 'done': {
        if (!isRecord(p)) throw new Error('bit-per-row 장면: done 의 payload 가 없다');
        return {
          ...scene,
          step: {
            kind: 'done',
            ones: numberArray(p.ones, 'ones'),
            total: num(p.total, 'total'),
            bits: num(p.bits, 'bits'),
            rows: num(p.rows, 'rows'),
            values: num(p.values, 'values'),
          },
        };
      }
      default:
        throw new Error(`bit-per-row 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
