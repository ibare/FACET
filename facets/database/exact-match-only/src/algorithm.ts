/**
 * exact-match-only — 해시 인덱스는 왜 `=` 에는 곧장 가고 범위에는 쓸모가 없는가.
 *
 * 표의 열 하나에 건 해시 인덱스. 열쇠 k 는 버킷 h(k) = k mod B 에 들어간다 (버킷 하나 = 페이지 하나,
 * 버킷 안의 차례는 들어온 차례). 질의 글자(SQL)를 읽어 두 모양만 받는다 —
 * `SELECT * FROM <표> WHERE <열> = <정수>` 와 `… WHERE <열> BETWEEN <정수> AND <정수>` (양 끝 포함).
 * `=` 는 h 로 버킷 하나를 골라 그 버킷의 항목을 전부 견준다. 범위는 차례를 쓸 수 없으니 버킷 0 부터
 * B-1 까지 전부 읽고 항목마다 범위를 견준다. 모르는 질의 모양 · 다른 표나 열 · 정수가 아닌 열쇠는 던진다.
 *
 * 이벤트 (발신 차례대로):
 *
 * - `init` (silent) — 걸음 0 의 바탕을 갈아 끼운다
 *   payload: {
 *     modulus: number,                                   // 버킷 수 B
 *     buckets: { bucket: number, entries: { key: number, row: string }[] }[],   // 0 .. B-1 차례
 *     queries: ({ kind: 'eq', key: number } | { kind: 'range', lo: number, hi: number })[]
 *   }
 * - `show-query` — 둘째 질의부터, 그 질의를 화면에 올린다
 *   payload: { query: number }
 * - `hash` — `=` 질의의 열쇠를 해시해 버킷 하나를 고른다
 *   payload: { query: number, key: number, modulus: number, bucket: number }
 * - `read-bucket` — 버킷(페이지) 하나를 읽고 그 안의 항목을 견준다
 *   payload: {
 *     query: number, bucket: number,
 *     compared: number[],                     // 이번 페이지에서 견준 열쇠, 버킷 안 차례
 *     matched: { key: number, row: string }[], // 이번 페이지에서 맞은 항목
 *     pages: number, comparedTotal: number, matchedTotal: number   // 이 질의의 누적
 *   }
 * - `done` — 두 질의가 끝났다
 *   payload: {}
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ExactMatchEntry = { key: number; row: string };

export type ExactMatchOnlyFacetData = {
  type: 'exact-match-only';
  table: string;
  column: string;
  /** 버킷 수 B. 해시 함수는 k mod B. */
  buckets: number;
  /** 인덱스에 들어간 항목, 표 차례. */
  entries: ExactMatchEntry[];
  /** 질의 글자(SQL), 이 차례로 돈다. */
  queries: string[];
  stepMs: number;
};

export type ExactMatchPredicate =
  | { kind: 'eq'; key: number }
  | { kind: 'range'; lo: number; hi: number };

export type ExactMatchBucket = { bucket: number; entries: ExactMatchEntry[] };

/** 질의 글자를 읽는다. 받는 모양은 둘이고 그 밖은 던진다. */
export function parseExactMatchQuery(
  sql: string,
  table: string,
  column: string,
): ExactMatchPredicate {
  const head = /^SELECT \* FROM ([A-Za-z_][A-Za-z0-9_]*) WHERE ([A-Za-z_][A-Za-z0-9_]*) (.+)$/.exec(sql.trim());
  if (head === null) throw new Error(`exact-match-only: 모르는 질의 모양 — ${sql}`);
  const [, tbl, col, rest] = head;
  if (tbl !== table) throw new Error(`exact-match-only: 인덱스가 없는 표 ${String(tbl)} — ${sql}`);
  if (col !== column) throw new Error(`exact-match-only: 인덱스가 없는 열 ${String(col)} — ${sql}`);
  const eq = /^= (-?\d+)$/.exec(String(rest));
  if (eq !== null) return { kind: 'eq', key: Number(eq[1]) };
  const range = /^BETWEEN (-?\d+) AND (-?\d+)$/.exec(String(rest));
  if (range !== null) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo > hi) throw new Error(`exact-match-only: 범위의 아래 끝이 위 끝보다 크다 — ${sql}`);
    return { kind: 'range', lo, hi };
  }
  throw new Error(`exact-match-only: 모르는 조건 모양 — ${sql}`);
}

