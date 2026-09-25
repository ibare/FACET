/**
 * link-state-flood — 라우터 하나가 쓴 링크 상태 알림(LSA)이 내용 그대로 망 전체로 베껴 번진다.
 *
 * 모형 (줄인 규약 — 설명 글이 밝힌다):
 *   - 동기 라운드. 지난 라운드에 **새로** 받은 라우터(라운드 1 은 만든 이)가 이번 라운드에 사본을 보낸다.
 *     보내는 쪽은 모두 라운드 처음의 상태로 보낸다.
 *   - 보내는 곳 = 제 이웃 가운데 처음 받은 곳을 뺀 전부 (만든 이는 이웃 전부).
 *   - 받는 쪽은 같은 (만든 이, 번호) 를 이미 가졌으면 버린다 — 버린 사본은 더 가지 않는다.
 *     같은 라운드에 한 라우터로 둘이 닿으면 보낸 이 이름이 앞선 쪽이 먼저 닿은 것으로 친다.
 *   - 보내는 라우터가 하나도 없는 라운드 앞에서 멈춘다.
 *   - 사본은 전달되는 동안 한 글자도 바뀌지 않는다 (받은 이가 고쳐 쓰지 않는다).
 *   - 받은 확인(ack) · 나이(age) · 주기 재전송은 줄였다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   - 'flood-round'  payload {
 *        round: number;                       // 1 부터
 *        sends: {
 *          from: string; to: string;
 *          fresh: boolean;                    // 참 = 처음 받아 둔 사본, 거짓 = 이미 가져 버린 사본
 *          copy: { origin: string; seq: number; entries: { to: string; cost: number }[] };
 *        }[];                                 // 받는 이 이름 → 보낸 이 이름 차례 (받는 쪽 판정 차례)
 *      }
 *   - 'flood-done'   payload {
 *        rounds: number;                      // 마지막 라운드 번호
 *        sent: number; dropped: number;       // 보낸 사본 · 버린 사본 합
 *        same: number;                        // 만든 이의 알림과 글자까지 같은 사본을 쥔 라우터 수 (만든 이 포함)
 *        total: number;                       // 라우터 수
 *      }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (만든 이가 알림을 쥔 망).
 * 셈할 수 없는 상태 — 없는 라우터를 잇는 선 · 제 자신과의 선 · 겹친 선 · 끝나지 않는 라운드 ·
 * 끝내 받지 못한 라우터 · 다른 알림이 섞인 사본 — 는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LsaEntry = { to: string; cost: number };
export type Lsa = { origin: string; seq: number; entries: LsaEntry[] };

export type LinkStateFloodFacetData = {
  type: 'link-state-flood';
  stepMs: number;
  routers: string[];
  links: [string, string][];
  lsa: Lsa;
};

export type FloodSend = { from: string; to: string; fresh: boolean; copy: Lsa };

function byName(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 사본을 뜬다 — 전달은 이 함수 하나로만 한다. 내용은 건드리지 않는다. */
export function copyLsa(lsa: Lsa): Lsa {
  return {
    origin: lsa.origin,
    seq: lsa.seq,
    entries: lsa.entries.map((e) => ({ to: e.to, cost: e.cost })),
  };
}

function sameLsa(a: Lsa, b: Lsa): boolean {
  if (a.origin !== b.origin || a.seq !== b.seq) return false;
  if (a.entries.length !== b.entries.length) return false;
  return a.entries.every((e, i) => {
    const o = b.entries[i];
    return o !== undefined && o.to === e.to && o.cost === e.cost;
  });
}

