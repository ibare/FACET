/**
 * match-on-key — INNER JOIN 을 중첩 루프로 돈다. 바깥은 왼쪽 표(emp), 안쪽은 오른쪽 표(dept).
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (두 표와 SQL). 알고리즘은
 * 그 화면을 읽을 틈(stepMs)을 먼저 두고, 왼쪽 줄마다 한 걸음을 낸다.
 *
 * 이벤트
 *   match   (silent 아님) 왼쪽 줄 하나가 열쇠로 오른쪽 줄을 찾아 결과 한 줄이 된다
 *     payload {
 *       left: number        왼쪽 표의 줄 번호 (0 부터)
 *       right: number       찾은 오른쪽 표의 줄 번호 (0 부터)
 *       key: string         잇는 데 쓴 열쇠 값 (보이기용 글자)
 *       values: [string, string]   결과 줄의 두 칸 (SELECT 의 왼쪽 열 · 오른쪽 열)
 *       total: number       이 걸음까지 결과 줄 수
 *       copies: number      찾은 오른쪽 줄이 지금까지 결과에 복사된 횟수
 *     }
 *
 * SQL 은 파싱하지 않는다. 표 · 잇는 조건 · 고르는 열은 initialData 의 구조다.
 * 짝이 없거나 둘 이상이면 던진다 — 짝 없는 줄은 이 조각의 말이 아니고(keep-unmatched),
 * 오른쪽 열쇠는 한 줄만 가리킨다고 두었다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Cell = string | number;

export type TableData = {
  name: string;
  columns: string[];
  rows: Cell[][];
};

export type MatchOnKeyFacetData = {
  type: 'match-on-key';
  stepMs: number;
  /** 화면에 보일 SQL 줄 — 보이기용. 파싱하지 않는다. */
  sql: string[];
  left: TableData;
  right: TableData;
  /** 잇는 조건 left.<열> = right.<열> */
  on: { left: string; right: string };
  /** SELECT 가 고르는 두 열 — 왼쪽 표 하나, 오른쪽 표 하나 */
  select: { left: string; right: string };
};

/** 열 이름을 열 번호로 푼 것. 장면이 같은 함수를 부른다. */
export type ResolvedColumns = {
  leftKey: number;
  rightKey: number;
  leftShow: number;
  rightShow: number;
};

function column(table: TableData, name: string): number {
  const i = table.columns.indexOf(name);
  if (i < 0) throw new Error(`match-on-key: 표 ${table.name} 에 열 ${name} 이 없다`);
  return i;
}

export function resolveColumns(data: MatchOnKeyFacetData): ResolvedColumns {
  return {
    leftKey: column(data.left, data.on.left),
    rightKey: column(data.right, data.on.right),
    leftShow: column(data.left, data.select.left),
    rightShow: column(data.right, data.select.right),
  };
}

function readTable(raw: unknown, side: string): TableData {
  if (typeof raw !== 'object' || raw === null) throw new Error(`match-on-key: ${side} 표가 없다`);
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string') throw new Error(`match-on-key: ${side} 표 이름이 없다`);
  if (!Array.isArray(r.columns) || !r.columns.every((c) => typeof c === 'string')) {
    throw new Error(`match-on-key: ${side} 표의 열 목록이 틀렸다`);
  }
  const columns = r.columns as string[];
  if (!Array.isArray(r.rows)) throw new Error(`match-on-key: ${side} 표의 줄 목록이 없다`);
  const rows = r.rows.map((row, i) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error(`match-on-key: ${side} 표 ${i} 번 줄의 칸 수가 열 수와 다르다`);
    }
    return row.map((cell, j) => {
      if (typeof cell !== 'string' && typeof cell !== 'number') {
        throw new Error(`match-on-key: ${side} 표 ${i} 번 줄 ${j} 번 칸을 읽을 수 없다`);
      }
      return cell;
    });
  });
  return { name: r.name, columns: [...columns], rows };
}

function readPair(raw: unknown, what: string): { left: string; right: string } {
  if (typeof raw !== 'object' || raw === null) throw new Error(`match-on-key: ${what} 가 없다`);
  const r = raw as Record<string, unknown>;
  if (typeof r.left !== 'string' || typeof r.right !== 'string') {
    throw new Error(`match-on-key: ${what} 의 left · right 가 틀렸다`);
  }
  return { left: r.left, right: r.right };
}

/** initialData 를 좁힌다. 틀리면 던진다. 장면도 이것을 부른다. */
export function readMatchOnKeyData(raw: unknown): MatchOnKeyFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('match-on-key: initialData 가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'match-on-key') throw new Error('match-on-key: type 이 틀렸다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('match-on-key: stepMs 가 틀렸다');
  if (!Array.isArray(r.sql) || !r.sql.every((s) => typeof s === 'string')) {
    throw new Error('match-on-key: sql 줄이 틀렸다');
  }
  return {
    type: 'match-on-key',
    stepMs: r.stepMs,
    sql: [...(r.sql as string[])],
    left: readTable(r.left, 'left'),
    right: readTable(r.right, 'right'),
    on: readPair(r.on, 'on'),
    select: readPair(r.select, 'select'),
  };
}

export async function matchOnKey(ctxIn: FacetContext<MatchOnKeyFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<MatchOnKeyFacetData>;
  const data = readMatchOnKeyData(ctx.data);
  const cols = resolveColumns(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const copies = data.right.rows.map(() => 0);
  let total = 0;

  // 걸음 0(두 표와 SQL)을 읽을 틈 — 첫 발신 앞에 문을 둔다.
  for (let li = 0; li < data.left.rows.length; li += 1) {
    if (!(await pause())) return;
    const leftRow = data.left.rows[li]!;
    const key = leftRow[cols.leftKey]!;

    // 안쪽 루프 — 오른쪽 표를 차례로 견준다.
    const found: number[] = [];
    for (let ri = 0; ri < data.right.rows.length; ri += 1) {
      if (ctx.cancelled) return;
      if (data.right.rows[ri]![cols.rightKey] === key) found.push(ri);
    }
    if (found.length === 0) {
      throw new Error(`match-on-key: ${data.left.name} ${li} 번 줄의 열쇠 ${key} 에 짝이 없다`);
    }
    if (found.length > 1) {
      throw new Error(`match-on-key: 열쇠 ${key} 가 ${data.right.name} 의 줄 여럿을 가리킨다`);
    }
    const ri = found[0]!;
    copies[ri] = copies[ri]! + 1;
    total += 1;

    await ctx.emit({
      type: 'match',
      payload: {
        left: li,
        right: ri,
        key: String(key),
        values: [String(leftRow[cols.leftShow]!), String(data.right.rows[ri]![cols.rightShow]!)],
        total,
        copies: copies[ri]!,
      },
    });
  }
}
