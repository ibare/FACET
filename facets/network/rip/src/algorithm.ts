/**
 * rip — 라우팅 프로토콜 넷(거리 벡터 · 스플릿 호라이즌 · 경로 벡터 · 링크 상태)을 같은 다섯 고리,
 * 같은 끊김 위에서 견준다. 손잡이 둘(method · cut)을 받는 reactive 알고리즘.
 *
 * ## 짜임
 * 한 판 = 걸음 0(시작 또는 끊긴 직후의 표) + 라운드마다 한 걸음. 한 판을 끝까지 재생한 뒤
 * `waitForInput` 으로 손잡이를 받고, 받은 값으로 다시 재생한다. 한 판의 셈은 `playRip` 이
 * 순수 함수로 먼저 끝내고(검사도 이것을 부른다), 재생은 그 결과를 걸음으로 흘린다.
 *
 * ## 규약 (사양 그대로 — 설명 글이 밝힌다)
 * - 수: 바로 붙은 망 = 1, 받으면 +1, `unreachable`(16) = 닿을 수 없음, 넘으면 16 에 멈춘다.
 * - 동기 라운드: 보내는 쪽은 모두 라운드 처음의 상태로 보낸다. 받는 쪽은 **받는 라우터 이름 차례**,
 *   그 안에서 **보낸 이 이름 차례**로 판정한다 (동률 규칙 — 이름이 앞선 쪽이 먼저).
 * - 참값 = 지금 남은 선 위에서 dest 까지 너비 우선 홉 수 + 1 (닿지 않으면 16).
 *   수가 참값과 다르면 틀린 표다. "줄 없음" 은 16 으로 친다. dest 는 늘 `1 (직접)` 이고 받아도 고치지 않는다.
 * - 거리 벡터: 줄이 있는 라우터(16 도 줄)는 라운드마다 모든 이웃에게 제 수 하나를 알린다. 셈 = min(받은 수 + 1, 16).
 *   줄이 없으면 받아 적고, 보낸 이가 지금 다음 홉이면 셈이 달라졌을 때 받고(커져도), 아니면 작을 때만 받는다.
 *   스플릿 호라이즌은 다음 홉 = 그 이웃인 줄을 그 이웃에게 보내지 않는다(보낸 수에 넣지 않는다).
 *   멈춤: 어느 표도 바뀌지 않은 라운드 — 그 라운드도 걸음이고 센다.
 * - 경로 벡터: 줄이 있는 라우터는 제 길 전체 또는 거둠(길 없음)을 모든 이웃에게 보낸다. 받는 쪽은 이웃마다
 *   마지막 것을 쥐고, 라운드 끝에 제 이름이 든 길을 버린 뒤 짧은 길(같으면 보낸 이웃 이름이 앞선 쪽)을 고른다.
 *   수 = 길의 라우터 수. 멈춤은 거리 벡터와 같다.
 * - 링크 상태: 알림 = (만든 이, 번호, 이웃 목록). 지난 라운드에 새로 받은(또는 새로 낸) 라우터가 처음 받은 곳을 뺀
 *   이웃 모두에게 보낸다. 이미 가진 (만든 이, 번호 이상) 은 버린다. 같은 라운드에 여럿이 닿으면 보낸 이 이름이 앞선
 *   쪽이 받힌다. 라운드 끝에 제가 쥔 알림들로 지도를 그려 셈한다 — 선은 두 끝의 알림이 서로를 적었을 때만.
 *   다음 홉은 가까운 이웃(같으면 이름이 앞선 쪽). 보낼 사본이 없는 라운드 **앞에서** 멈춘다.
 * - 끊김(cut ≥ 1): 같은 방식으로 처음부터 수렴한 표에서 선을 지운 직후가 걸음 0.
 *   거리 벡터는 끊긴 선 너머가 다음 홉이던 줄을 곧바로 16(다음 홉 없음) · 경로 벡터는 끊긴 선으로 받은 길을
 *   지우고 곧바로 다시 고름 · 링크 상태는 끊긴 선의 두 끝이 번호 2 알림(남은 이웃만)을 내고 곧바로 다시 셈.
 * - `roundLimit` 을 넘도록 멈추지 않으면 던진다. 모르는 이웃 · 사다리 밖 손잡이 값도 던진다.
 *
 * 이 데이터에서 판정이 갈리는 동률: 거리 벡터에서 받는 차례가 답을 바꾸는 자리(B–E 라운드 1 에서 A 가 B 의 16 을
 * 먼저 받고 곧 C 의 3 을 받는다)가 있다. 링크 상태의 "같은 라운드에 둘이 닿음" 은 받힌 사본의 보낸 이만 가른다.
 *
 * ## 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 * - `rip-start` — 걸음 0.
 *   payload `{ method: 'dv'|'dv-sh'|'pv'|'ls', cutIndex: number, cutLinks: [string, string][],
 *             table: RipRow[], wrongCount: number, totalRounds: number, motionMs: number }`
 * - `rip-round` — 라운드 한 걸음.
 *   payload `{ method, round: number (1 부터), adverts: RipAdvert[], heldBack: { from, to }[],
 *             table: RipRow[], wrongCount: number, sent: number, taken: number, dropped: number,
 *             last: boolean, stop: 'unchanged' | 'no-copies' | null, motionMs: number }`
 *   RipRow    `{ router, metric: number | null (null = 줄 없음), nextHop: string | null, path: string[] | null,
 *               lsas: { origin, seq }[] | null, wrong: boolean, direct: boolean, unreachable: boolean }`
 *   RipAdvert `{ from, to, kind: 'metric'|'path'|'withdraw'|'lsa', metric: number | null, path: string[] | null,
 *               origin: string | null, seq: number | null, fate: 'taken'|'ignored'|'dropped' }`
 *
 * ## phase 어휘
 * 없다 — IR 을 두지 않아 코드 패널이 없다 (irs.ts 머리말).
 *
 * ## 계기 (판이 바뀌면 0 으로 되돌리고 걸음마다 차이만)
 * - `rounds` — 라운드 걸음마다 1
 * - `adverts` — 그 라운드에 보낸 알림(사본) 수
 * - `wrong-rounds` — 그 라운드가 끝났을 때 틀린 라우터가 하나라도 있으면 1 (걸음 0 은 세지 않는다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RipMethod = 'dv' | 'dv-sh' | 'pv' | 'ls';

export type RipData = {
  type: 'rip';
  stepMs: number;
  motionMs: number;
  routers: string[];
  links: [string, string][];
  dest: string;
  network: string;
  unreachable: number;
  methods: RipMethod[];
  cutLadder: [string, string][][];
  defaultMethod: number;
  defaultCut: number;
  roundLimit: number;
};

export type RipLsa = { origin: string; seq: number };

export type RipRow = {
  router: string;
  metric: number | null;
  nextHop: string | null;
  path: string[] | null;
  lsas: RipLsa[] | null;
  wrong: boolean;
  direct: boolean;
  /** 수가 닿을 수 없음(16) 에 닿았다 */
  unreachable: boolean;
};

