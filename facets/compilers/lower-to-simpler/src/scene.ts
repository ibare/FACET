/**
 * 낮추기 조각의 장면.
 *
 * 바탕 — `dst` (넣는 이름) · `source` (원시 식 나무) · `env` (뜻 대조에 넣는 값). initial 이 정한다.
 * 자취 — `rest` (아직 떼어지지 않은 원시 식. 다 떼어지면 null) · `lines` (내려앉은 세 주소 줄) · `check` (뜻 대조 값).
 * 이번 걸음 — `step`. 떼어 낸 걸음은 떼기 전의 식(`was`)을 계기값으로 싣는다.
 *
 * 떼어 낼 자리 · 임시 이름 · 남은 연산 수 · 값은 알고리즘이 셈해 보낸다. 식 나무의 모양과 그 함수는 algorithm.ts 에 있다.
 * 장면은 그 자리의 연산을 한 줄로 옮겨 적을 뿐이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { countOps, isNode, nodeAt, readExpr, readLowerData, replaceAt, type Expr, type IrLine } from './algorithm.js';

export type LowerStep =
  | { kind: 'start' }
  | { kind: 'peel'; path: string; name: string; line: number; was: Expr }
  | { kind: 'check' };

export type LowerScene = {
  dst: string;
  source: Expr;
  env: Array<[string, number]>;
  rest: Expr | null;
  lines: IrLine[];
  /** 원시 식에 남은 연산 수 — 처음은 식 나무에서, 걸음마다 알고리즘이 셈해 보낸다 */
  left: number;
  check: { source: number; values: number[] } | null;
  step: LowerStep;
};

function reducePeel(scene: LowerScene, payload: Record<string, unknown>): LowerScene {
  const { path, name, left } = payload;
  if (typeof left !== 'number' || !Number.isInteger(left) || left < 0) throw new Error('lower-to-simpler: peel 의 left 가 틀렸다');
  if (typeof path !== 'string' || !/^[lr]*$/.test(path)) throw new Error('lower-to-simpler: peel 의 path 가 틀렸다');
  if (typeof name !== 'string' || name === '') throw new Error('lower-to-simpler: peel 의 name 이 없다');
  if (scene.rest === null) throw new Error('lower-to-simpler: 떼어 낼 식이 남지 않았다');
  const node = nodeAt(scene.rest, path);
  if (!isNode(node) || isNode(node.l) || isNode(node.r)) {
    throw new Error(`lower-to-simpler: 자리 ${path} 는 두 피연산자가 다 잎인 연산이 아니다`);
  }
  if (path === '' && name !== scene.dst) throw new Error('lower-to-simpler: 가장 바깥 연산은 넣는 이름에 곧장 쓴다');
  const line: IrLine = { dst: name, l: { ...node.l }, op: node.op, r: { ...node.r } };
  return {
    ...scene,
    rest: path === '' ? null : replaceAt(scene.rest, path, { var: name }),
    lines: [...scene.lines, line],
    left,
    step: { kind: 'peel', path, name, line: scene.lines.length, was: scene.rest },
  };
}

function reduceCheck(scene: LowerScene, payload: Record<string, unknown>): LowerScene {
  const { source, values } = payload;
  if (typeof source !== 'number') throw new Error('lower-to-simpler: check 의 source 가 수가 아니다');
  if (!Array.isArray(values) || values.length !== scene.lines.length) {
    throw new Error('lower-to-simpler: check 의 values 가 줄 수와 맞지 않는다');
  }
  const nums: number[] = [];
  for (const v of values) {
    if (typeof v !== 'number') throw new Error('lower-to-simpler: check 의 값이 수가 아니다');
    nums.push(v);
  }
  return { ...scene, check: { source, values: nums }, step: { kind: 'check' } };
}

export const lowerToSimplerScene: ScenePlan<LowerScene> = {
  initial(initialData: unknown): LowerScene {
    const d = readLowerData(initialData);
    return {
      dst: d.dst,
      source: d.expr,
      env: d.env.map(([k, v]) => [k, v]),
      rest: readExpr(d.expr, 'expr'),
      lines: [],
      left: countOps(d.expr),
      check: null,
      step: { kind: 'start' },
    };
  },
  reduce(scene: LowerScene, event: FacetRuntimeEvent): LowerScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error(`lower-to-simpler: ${event.type} 에 payload 가 없다`);
    const payload = p as Record<string, unknown>;
    if (event.type === 'peel') return reducePeel(scene, payload);
    if (event.type === 'check') return reduceCheck(scene, payload);
    throw new Error(`lower-to-simpler: 모르는 이벤트 ${event.type}`);
  },
};
