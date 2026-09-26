/**
 * shared-vs-exclusive — 공유 잠금은 겹쳐 쌓이고, 호환되지 않는 요청은 튕겨 난다.
 *
 * 규약 (사양 그대로):
 *   - 호환표 (쥔 것 → 새 요청): S → S 허락 · S → X 막힘 · X → S 막힘 · X → X 막힘
 *   - 요청은 그 줄을 쥔 **모든** 이와 호환될 때만 허락된다
 *   - 막힌 요청은 막힌 채 남는다. 놓기 · 넘겨받기 · 커밋 없음
 *   - 같은 트랜잭션이 같은 줄에 두 번 요청하지 않는다 (잠금 올리기 없음 — 오면 던진다)
 *   - 걸음: 처음(걸음 0, 장면 initial 이 세운다) · 요청마다 하나
 *
 * 이벤트 (모두 silent 아님, 요청 하나에 하나):
 *   grant  payload { txn: string; row: string; mode: 'S' | 'X' }
 *          — 요청이 허락되었다. 쥔 이 목록 끝에 붙는다
 *   block  payload { txn: string; row: string; mode: 'S' | 'X';
 *                    blockers: { txn: string; mode: 'S' | 'X' }[] }
 *          — 요청이 막혔다. blockers 는 그 줄을 쥔 이 가운데 호환되지 않는 이 (쥔 차례대로)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LockMode = 'S' | 'X';

export type LockRequest = { txn: string; row: string; mode: LockMode };

export type SharedVsExclusiveFacetData = {
  type: 'shared-vs-exclusive';
  stepMs: number;
  /** 줄 이름 — 번역하지 않는 자료 */
  rows: string[];
  /** 요청 차례. 트랜잭션 이름은 `T<번호>` */
  requests: LockRequest[];
};

/** 호환표 — 쥔 것(held) 위에 새 요청(want) 을 얹을 수 있는가 */
export function compatible(held: LockMode, want: LockMode): boolean {
  return held === 'S' && want === 'S';
}

export async function sharedVsExclusive(
  context: FacetContext<SharedVsExclusiveFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SharedVsExclusiveFacetData>;
  const { rows, requests, stepMs } = ctx.data;

  const holders = new Map<string, { txn: string; mode: LockMode }[]>();
  for (const row of rows) holders.set(row, []);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const req of requests) {
    // 걸음 0 이 두 줄을 보이는 화면이라 첫 요청 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const held = holders.get(req.row);
    if (held === undefined) throw new Error(`shared-vs-exclusive: 없는 줄 '${req.row}'`);
    if (req.mode !== 'S' && req.mode !== 'X') {
      throw new Error(`shared-vs-exclusive: 모르는 잠금 종류 '${String(req.mode)}'`);
    }
    if (held.some((h) => h.txn === req.txn)) {
      throw new Error(`shared-vs-exclusive: ${req.txn} 가 ${req.row} 를 이미 쥐었다 (잠금 올리기는 이 모형에 없다)`);
    }
    const blockers = held.filter((h) => !compatible(h.mode, req.mode)).map((h) => ({ ...h }));
    if (blockers.length === 0) {
      held.push({ txn: req.txn, mode: req.mode });
      await ctx.emit({ type: 'grant', payload: { txn: req.txn, row: req.row, mode: req.mode } });
    } else {
      await ctx.emit({
        type: 'block',
        payload: { txn: req.txn, row: req.row, mode: req.mode, blockers },
      });
    }
  }
}