export type RipFate = 'taken' | 'ignored' | 'dropped';

export type RipAdvert = {
  from: string;
  to: string;
  kind: 'metric' | 'path' | 'withdraw' | 'lsa';
  metric: number | null;
  path: string[] | null;
  origin: string | null;
  seq: number | null;
  fate: RipFate;
};

export type RipRound = {
  round: number;
  adverts: RipAdvert[];
  heldBack: { from: string; to: string }[];
  table: RipRow[];
  wrongCount: number;
  sent: number;
  taken: number;
  dropped: number;
  stop: 'unchanged' | 'no-copies' | null;
};

export type RipPlay = {
  method: RipMethod;
  cutIndex: number;
  cutLinks: [string, string][];
  start: RipRow[];
  startWrong: number;
  rounds: RipRound[];
  truth: Record<string, number>;
  totals: { rounds: number; adverts: number; wrongRounds: number };
};

/* ------------------------------------------------------------------ 공통 셈 */

/** 던지는 조회 — 모르는 열쇠를 소리 없이 넘기지 않는다 */
function must<K, V>(m: Map<K, V>, k: K, what: string): V {
  if (!m.has(k)) throw new Error(`rip: 모르는 ${what} ${String(k)}`);
  return m.get(k) as V;
}

/** 입구 확인 — 라우터 이름이 겹치지 않고, 목적지와 선의 두 끝이 모두 라우터 목록에 있다 */
function validate(data: RipData): void {
  const known = new Set(data.routers);
  if (known.size !== data.routers.length) throw new Error('rip: 라우터 이름이 겹친다');
  if (!known.has(data.dest)) throw new Error(`rip: 목적지 ${data.dest} 가 라우터 목록에 없다`);
  for (const [a, b] of [...data.links, ...data.cutLadder.flat()]) {
    if (!known.has(a) || !known.has(b)) throw new Error(`rip: 선 ${a}–${b} 의 끝이 라우터 목록에 없다`);
  }
}

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function liveLinks(data: RipData, cut: [string, string][]): [string, string][] {
  const gone = new Set(cut.map(([a, b]) => linkKey(a, b)));
  for (const [a, b] of cut) {
    if (!data.links.some(([x, y]) => linkKey(x, y) === linkKey(a, b))) {
      throw new Error(`rip: 끊는 선 ${a}–${b} 이 그래프에 없다`);
    }
  }
  return data.links.filter(([a, b]) => !gone.has(linkKey(a, b)));
}

