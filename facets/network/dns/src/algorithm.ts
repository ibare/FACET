/**
 * DNS 위임과 캐시의 TTL — 리졸버 하나가 10 초마다 같은 이름을 묻는 한 판(0..300 초)을 걷는다.
 *
 * 판 시작에 서버 표를 조각 delegate-down-the-tree 규약대로 **한 번 걸어**(이름 끝과 맞는 가장 긴 넘김)
 * 층 수와 맡은 서버를 셈한다. 그다음 질문마다 조각 cache-ttl 과 같은 판정을 한다.
 *
 *   캐시가 비었거나 `지금 ≥ 만료` 면 놓침 — 원본에 물어 그 시각의 원본 주소를 받고 만료 = 지금 + TTL.
 *   첫 놓침은 루트부터 층 수만큼 질의, 뒤 놓침은 넘김(NS)을 판 내내 들고 있어 맡은 서버 하나(질의 1).
 *   들고 있으면(`지금 < 만료`) 적중. 적중인데 들고 있는 답 ≠ 그 시각의 원본이면 옛 답.
 *
 * 원본 바뀜은 리졸버에 알려지지 않는다. 묻는 데 드는 시간은 0. 동률 규칙은 필요 없다 — 질문 시각이
 * 모두 다르고 판정이 정수 비교 하나다. 바뀜 시각 125 는 질문 시각(10 의 배수)과 겹치지 않는다.
 *
 * ## 걸음 (판 하나 — 손잡이 값과 무관하게 8 걸음)
 *   걸음 0  `round`  — 나무 · 빈 캐시 · 판정 없는 질문 눈금. 계기 셋을 0 으로. 코드 패널 켜짐 없음
 *   걸음 1  `window` — 첫 질문(0 초) 하나
 *   걸음 2… `window` — 창 (lo, hi] 반열린 구간, 폭 windowSec. 끝 창의 hi 는 마지막 질문 시각
 *
 * ## 이벤트
 *   round   { ttl: number, ttlLadder: number[], name: string, playEndSec: number, questionCount: number,
 *             askEverySec: number, questionSecs: number[],
 *             changeAtSec: number, answerBefore: string, answerAfter: string, layers: number,
 *             path: { name: string, address: string, zone: string }[] }      (zone 은 이 서버로 넘긴 자리,
 *                                                                              루트는 '')
 *   window  { step: number, loSec: number, hiSec: number, last: boolean,
 *             questions: { sec: number, kind: 'walk'|'owner'|'hit'|'stale', answer: string,
 *                          expirySec: number, missOrdinal: number, queries: number }[],
 *                              (missOrdinal 은 판 안에서 몇째 놓침인가 — 0 부터, 적중이면 -1 ·
 *                               queries 는 그 질문이 서버에 보낸 질의 수)
 *             hits: number, misses: number, stale: number,             (이 창 안의 수)
 *             missesSoFar: number,                                      (판 시작부터 이 창까지의 놓침)
 *             change: null | { atSec: number, before: string, after: string, heldAddress: string | null,
 *                              heldUntilSec: number, heldSeconds: number } }
 *                              (heldUntilSec = 바뀜 때 들고 있던 답의 만료, 판 끝에서 자름 ·
 *                               heldSeconds = heldUntilSec − atSec — 옛 답을 쥔 초)
 *   phase   { phase: string | null }  silent — null 은 판 시작에 코드 패널을 끈다
 *
 * ## phase 어휘 (irs.ts 와 같다) — 걸음 경계마다 그 창에서 지나간 마지막 질문의 줄
 *   walk-tree · ask-owner · cache-hit · stale-answer
 *
 * ## 계기 — 판 시작에 0 으로(차이로), 걸음마다 그 창까지의 누적으로
 *   server-queries · cache-hits · stale-answers
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DnsDelegation = { zone: string; to: string; toAddress: string };
/** address 가 null 이면 원본 레코드 — 답은 answerBefore, changeAtSec 부터 answerAfter. */
export type DnsRecord = { name: string; address: string | null };
export type DnsServer = {
  name: string;
  address: string;
  delegations: DnsDelegation[];
  records: DnsRecord[];
};

export type DnsData = {
  type: 'dns';
  stepMs: number;
  name: string;
  servers: DnsServer[];
  rootServer: string;
  answerBefore: string;
  answerAfter: string;
  changeAtSec: number;
  askEverySec: number;
  questionCount: number;
  windowSec: number;
  ttlLadder: number[];
  ttl: number;
};

export type DnsHop = { name: string; address: string; zone: string };
export type DnsKind = 'walk' | 'owner' | 'hit' | 'stale';
export type DnsQuestion = {
  sec: number;
  kind: DnsKind;
  answer: string;
  expirySec: number;
  missOrdinal: number;
  queries: number;
};
export type DnsChange = {
  atSec: number;
  before: string;
  after: string;
  heldAddress: string | null;
  heldUntilSec: number;
  heldSeconds: number;
};
export type DnsWindow = {
  step: number;
  loSec: number;
  hiSec: number;
  last: boolean;
  questions: DnsQuestion[];
  hits: number;
  misses: number;
  stale: number;
  missesSoFar: number;
  change: DnsChange | null;
  totals: { queries: number; hits: number; stale: number };
};
export type DnsRound = { path: DnsHop[]; playEndSec: number; questionSecs: number[]; windows: DnsWindow[] };