/** 해시 함수 h(k) = k mod B. 음수 열쇠도 0 .. B-1 로 보낸다. */
export function exactMatchBucketOf(key: number, modulus: number): number {
  if (!Number.isInteger(key)) throw new Error(`exact-match-only: 정수가 아닌 열쇠 ${key}`);
  if (!Number.isInteger(modulus) || modulus <= 0) {
    throw new Error(`exact-match-only: 버킷 수가 양의 정수가 아니다 — ${modulus}`);
  }
  return ((key % modulus) + modulus) % modulus;
}

export async function exactMatchOnly(ctx: FacetContext<ExactMatchOnlyFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ExactMatchOnlyFacetData>;
  const { table, column, entries, queries, stepMs } = ctx.data;
  const modulus = ctx.data.buckets;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 넣는 차례 = 표의 차례. 버킷 안에서는 들어온 차례를 지킨다.
  const buckets: ExactMatchBucket[] = [];
  for (let b = 0; b < modulus; b += 1) {
    if (ctx.cancelled) return;
    buckets.push({ bucket: b, entries: [] });
  }
  for (const entry of entries) {
    if (ctx.cancelled) return;
    const b = exactMatchBucketOf(entry.key, modulus);
    const bucket = buckets[b];
    if (bucket === undefined) throw new Error(`exact-match-only: 버킷 ${b} 이 없다`);
    bucket.entries.push({ key: entry.key, row: entry.row });
  }

  const predicates: ExactMatchPredicate[] = [];
  for (const sql of queries) {
    if (ctx.cancelled) return;
    predicates.push(parseExactMatchQuery(sql, table, column));
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      modulus,
      buckets: buckets.map((b) => ({ bucket: b.bucket, entries: b.entries.map((e) => ({ ...e })) })),
      queries: predicates.map((p) => ({ ...p })),
    },
  });
  // 걸음 0 은 버킷과 첫 질의가 이미 선 화면이다 — 읽을 틈을 둔다.
  if (!(await pause())) return;

  for (let q = 0; q < predicates.length; q += 1) {
    if (ctx.cancelled) return;
    const predicate = predicates[q];
    if (predicate === undefined) throw new Error(`exact-match-only: 질의 ${q} 이 없다`);

    if (q > 0) {
      await ctx.emit({ type: 'show-query', payload: { query: q } });
      if (!(await pause())) return;
    }

    let pages = 0;
    let comparedTotal = 0;
    let matchedTotal = 0;

    if (predicate.kind === 'eq') {
      const b = exactMatchBucketOf(predicate.key, modulus);
      await ctx.emit({ type: 'hash', payload: { query: q, key: predicate.key, modulus, bucket: b } });
      if (!(await pause())) return;

      const bucket = buckets[b];
      if (bucket === undefined) throw new Error(`exact-match-only: 버킷 ${b} 이 없다`);
      const compared = bucket.entries.map((e) => e.key);
      const matched = bucket.entries.filter((e) => e.key === predicate.key).map((e) => ({ ...e }));
      pages += 1;
      comparedTotal += compared.length;
      matchedTotal += matched.length;
      await ctx.emit({
        type: 'read-bucket',
        payload: { query: q, bucket: b, compared, matched, pages, comparedTotal, matchedTotal },
      });
      if (!(await pause())) return;
    } else {
      // 해시는 차례를 버렸다 — 맞는 열쇠가 어느 버킷에 있는지 모르니 버킷을 전부 읽는다.
      for (const bucket of buckets) {
        if (ctx.cancelled) return;
        const compared = bucket.entries.map((e) => e.key);
        const matched = bucket.entries
          .filter((e) => e.key >= predicate.lo && e.key <= predicate.hi)
          .map((e) => ({ ...e }));
        pages += 1;
        comparedTotal += compared.length;
        matchedTotal += matched.length;
        await ctx.emit({
          type: 'read-bucket',
          payload: { query: q, bucket: bucket.bucket, compared, matched, pages, comparedTotal, matchedTotal },
        });
        if (!(await pause())) return;
      }
    }
  }

  await ctx.emit({ type: 'done', payload: {} });
}