function neighbours(links: [string, string][], r: string): string[] {
  const out: string[] = [];
  for (const [a, b] of links) {
    if (a === r) out.push(b);
    else if (b === r) out.push(a);
  }
  return out.sort();
}

function truthOf(data: RipData, links: [string, string][]): Record<string, number> {
  const dist = new Map<string, number>([[data.dest, 1]]);
  const queue = [data.dest];
  while (queue.length > 0) {
    const x = queue.shift() as string;
    const dx = dist.get(x);
    if (dx === undefined) throw new Error('rip: 너비 우선 셈이 거리를 잃었다');
    for (const y of neighbours(links, x)) {
      if (!dist.has(y)) {
        dist.set(y, dx + 1);
        queue.push(y);
      }
    }
  }
  const out: Record<string, number> = {};
  for (const r of data.routers) {
    const d = dist.get(r);
    out[r] = d === undefined ? data.unreachable : Math.min(d, data.unreachable);
  }
  return out;
}

type Row = { metric: number; nextHop: string | null } | null;

function cloneRows(rows: Map<string, Row>): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const [k, v] of rows) out.set(k, v === null ? null : { ...v });
  return out;
}

function rowOf(rows: Map<string, Row>, r: string): Row {
  if (!rows.has(r)) throw new Error(`rip: 모르는 라우터 ${r}`);
  return rows.get(r) as Row;
}

/* ------------------------------------------------------------ 거리 벡터 */

type DvResult = { sent: number; changed: boolean; adverts: RipAdvert[]; heldBack: { from: string; to: string }[] };