/** 이름이 그 영역 안에 드는가 — 같거나 `.` + 영역 으로 끝난다. */
function inZone(name: string, zone: string): boolean {
  return name === zone || name.endsWith(`.${zone}`);
}

/**
 * 루트부터 넘김을 따라 이름의 답을 가진 서버까지 걷는다 (조각 delegate-down-the-tree 규약 —
 * 이름 끝과 맞는 가장 긴 넘김). 넘김이 끊기거나 답이 원본 레코드가 아니면 던진다.
 */
export function walkTree(data: DnsData): DnsHop[] {
  const byName = new Map<string, DnsServer>();
  for (const s of data.servers) byName.set(s.name, s);
  let cur = byName.get(data.rootServer);
  if (!cur) throw new Error(`루트 서버가 서버 표에 없다: ${data.rootServer}`);
  const path: DnsHop[] = [{ name: cur.name, address: cur.address, zone: '' }];
  for (let guard = 0; guard <= data.servers.length; guard += 1) {
    const rec = cur.records.find((r) => r.name === data.name);
    if (rec) {
      if (rec.address !== null) throw new Error(`끝 서버의 답이 원본 레코드가 아니다: ${cur.name}`);
      return path;
    }
    let best: DnsDelegation | null = null;
    for (const d of cur.delegations) {
      if (inZone(data.name, d.zone) && (best === null || d.zone.length > best.zone.length)) best = d;
    }
    if (best === null) throw new Error(`넘김이 끊겼다: ${cur.name} 에 ${data.name} 을 맡길 자리가 없다`);
    const next = byName.get(best.to);
    if (!next) throw new Error(`넘긴 서버가 표에 없다: ${best.to}`);
    if (next.address !== best.toAddress) throw new Error(`넘김의 주소와 서버 표의 주소가 다르다: ${best.to}`);
    path.push({ name: next.name, address: next.address, zone: best.zone });
    cur = next;
  }
  throw new Error('넘김이 고리를 이룬다');
}

/** 한 판을 통째로 셈한다 — 알고리즘과 테스트가 함께 쓴다. */
export function planRound(data: DnsData, ttl: number): DnsRound {
  if (!data.ttlLadder.includes(ttl)) throw new Error(`사다리 밖 TTL: ${ttl}`);
  if (data.questionCount < 1 || data.askEverySec < 1 || data.windowSec < 1) throw new Error('질문 간격 · 수 · 창이 1 보다 작다');
  const path = walkTree(data);
  const layers = path.length;
  const playEndSec = data.questionCount * data.askEverySec;
  const questionSecs: number[] = [];
  for (let k = 0; k < data.questionCount; k += 1) questionSecs.push(k * data.askEverySec);

  let have = false;
  let cached = '';
  let expiry = 0;
  let nsKnown = false;
  let misses = 0;
  const all: DnsQuestion[] = [];
  const heldAt = new Map<number, { address: string; expiry: number } | null>();
  for (const sec of questionSecs) {
    heldAt.set(sec, have ? { address: cached, expiry } : null);
    const origin = sec >= data.changeAtSec ? data.answerAfter : data.answerBefore;
    if (have && sec < expiry) {
      all.push({ sec, kind: cached === origin ? 'hit' : 'stale', answer: cached, expirySec: expiry, missOrdinal: -1, queries: 0 });
      continue;
    }
    const queries = nsKnown ? 1 : layers;
    const kind: DnsKind = nsKnown ? 'owner' : 'walk';
    nsKnown = true;
    have = true;
    cached = origin;
    expiry = sec + ttl;
    all.push({ sec, kind, answer: origin, expirySec: expiry, missOrdinal: misses, queries });
    misses += 1;
  }

  const windows: DnsWindow[] = [];
  const lastSec = questionSecs[questionSecs.length - 1]!;
  const bounds: [number, number][] = [[-1, questionSecs[0]!]];
  for (let lo = questionSecs[0]!; lo < lastSec; lo += data.windowSec) bounds.push([lo, Math.min(lo + data.windowSec, lastSec)]);
  const totals = { queries: 0, hits: 0, stale: 0 };
  let missesSoFar = 0;
  bounds.forEach(([lo, hi], i) => {
    const qs = all.filter((q) => q.sec > lo && q.sec <= hi);
    if (qs.length === 0) throw new Error(`빈 창: (${lo}, ${hi}]`);
    let hits = 0;
    let stale = 0;
    let wMisses = 0;
    for (const q of qs) {
      totals.queries += q.queries;
      if (q.kind === 'hit' || q.kind === 'stale') {
        hits += 1;
        totals.hits += 1;
      } else wMisses += 1;
      if (q.kind === 'stale') {
        stale += 1;
        totals.stale += 1;
      }
    }
    missesSoFar += wMisses;
    let change: DnsChange | null = null;
    if (data.changeAtSec > lo && data.changeAtSec <= hi) {
      // 바뀜 시각 직전 질문이 남긴 캐시 — 바뀜 시각 이후 첫 질문에 들어갈 때의 상태
      const nextQ = all.find((q) => q.sec >= data.changeAtSec);
      const held = nextQ ? heldAt.get(nextQ.sec) : have ? { address: cached, expiry } : null;
      if (held === undefined) throw new Error('바뀜 때의 캐시 상태를 찾지 못했다');
      const heldUntilSec = held === null ? data.changeAtSec : Math.min(held.expiry, playEndSec);
      change = {
        atSec: data.changeAtSec,
        before: data.answerBefore,
        after: data.answerAfter,
        heldAddress: held === null ? null : held.address,
        heldUntilSec: Math.max(heldUntilSec, data.changeAtSec),
        heldSeconds: Math.max(0, heldUntilSec - data.changeAtSec),
      };
    }
    windows.push({
      step: i + 1,
      loSec: Math.max(lo, 0),
      hiSec: hi,
      last: i === bounds.length - 1,
      questions: qs,
      hits,
      misses: wMisses,
      stale,
      missesSoFar,
      change,
      totals: { ...totals },
    });
  });
  return { path, playEndSec, questionSecs, windows };
}