/** 선 목록에서 이웃표를 만든다. 이웃은 이름 차례. */
export function neighborsOf(routers: readonly string[], links: readonly (readonly [string, string])[]): Map<string, string[]> {
  const nbr = new Map<string, string[]>();
  for (const r of routers) {
    if (nbr.has(r)) throw new Error(`link-state-flood: 라우터 이름이 겹친다 — ${r}`);
    nbr.set(r, []);
  }
  const seen = new Set<string>();
  for (const [a, b] of links) {
    const na = nbr.get(a);
    const nb = nbr.get(b);
    if (na === undefined || nb === undefined) throw new Error(`link-state-flood: 없는 라우터를 잇는 선 — ${a}–${b}`);
    if (a === b) throw new Error(`link-state-flood: 제 자신과 이은 선 — ${a}`);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) throw new Error(`link-state-flood: 겹친 선 — ${a}–${b}`);
    seen.add(key);
    na.push(b);
    nb.push(a);
  }
  for (const list of nbr.values()) list.sort(byName);
  return nbr;
}

type Held = { from: string | null; copy: Lsa };

function heldOf(have: Map<string, Held>, router: string): Held {
  const h = have.get(router);
  if (h === undefined) throw new Error(`link-state-flood: 사본이 없는 라우터가 보내려 한다 — ${router}`);
  return h;
}

export async function linkStateFlood(context: FacetContext<LinkStateFloodFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<LinkStateFloodFacetData>;
  const { routers, links, lsa, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const nbr = neighborsOf(routers, links);
  if (!nbr.has(lsa.origin)) throw new Error(`link-state-flood: 알림을 만든 이가 망에 없다 — ${lsa.origin}`);

  const original = copyLsa(lsa);
  const have = new Map<string, Held>([[lsa.origin, { from: null, copy: copyLsa(lsa) }]]);
  let senders: string[] = [lsa.origin];
  let round = 0;
  let sent = 0;
  let dropped = 0;

  // 걸음 0 은 이미 읽을 것이 있는 화면(알림을 쥔 만든 이)이라 첫 발신 앞에도 문을 둔다.
  while (senders.length > 0) {
    if (!(await pause())) return;
    round += 1;
    if (round > routers.length) throw new Error(`link-state-flood: 라운드 ${round} 에도 끝나지 않는다`);

    // 보내기 — 라운드 처음의 상태로. 사본은 보내는 순간 뜬다.
    const out: { from: string; to: string; copy: Lsa }[] = [];
    for (const s of [...senders].sort(byName)) {
      const held = heldOf(have, s);
      const list = nbr.get(s);
      if (list === undefined) throw new Error(`link-state-flood: 이웃표에 없는 라우터 — ${s}`);
      for (const r of list) {
        if (r === held.from) continue; // 처음 받은 곳으로는 되돌려 보내지 않는다
        out.push({ from: s, to: r, copy: copyLsa(held.copy) });
      }
    }

    // 받기 — 받는 이 이름, 그다음 보낸 이 이름 차례로 판정한다.
    out.sort((x, y) => byName(x.to, y.to) || byName(x.from, y.from));
    const sends: FloodSend[] = [];
    const fresh: string[] = [];
    for (const p of out) {
      sent += 1;
      const mine = have.get(p.to);
      if (mine !== undefined) {
        if (mine.copy.origin !== p.copy.origin || mine.copy.seq !== p.copy.seq) {
          throw new Error(`link-state-flood: ${p.to} 에 다른 알림이 섞였다`);
        }
        dropped += 1;
        sends.push({ from: p.from, to: p.to, fresh: false, copy: p.copy });
      } else {
        have.set(p.to, { from: p.from, copy: p.copy });
        fresh.push(p.to);
        sends.push({ from: p.from, to: p.to, fresh: true, copy: p.copy });
      }
    }

    await ctx.emit({ type: 'flood-round', payload: { round, sends } });
    senders = fresh;
  }

  const missing = routers.filter((r) => !have.has(r));
  if (missing.length > 0) throw new Error(`link-state-flood: 끝내 받지 못한 라우터 — ${missing.join(', ')}`);
  const same = routers.filter((r) => sameLsa(heldOf(have, r).copy, original)).length;

  if (!(await pause())) return;
  await ctx.emit({
    type: 'flood-done',
    payload: { rounds: round, sent, dropped, same, total: routers.length },
  });
}