function dvRound(data: RipData, links: [string, string][], table: Map<string, Row>, split: boolean): DvResult {
  const snap = cloneRows(table);
  const adverts: RipAdvert[] = [];
  const heldBack: { from: string; to: string }[] = [];
  let sent = 0;
  let changed = false;
  for (const r of data.routers) {
    for (const nb of neighbours(links, r)) {
      const s = rowOf(snap, nb);
      if (s === null) continue; // 줄이 없는 라우터는 알리지 않는다
      if (split && s.nextHop === r) {
        heldBack.push({ from: nb, to: r });
        continue;
      }
      sent += 1;
      const advert: RipAdvert = {
        from: nb,
        to: r,
        kind: 'metric',
        metric: s.metric,
        path: null,
        origin: null,
        seq: null,
        fate: 'ignored',
      };
      adverts.push(advert);
      if (r === data.dest) continue; // dest 는 받아도 고치지 않는다
      const cand = Math.min(s.metric + 1, data.unreachable);
      const cur = rowOf(table, r);
      if (cur === null) {
        if (cand >= data.unreachable) throw new Error('rip: 줄 없는 라우터가 16 을 받았다');
        table.set(r, { metric: cand, nextHop: nb });
        advert.fate = 'taken';
        changed = true;
      } else if (cur.nextHop === nb) {
        if (cand !== cur.metric) {
          table.set(r, { metric: cand, nextHop: nb }); // 다음 홉이 알린 수는 커져도 받는다
          advert.fate = 'taken';
          changed = true;
        }
      } else if (cand < cur.metric) {
        table.set(r, { metric: cand, nextHop: nb });
        advert.fate = 'taken';
        changed = true;
      }
    }
  }
  return { sent, changed, adverts, heldBack };
}

function dvStart(data: RipData): Map<string, Row> {
  const t = new Map<string, Row>();
  for (const r of data.routers) t.set(r, r === data.dest ? { metric: 1, nextHop: null } : null);
  return t;
}

/* ------------------------------------------------------------ 경로 벡터 */

type PvState = {
  rib: Map<string, Map<string, string[] | null>>;
  best: Map<string, string[] | null>;
  hasRow: Map<string, boolean>;
};

function pvBest(data: RipData, r: string, rib: Map<string, Map<string, string[] | null>>): string[] | null {
  if (r === data.dest) return [data.dest];
  const got = rib.get(r);
  if (got === undefined) throw new Error(`rip: 모르는 라우터 ${r}`);
  let pick: { len: number; nb: string; path: string[] } | null = null;
  for (const [nb, path] of got) {
    if (path === null || path.includes(r)) continue; // 거둠 · 제 이름이 든 길은 버린다
    if (pick === null || path.length < pick.len || (path.length === pick.len && nb < pick.nb)) {
      pick = { len: path.length, nb, path };
    }
  }
  return pick === null ? null : [r, ...pick.path];
}

