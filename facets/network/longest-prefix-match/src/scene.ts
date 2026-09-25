/**
 * 최장 접두 일치의 장면.
 *
 * 바탕   목적지(주소 · 비트)와 표의 줄(접두 · 망 주소 비트 · 길이 · 나가는 문). initialData 에서 세운다.
 * 자취   줄마다 맞춰 본 결과(`results`)와 고른 줄(`chosen`).
 * 이번 걸음 `step` — 처음 · 줄 하나 맞춰 보기 · 고르기.
 *
 * 비트는 주소의 다른 표기라 알고리즘과 같은 함수(`addrBits` · `parsePrefix`)로 얻는다.
 * 맞음 · 안 맞음 · 고르기는 알고리즘이 셈해 보낸 것을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { addrBits, parsePrefix } from './algorithm.js';

export type LpmRow = { prefix: string; bits: string; len: number; out: string };
export type LpmResult = { matched: boolean; same: number };

export type LpmStep =
  | { kind: 'start' }
  | { kind: 'probe'; row: number }
  | { kind: 'pick'; row: number };

export type LongestPrefixMatchScene = {
  dest: { addr: string; bits: string };
  rows: LpmRow[];
  results: (LpmResult | null)[];
  chosen: number | null;
  step: LpmStep;
};

function readData(initialData: unknown): { dest: string; table: { prefix: string; out: string }[] } {
  if (typeof initialData !== 'object' || initialData === null) throw new Error('initialData 가 없다');
  const dest = (initialData as { dest?: unknown }).dest;
  const table = (initialData as { table?: unknown }).table;
  if (typeof dest !== 'string') throw new Error('목적지 주소가 없다');
  if (!Array.isArray(table) || table.length === 0) throw new Error('표가 비었다');
  const rows = table.map((entry: unknown, i) => {
    if (typeof entry !== 'object' || entry === null) throw new Error(`표의 줄 ${i} 모양이 틀렸다`);
    const prefix = (entry as { prefix?: unknown }).prefix;
    const out = (entry as { out?: unknown }).out;
    if (typeof prefix !== 'string' || typeof out !== 'string') throw new Error(`표의 줄 ${i} 모양이 틀렸다`);
    return { prefix, out };
  });
  return { dest, table: rows };
}

function readRow(scene: LongestPrefixMatchScene, payload: unknown): number {
  const row = typeof payload === 'object' && payload !== null ? (payload as { row?: unknown }).row : undefined;
  if (typeof row !== 'number' || !Number.isInteger(row) || row < 0 || row >= scene.rows.length) {
    throw new Error(`없는 줄: ${String(row)}`);
  }
  return row;
}

export const longestPrefixMatchScene: ScenePlan<LongestPrefixMatchScene> = {
  initial(initialData: unknown): LongestPrefixMatchScene {
    const { dest, table } = readData(initialData);
    const rows = table.map(({ prefix, out }) => {
      const { bits, len } = parsePrefix(prefix);
      return { prefix, bits, len, out };
    });
    return {
      dest: { addr: dest, bits: addrBits(dest) },
      rows,
      results: rows.map(() => null),
      chosen: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LongestPrefixMatchScene, event: FacetRuntimeEvent): LongestPrefixMatchScene {
    if (event.type === 'probe') {
      const row = readRow(scene, event.payload);
      const p = event.payload as { matched?: unknown; same?: unknown };
      if (typeof p.matched !== 'boolean' || typeof p.same !== 'number') {
        throw new Error('probe payload 모양이 틀렸다');
      }
      const results = scene.results.slice();
      results[row] = { matched: p.matched, same: p.same };
      return { ...scene, results, step: { kind: 'probe', row } };
    }
    if (event.type === 'pick') {
      const row = readRow(scene, event.payload);
      return { ...scene, chosen: row, step: { kind: 'pick', row } };
    }
    return scene;
  },
};