/** 창 안에서 마지막으로 지나간 phase 줄 — 옛 답이면 적중 줄 다음의 stale-answer. */
export function lastPhaseOf(w: DnsWindow): 'walk-tree' | 'ask-owner' | 'cache-hit' | 'stale-answer' {
  const q = w.questions[w.questions.length - 1]!;
  if (q.kind === 'walk') return 'walk-tree';
  if (q.kind === 'owner') return 'ask-owner';
  if (q.kind === 'stale') return 'stale-answer';
  return 'cache-hit';
}

export async function dnsAlgorithm(ctx: FacetContext<DnsData>): Promise<void> {
  const rctx = ctx as ReactiveContext<DnsData>;
  const data = ctx.data;
  const shown = { queries: 0, hits: 0, stale: 0 };
  let firstSend = true;
  const setQueries = (v: number): void => {
    if (firstSend || v !== shown.queries) ctx.metric('server-queries', v - shown.queries);
    shown.queries = v;
  };
  const setHits = (v: number): void => {
    if (firstSend || v !== shown.hits) ctx.metric('cache-hits', v - shown.hits);
    shown.hits = v;
  };
  const setStale = (v: number): void => {
    if (firstSend || v !== shown.stale) ctx.metric('stale-answers', v - shown.stale);
    shown.stale = v;
  };

  let ttl = data.ttl;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = planRound(data, ttl);
      await ctx.emit({ type: 'phase', payload: { phase: null }, silent: true });
      await ctx.emit({
        type: 'round',
        payload: {
          ttl,
          ttlLadder: [...data.ttlLadder],
          name: data.name,
          playEndSec: round.playEndSec,
          questionCount: data.questionCount,
          askEverySec: data.askEverySec,
          questionSecs: round.questionSecs,
          changeAtSec: data.changeAtSec,
          answerBefore: data.answerBefore,
          answerAfter: data.answerAfter,
          layers: round.path.length,
          path: round.path,
        },
      });
      setQueries(0);
      setHits(0);
      setStale(0);
      firstSend = false;
      if (!(await rctx.sleep(data.stepMs))) return;

      for (const w of round.windows) {
        if (ctx.cancelled) return;
        await ctx.emit({
          type: 'window',
          payload: {
            step: w.step,
            loSec: w.loSec,
            hiSec: w.hiSec,
            last: w.last,
            questions: w.questions,
            hits: w.hits,
            misses: w.misses,
            stale: w.stale,
            missesSoFar: w.missesSoFar,
            change: w.change,
          },
        });
        const ph = lastPhaseOf(w);
        if (ph === 'walk-tree') await ctx.emit({ type: 'phase', payload: { phase: 'walk-tree' }, silent: true });
        else if (ph === 'ask-owner') await ctx.emit({ type: 'phase', payload: { phase: 'ask-owner' }, silent: true });
        else if (ph === 'stale-answer') await ctx.emit({ type: 'phase', payload: { phase: 'stale-answer' }, silent: true });
        else await ctx.emit({ type: 'phase', payload: { phase: 'cache-hit' }, silent: true });
        setQueries(w.totals.queries);
        setHits(w.totals.hits);
        setStale(w.totals.stale);
        if (!(await rctx.sleep(data.stepMs))) return;
      }

      // 한 판이 끝났다 — 손잡이를 기다린다
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'ttl') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !data.ttlLadder.includes(v)) continue;
        next = v;
      }
      ttl = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