function samePath(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function pvStart(data: RipData): PvState {
  const rib = new Map<string, Map<string, string[] | null>>();
  const best = new Map<string, string[] | null>();
  const hasRow = new Map<string, boolean>();
  for (const r of data.routers) {
    rib.set(r, new Map());
    best.set(r, r === data.dest ? [data.dest] : null);
    hasRow.set(r, r === data.dest);
  }
  return { rib, best, hasRow };
}

function pvRound(data: RipData, links: [string, string][], st: PvState): DvResult {
  const snapBest = new Map(st.best);
  const snapRow = new Map(st.hasRow);
  const adverts: RipAdvert[] = [];
  let sent = 0;
  for (const r of data.routers) {
    for (const nb of neighbours(links, r)) {
      if (!must(snapRow, nb, '라우터')) continue;
      sent += 1;
      const path = must(snapBest, nb, '라우터');
      adverts.push({
        from: nb,
        to: r,
        kind: path === null ? 'withdraw' : 'path',
        metric: null,
        path: path === null ? null : [...path],
        origin: null,
        seq: null,
        fate: 'ignored',
      });
      if (r === data.dest) continue;
      const rib = st.rib.get(r);
      if (rib === undefined) throw new Error(`rip: 모르는 라우터 ${r}`);
      rib.set(nb, path === null ? null : [...path]);
    }
  }
  let changed = false;
  const before = new Map(st.best);
  for (const r of data.routers) {
    const b = pvBest(data, r, st.rib);
    if (!samePath(b, must(st.best, r, '라우터'))) {
      changed = true;
      st.best.set(r, b);
    }
    if (b !== null) st.hasRow.set(r, true);
  }
  for (const a of adverts) {
    if (a.to === data.dest) continue;
    if (a.path !== null && a.path.includes(a.to)) {
      a.fate = 'dropped';
      continue;
    }
    const old = must(before, a.to, '라우터');
    const now = must(st.best, a.to, '라우터');
    if (samePath(old, now)) continue;
    const oldHop = old !== null && old.length > 1 ? old[1] : null;
    const newHop = now !== null && now.length > 1 ? now[1] : null;
    if ((a.kind === 'path' && newHop === a.from) || (a.kind === 'withdraw' && oldHop === a.from)) {
      a.fate = 'taken';
    }
  }
  return { sent, changed, adverts, heldBack: [] };
}

function pvTable(data: RipData, st: PvState): Map<string, Row> {
  const t = new Map<string, Row>();
  for (const r of data.routers) {
    const b = must(st.best, r, '라우터');
    if (!must(st.hasRow, r, '라우터')) t.set(r, null);
    else if (b === null) t.set(r, { metric: data.unreachable, nextHop: null });
    else t.set(r, { metric: b.length, nextHop: b.length > 1 ? b[1] : null });
  }
  return t;
}

/* ------------------------------------------------------------ 링크 상태 */

type Lsa = { seq: number; nbrs: string[] };
type Dbs = Map<string, Map<string, Lsa>>;

function lsTable(data: RipData, r: string, db: Map<string, Lsa>): Row {
  if (r === data.dest) return { metric: 1, nextHop: null };
  const adj = (x: string): string[] => {
    const own = db.get(x);
    if (own === undefined) return [];
    return own.nbrs.filter((y) => db.get(y)?.nbrs.includes(x) === true).sort();
  };
  const dist = new Map<string, number>([[data.dest, 0]]);
  const queue = [data.dest];
  while (queue.length > 0) {
    const x = queue.shift() as string;
    const dx = dist.get(x) as number;
    for (const y of adj(x)) {
      if (!dist.has(y)) {
        dist.set(y, dx + 1);
        queue.push(y);
      }
    }
  }
  const dr = dist.get(r);
  if (dr === undefined) return { metric: data.unreachable, nextHop: null };
  const hops = adj(r).filter((y) => dist.get(y) === dr - 1);
  if (hops.length === 0) throw new Error(`rip: ${r} 의 지도에서 다음 홉을 찾지 못했다`);
  return { metric: Math.min(dr + 1, data.unreachable), nextHop: hops[0] };
}

function lsTables(data: RipData, dbs: Dbs): Map<string, Row> {
  const t = new Map<string, Row>();
  for (const r of data.routers) t.set(r, lsTable(data, r, dbOf(dbs, r)));
  return t;
}

function dbOf(dbs: Dbs, r: string): Map<string, Lsa> {
  const db = dbs.get(r);
  if (db === undefined) throw new Error(`rip: 모르는 라우터 ${r}`);
  return db;
}

type Pending = Map<string, { origin: string; seq: number; from: string | null }[]>;

/* --------------------------------------------------------------- 한 판 */

function rowsToView(
  data: RipData,
  table: Map<string, Row>,
  truth: Record<string, number>,
  extra: { paths?: Map<string, string[] | null>; dbs?: Dbs },
): RipRow[] {
  return data.routers.map((r) => {
    const row = rowOf(table, r);
    const metric = row === null ? null : row.metric;
    const tr = truth[r];
    if (tr === undefined) throw new Error(`rip: ${r} 의 참값이 없다`);
    let lsas: RipLsa[] | null = null;
    if (extra.dbs !== undefined) {
      lsas = [...dbOf(extra.dbs, r).entries()]
        .map(([origin, l]) => ({ origin, seq: l.seq }))
        .sort((a, b) => (a.origin < b.origin ? -1 : 1));
    }
    let path: string[] | null = null;
    if (extra.paths !== undefined) {
      const p = must(extra.paths, r, '라우터');
      path = p === null ? null : [...p];
    }
    return {
      router: r,
      metric,
      nextHop: row === null ? null : row.nextHop,
      path,
      lsas,
      wrong: (metric === null ? data.unreachable : metric) !== tr,
      direct: r === data.dest,
      unreachable: metric !== null && metric >= data.unreachable,
    };
  });
}

function wrongCount(rows: RipRow[]): number {
  return rows.filter((x) => x.wrong).length;
}

function finishRound(round: Omit<RipRound, 'taken' | 'dropped'>): RipRound {
  return {
    ...round,
    taken: round.adverts.filter((a) => a.fate === 'taken').length,
    dropped: round.adverts.filter((a) => a.fate === 'dropped').length,
  };
}

/** 한 판을 끝까지 셈한다 (순수). 재생과 검사가 같이 쓴다. */
export function playRip(data: RipData, methodIndex: number, cutIndex: number): RipPlay {
  validate(data);
  const method = data.methods[methodIndex];
  if (method === undefined) throw new Error(`rip: 사다리 밖 방식 ${methodIndex}`);
  const cut = data.cutLadder[cutIndex];
  if (cut === undefined) throw new Error(`rip: 사다리 밖 끊는 선 ${cutIndex}`);
  const links = liveLinks(data, cut);
  const truth = truthOf(data, links);
  const cutSet = new Set(cut.map(([a, b]) => linkKey(a, b)));
  const rounds: RipRound[] = [];
  let start: RipRow[];

  if (method === 'dv' || method === 'dv-sh') {
    const split = method === 'dv-sh';
    const t = dvStart(data);
    if (cut.length > 0) {
      for (let i = 0; ; i += 1) {
        if (i >= data.roundLimit) throw new Error('rip: 처음 수렴이 라운드 상한을 넘었다');
        if (!dvRound(data, data.links, t, split).changed) break;
      }
      for (const r of data.routers) {
        const row = rowOf(t, r);
        if (row !== null && row.nextHop !== null && cutSet.has(linkKey(r, row.nextHop))) {
          t.set(r, { metric: data.unreachable, nextHop: null }); // 끊긴 선 너머는 곧바로 16
        }
      }
    }
    start = rowsToView(data, t, truth, {});
    for (let i = 1; ; i += 1) {
      if (i > data.roundLimit) throw new Error('rip: 라운드 상한을 넘도록 멈추지 않았다');
      const res = dvRound(data, links, t, split);
      const rows = rowsToView(data, t, truth, {});
      rounds.push(
        finishRound({
          round: i,
          adverts: res.adverts,
          heldBack: res.heldBack,
          table: rows,
          wrongCount: wrongCount(rows),
          sent: res.sent,
          stop: res.changed ? null : 'unchanged',
        }),
      );
      if (!res.changed) break;
    }
  } else if (method === 'pv') {
    const st = pvStart(data);
    if (cut.length > 0) {
      for (let i = 0; ; i += 1) {
        if (i >= data.roundLimit) throw new Error('rip: 처음 수렴이 라운드 상한을 넘었다');
        if (!pvRound(data, data.links, st).changed) break;
      }
      for (const [x, y] of cut) {
        must(st.rib, x, '라우터').delete(y);
        must(st.rib, y, '라우터').delete(x);
      }
      for (const r of data.routers) st.best.set(r, pvBest(data, r, st.rib)); // 곧바로 다시 고른다
    }
    start = rowsToView(data, pvTable(data, st), truth, { paths: st.best });
    for (let i = 1; ; i += 1) {
      if (i > data.roundLimit) throw new Error('rip: 라운드 상한을 넘도록 멈추지 않았다');
      const res = pvRound(data, links, st);
      const rows = rowsToView(data, pvTable(data, st), truth, { paths: st.best });
      rounds.push(
        finishRound({
          round: i,
          adverts: res.adverts,
          heldBack: [],
          table: rows,
          wrongCount: wrongCount(rows),
          sent: res.sent,
          stop: res.changed ? null : 'unchanged',
        }),
      );
      if (!res.changed) break;
    }
  } else if (method === 'ls') {
    const dbs: Dbs = new Map();
    const lsaOf = (ls: [string, string][], r: string, seq: number): Lsa => ({ seq, nbrs: neighbours(ls, r) });
    let origin: string[];
    if (cut.length === 0) {
      for (const r of data.routers) dbs.set(r, new Map([[r, lsaOf(data.links, r, 1)]]));
      origin = [...data.routers];
    } else {
      for (const r of data.routers) {
        dbs.set(r, new Map(data.routers.map((o) => [o, lsaOf(data.links, o, 1)] as [string, Lsa])));
      }
      origin = [...new Set(cut.flat())].sort();
      for (const o of origin) {
        const own = dbOf(dbs, o).get(o);
        if (own === undefined) throw new Error(`rip: ${o} 가 제 알림을 쥐지 않았다`);
        dbOf(dbs, o).set(o, lsaOf(links, o, own.seq + 1)); // 두 끝이 새 알림을 낸다
      }
    }
    start = rowsToView(data, lsTables(data, dbs), truth, { dbs });
    let pending: Pending = new Map(data.routers.map((r) => [r, []]));
    for (const o of origin) {
      const own = dbOf(dbs, o).get(o) as Lsa;
      must(pending, o, '라우터').push({ origin: o, seq: own.seq, from: null });
    }
    for (let i = 1; ; i += 1) {
      if (i > data.roundLimit + 1) throw new Error('rip: 번짐이 라운드 상한을 넘도록 끝나지 않았다');
      // (받는 이, 만든 이, 번호) 마다 닿은 보낸 이들
      const arrivals = new Map<string, { to: string; origin: string; seq: number; senders: string[] }>();
      const adverts: RipAdvert[] = [];
      for (const s of data.routers) {
        for (const p of must(pending, s, '라우터')) {
          for (const nb of neighbours(links, s)) {
            if (nb === p.from) continue;
            const key = `${nb}|${p.origin}|${p.seq}`;
            const slot = arrivals.get(key) ?? { to: nb, origin: p.origin, seq: p.seq, senders: [] };
            slot.senders.push(s);
            arrivals.set(key, slot);
            adverts.push({
              from: s,
              to: nb,
              kind: 'lsa',
              metric: null,
              path: null,
              origin: p.origin,
              seq: p.seq,
              fate: 'dropped',
            });
          }
        }
      }
      if (adverts.length === 0) {
        const lastRound = rounds[rounds.length - 1];
        if (lastRound === undefined) throw new Error('rip: 링크 상태 판이 한 라운드도 보내지 않았다');
        lastRound.stop = 'no-copies'; // 빈 라운드 앞에서 멈춘다
        break;
      }
      if (i > data.roundLimit) throw new Error('rip: 번짐이 라운드 상한을 넘도록 끝나지 않았다');
      const next: Pending = new Map(data.routers.map((r) => [r, []]));
      const slots = [...arrivals.values()].sort((a, b) =>
        a.to !== b.to ? (a.to < b.to ? -1 : 1) : a.origin !== b.origin ? (a.origin < b.origin ? -1 : 1) : a.seq - b.seq,
      );
      for (const slot of slots) {
        const db = dbOf(dbs, slot.to);
        const have = db.get(slot.origin);
        if (have !== undefined && have.seq >= slot.seq) continue;
        const first = [...slot.senders].sort()[0] as string;
        const copy = dbOf(dbs, first).get(slot.origin);
        if (copy === undefined) throw new Error(`rip: ${first} 가 보낸 알림을 쥐지 않았다`);
        db.set(slot.origin, { seq: copy.seq, nbrs: [...copy.nbrs] });
        must(next, slot.to, '라우터').push({ origin: slot.origin, seq: slot.seq, from: first });
        const taken = adverts.find(
          (a) => a.from === first && a.to === slot.to && a.origin === slot.origin && a.seq === slot.seq,
        );
        if (taken === undefined) throw new Error('rip: 받힌 사본을 찾지 못했다');
        taken.fate = 'taken';
      }
      pending = next;
      const rows = rowsToView(data, lsTables(data, dbs), truth, { dbs });
      rounds.push(
        finishRound({
          round: i,
          adverts,
          heldBack: [],
          table: rows,
          wrongCount: wrongCount(rows),
          sent: adverts.length,
          stop: null,
        }),
      );
    }
  } else {
    throw new Error(`rip: 모르는 방식 ${String(method)}`);
  }

  // 한 번 다 맞은 뒤 다시 틀리지 않는지 — 사양의 wrong-rounds 는 이것을 전제한다
  const firstOk = rounds.findIndex((r) => r.wrongCount === 0);
  const wrongRounds = rounds.filter((r) => r.wrongCount > 0).length;
  if (firstOk < 0 || wrongRounds !== firstOk) throw new Error('rip: 맞은 뒤 다시 틀린 표가 생겼다');
  return {
    method,
    cutIndex,
    cutLinks: cut.map(([a, b]) => [a, b] as [string, string]),
    start,
    startWrong: wrongCount(start),
    rounds,
    truth,
    totals: {
      rounds: rounds.length,
      adverts: rounds.reduce((s, r) => s + r.sent, 0),
      wrongRounds,
    },
  };
}

/* --------------------------------------------------------------- 재생 */

export async function ripAlgorithm(ctx: FacetContext<RipData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RipData>;
  const data = ctx.data;
  let methodIndex = data.defaultMethod;
  let cutIndex = data.defaultCut;

  // 지금 보이는 계기 값을 들고 차이만 보낸다 (처음 한 번은 0 이어도 보낸다)
  const shown = new Map<string, number>();
  const showMetric = (name: 'rounds' | 'adverts' | 'wrong-rounds', value: number): void => {
    const before = shown.get(name);
    if (before === undefined) ctx.metric(name, value);
    else if (before !== value) ctx.metric(name, value - before);
    shown.set(name, value);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const play = playRip(data, methodIndex, cutIndex);
      showMetric('rounds', 0);
      showMetric('adverts', 0);
      showMetric('wrong-rounds', 0);
      await ctx.emit({
        type: 'rip-start',
        payload: {
          method: play.method,
          cutIndex: play.cutIndex,
          cutLinks: play.cutLinks,
          table: play.start,
          wrongCount: play.startWrong,
          totalRounds: play.totals.rounds,
          motionMs: data.motionMs,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      let adverts = 0;
      let wrongRounds = 0;
      for (const rd of play.rounds) {
        if (ctx.cancelled) return;
        adverts += rd.sent;
        if (rd.wrongCount > 0) wrongRounds += 1;
        showMetric('rounds', rd.round);
        showMetric('adverts', adverts);
        showMetric('wrong-rounds', wrongRounds);
        await ctx.emit({
          type: 'rip-round',
          payload: {
            method: play.method,
            round: rd.round,
            adverts: rd.adverts,
            heldBack: rd.heldBack,
            table: rd.table,
            wrongCount: rd.wrongCount,
            sent: rd.sent,
            taken: rd.taken,
            dropped: rd.dropped,
            last: rd.round === play.rounds.length,
            stop: rd.stop,
            motionMs: data.motionMs,
          },
        });
        if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;
      }

      // 한 판이 끝났다 — 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'method' && input.type !== 'cut') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'method') {
          if (!Number.isInteger(value) || value < 0 || value >= data.methods.length) {
            throw new Error(`rip: 사다리 밖 방식 ${value}`);
          }
          methodIndex = value;
        } else {
          if (!Number.isInteger(value) || value < 0 || value >= data.cutLadder.length) {
            throw new Error(`rip: 사다리 밖 끊는 선 ${value}`);
          }
          cutIndex = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
