/**
 * all-pairs — CROSS JOIN 은 결과 줄을 몇 개 만드는가.
 *
 * 조건이 없다. 왼쪽 표(sizes)의 줄 하나가 오른쪽 표(colors)의 **모든** 줄과 한꺼번에
 * 짝을 짓는다. 견주는 일(열쇠 맞추기)이 한 번도 없다 — 짝 줄은 오른쪽 표의 줄 차례
 * 그대로 생긴다. 걸음마다 왼쪽 줄 하나, 결과 줄은 오른쪽 줄 수만큼 불어난다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (두 표와 SQL, 결과 0 줄).
 * 걸음 0 에 이미 읽을 것이 있으므로 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (전부 silent 아님)
 *   spread  { size: number, pairs: Array<{ size: number; color: number }>, rows: number }
 *           size  — 이번 걸음에 퍼져 나가는 왼쪽 줄의 번호 (0 부터, 표의 차례)
 *           pairs — 새로 생긴 결과 줄. 오른쪽 표의 줄 차례
 *           rows  — 이번 걸음까지 결과 줄 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 열짜리 표 — 이름 · 열 이름 · 줄 값 (자료, 번역하지 않는다) */
export type AllPairsTable = {
  name: string;
  column: string;
  rows: string[];
};

export type AllPairsFacetData = {
  type: 'all-pairs';
  stepMs: number;
  /** 화면에 보이는 SQL 줄 — 보이기용 자료. 알고리즘은 읽지 않는다 */
  sql: string[];
  /** FROM 쪽 표 */
  left: AllPairsTable;
  /** CROSS JOIN 쪽 표 */
  right: AllPairsTable;
};

function isTable(v: unknown): v is AllPairsTable {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === 'string' &&
    typeof o.column === 'string' &&
    Array.isArray(o.rows) &&
    o.rows.every((r) => typeof r === 'string')
  );
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 — 빈 표로 지어내지 않는다 */
export function readAllPairsData(raw: unknown): AllPairsFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('all-pairs: initialData 가 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'all-pairs') throw new Error('all-pairs: type 이 all-pairs 가 아니다');
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) {
    throw new Error('all-pairs: stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(o.sql) || !o.sql.every((l) => typeof l === 'string')) {
    throw new Error('all-pairs: sql 은 글자 줄 배열이어야 한다');
  }
  if (!isTable(o.left)) throw new Error('all-pairs: left 표의 모양이 틀렸다');
  if (!isTable(o.right)) throw new Error('all-pairs: right 표의 모양이 틀렸다');
  return {
    type: 'all-pairs',
    stepMs: o.stepMs,
    sql: [...o.sql],
    left: { name: o.left.name, column: o.left.column, rows: [...o.left.rows] },
    right: { name: o.right.name, column: o.right.column, rows: [...o.right.rows] },
  };
}

export async function allPairs(context: FacetContext<AllPairsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<AllPairsFacetData>;
  const data = readAllPairsData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let rows = 0;
  // 걸음 0(두 표와 SQL)을 읽을 틈을 먼저 둔다. 뒤의 문은 앞 걸음을 읽을 틈이다.
  for (let s = 0; s < data.left.rows.length; s += 1) {
    if (!(await pause())) return;
    // 조건이 없다 — 오른쪽 표의 줄 전부가 짝이다. 견주지 않는다.
    const pairs: Array<{ size: number; color: number }> = [];
    for (let c = 0; c < data.right.rows.length; c += 1) {
      if (ctx.cancelled) return;
      pairs.push({ size: s, color: c });
    }
    rows += pairs.length;
    await ctx.emit({ type: 'spread', payload: { size: s, pairs, rows } });
  }
}
