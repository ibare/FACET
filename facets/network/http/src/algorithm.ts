/**
 * HTTP 와 웹소켓 — 서버 쪽에 드문드문 생기는 메시지 일곱을 30 초 동안 클라이언트가 받는다.
 *
 * 손잡이 `receive` 가 받는 방식을 고른다. 사다리 `initialData.receiveModes` 의 색인이다.
 *   0..3  폴링 — 간격(1 · 2 · 5 · 10 초)마다 요청을 보내 쌓인 것을 가져온다
 *   4     웹소켓 — t0 에 업그레이드 한 번, 그 뒤 서버가 태어난 초에 틀로 밀어 준다
 *
 * ## 규약 (사양 그대로)
 * - 시각은 정수 초 1..horizonSec. 한 초 안의 차례:
 *   ① 쌓여 있던 메시지 수만큼 늦음 합에 더한다 (한 초 더 기다렸다)
 *   ② 이 초에 태어난 메시지가 쌓인다
 *   ③ 이 초가 폴링 시각(`초 % 간격 == 0`)이면 폴링 — 쌓인 것이 없으면 204, 있으면 200 에 전부 JSON 배열 하나로
 *   그래서 폴링과 같은 초에 태어난 메시지는 그 폴링이 가져간다 (늦음 0). 동률은 이 차례 하나로 풀린다
 * - 바이트는 응용 계층 글자만, UTF-8, 줄 끝 CRLF 2, 머리 끝 빈 줄 2 를 센다. 글자는 전부 `initialData` 에서 온다
 * - 짐 아닌 바이트 = 선 위 바이트 − 넘어간 짐 바이트
 * - 30 초 끝에 넘기지 못한 메시지 · 사다리 밖 값 · 모르는 mode · 125 바이트를 넘는 틀 짐은 던진다
 *
 * ## 이벤트 (payload 스키마)
 * - `run-start` — 판 하나의 걸음 0. 빈 시간 축과 이 판의 요청 시각표
 *     { receive: number, mode: 'poll' | 'websocket', periodSec: number (웹소켓은 0),
 *       pollTimes: number[], births: number[], horizonSec: number, windowSec: number }
 * - `upgrade` — 웹소켓 판의 걸음 1. t0 의 업그레이드 요청과 101 응답
 *     { requestBytes: number, responseBytes: number }
 * - `window` — 5 초 창 (lo, hi] 하나 = 걸음 하나
 *     { index: number, lo: number, hi: number,
 *       happenings: { at: number, kind: 'birth' | 'poll-empty' | 'poll-deliver' | 'push', ids: number[] }[],
 *       delivered: { id: number, born: number, at: number }[],   // 이 창에서 넘어간 메시지
 *       pending: number[],                                        // 창 끝에 서버 쪽에 쌓여 있는 메시지
 *       requests: number, emptyResponses: number, delaySeconds: number, overheadBytes: number, wireBytes: number }
 *                                                                   // 창 끝까지의 누적
 * - `phase` (silent) — { phase: string }. 창에서 지나간 마지막 phase 줄. 지난 줄이 없으면 보내지 않는다
 *
 * ## phase 어휘 (irs.ts 와 정확히 같다)
 * `msg-queue` · `poll-empty` · `poll-deliver` · `ws-upgrade` · `ws-push`
 *
 * ## 계기 (판마다 차이로 — 판 시작에 0, 걸음마다 그 창까지의 누적)
 * `http-requests` · `empty-responses` · `delay-seconds` · `overhead-bytes`
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HttpReceiveMode = { mode: 'poll'; periodSec: number } | { mode: 'websocket' };

export type HttpData = {
  type: 'http';
  stepMs: number;
  horizonSec: number;
  windowSec: number;
  births: number[];
  payload: string;
  pollRequestLines: string[];
  emptyResponseLines: string[];
  fullResponseHeadLines: string[];
  upgradeRequestLines: string[];
  upgradeResponseLines: string[];
  serverFrameHead: number;
  receiveModes: HttpReceiveMode[];
  receive: number;
};

export type HttpHappening = {
  at: number;
  kind: 'birth' | 'poll-empty' | 'poll-deliver' | 'push';
  ids: number[];
};

export type HttpDelivery = { id: number; born: number; at: number };

export type HttpWindow = {
  index: number;
  lo: number;
  hi: number;
  happenings: HttpHappening[];
  delivered: HttpDelivery[];
  pending: number[];
  requests: number;
  emptyResponses: number;
  delaySeconds: number;
  overheadBytes: number;
  wireBytes: number;
  lastPhase: string | null;
};

export type HttpRun = {
  mode: 'poll' | 'websocket';
  periodSec: number;
  pollTimes: number[];
  upgrade: { requestBytes: number; responseBytes: number } | null;
  windows: HttpWindow[];
  totals: { requests: number; emptyResponses: number; delaySeconds: number; overheadBytes: number; wireBytes: number };
  /** IR 에 건넬 수 — 알고리즘이 글자에서 센 바이트 */
  sizes: { request: number; empty: number; headBase: number; payload: number; handshake: number; frameHead: number };
};

const encoder = new TextEncoder();

/** UTF-8 바이트 수. */
export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/** 머리줄 묶음의 바이트 — 줄마다 CRLF 2, 끝에 빈 줄 CRLF 2. */
export function headLength(lines: string[]): number {
  if (lines.length === 0) throw new Error('http: 머리줄이 비어 있다');
  let sum = 2;
  for (const line of lines) sum += utf8Length(line) + 2;
  return sum;
}

function modeAt(data: HttpData, receive: number): HttpReceiveMode {
  if (!Number.isInteger(receive) || receive < 0 || receive >= data.receiveModes.length) {
    throw new Error(`http: 사다리 밖 값 ${receive}`);
  }
  const m = data.receiveModes[receive];
  if (m === undefined) throw new Error(`http: 사다리 밖 값 ${receive}`);
  if (m.mode === 'poll') {
    if (!Number.isInteger(m.periodSec) || m.periodSec <= 0) throw new Error(`http: 폴링 간격이 옳지 않다 ${m.periodSec}`);
    return m;
  }
  if (m.mode === 'websocket') return m;
  throw new Error(`http: 모르는 mode ${(m as { mode: unknown }).mode}`);
}

/**
 * 한 판을 셈한다 — 화면 · 계기 · IR 대조가 모두 이 결과에서 나온다.
 */
export function simulateHttp(data: HttpData, receive: number): HttpRun {
  const mode = modeAt(data, receive);
  const horizon = data.horizonSec;
  const win = data.windowSec;
  if (!Number.isInteger(horizon) || !Number.isInteger(win) || win <= 0 || horizon % win !== 0) {
    throw new Error(`http: 시간 축 ${horizon} 을 창 ${win} 으로 나눌 수 없다`);
  }
  for (const b of data.births) {
    if (!Number.isInteger(b) || b < 1 || b > horizon) throw new Error(`http: 시간 축 밖의 메시지 ${b}`);
  }
  const payloadBytes = utf8Length(data.payload);
  const sizes = {
    request: headLength(data.pollRequestLines),
    empty: headLength(data.emptyResponseLines),
    headBase: headLength(data.fullResponseHeadLines),
    payload: payloadBytes,
    handshake: headLength(data.upgradeRequestLines) + headLength(data.upgradeResponseLines),
    frameHead: data.serverFrameHead,
  };

  let requests = 0;
  let emptyResponses = 0;
  let delaySeconds = 0;
  let overheadBytes = 0;
  let wireBytes = 0;
  let pending: number[] = [];
  const pollTimes: number[] = [];
  let upgrade: HttpRun['upgrade'] = null;
  const periodSec = mode.mode === 'poll' ? mode.periodSec : 0;

  if (mode.mode === 'poll') {
    for (let sec = 1; sec <= horizon; sec++) if (sec % periodSec === 0) pollTimes.push(sec);
  } else {
    if (payloadBytes > 125) throw new Error(`http: 틀 짐 ${payloadBytes} 바이트는 짧은 길이 칸을 넘는다`);
    const requestBytes = headLength(data.upgradeRequestLines);
    const responseBytes = headLength(data.upgradeResponseLines);
    upgrade = { requestBytes, responseBytes };
    requests += 1;
    overheadBytes += requestBytes + responseBytes;
    wireBytes += requestBytes + responseBytes;
  }

  const windows: HttpWindow[] = [];
  let current: HttpWindow | null = null;
  for (let sec = 1; sec <= horizon; sec++) {
    if (current === null) {
      const lo = sec - 1;
      current = {
        index: windows.length, lo, hi: lo + win, happenings: [], delivered: [], pending: [],
        requests: 0, emptyResponses: 0, delaySeconds: 0, overheadBytes: 0, wireBytes: 0, lastPhase: null,
      };
    }
    delaySeconds += pending.length;
    const bornNow: number[] = [];
    data.births.forEach((b, id) => {
      if (b === sec) bornNow.push(id);
    });
    if (mode.mode === 'poll') {
      if (bornNow.length > 0) {
        pending = [...pending, ...bornNow];
        current.happenings.push({ at: sec, kind: 'birth', ids: bornNow });
        current.lastPhase = 'msg-queue';
      }
      if (sec % periodSec === 0) {
        requests += 1;
        if (pending.length === 0) {
          emptyResponses += 1;
          overheadBytes += sizes.request + sizes.empty;
          wireBytes += sizes.request + sizes.empty;
          current.happenings.push({ at: sec, kind: 'poll-empty', ids: [] });
          current.lastPhase = 'poll-empty';
        } else {
          const body = `[${pending.map(() => data.payload).join(',')}]`;
          const bodyBytes = utf8Length(body);
          const lastLine = data.fullResponseHeadLines[data.fullResponseHeadLines.length - 1];
          if (lastLine === undefined) throw new Error('http: 찬 응답 머리가 비어 있다');
          const head = headLength([...data.fullResponseHeadLines.slice(0, -1), `${lastLine}${bodyBytes}`]);
          const wire = sizes.request + head + bodyBytes;
          wireBytes += wire;
          overheadBytes += wire - pending.length * payloadBytes;
          current.happenings.push({ at: sec, kind: 'poll-deliver', ids: pending });
          for (const id of pending) {
            const born = data.births[id];
            if (born === undefined) throw new Error(`http: 없는 메시지 ${id}`);
            current.delivered.push({ id, born, at: sec });
          }
          pending = [];
          current.lastPhase = 'poll-deliver';
        }
      }
    } else {
      for (const id of bornNow) {
        overheadBytes += sizes.frameHead;
        wireBytes += sizes.frameHead + payloadBytes;
        current.delivered.push({ id, born: sec, at: sec });
      }
      if (bornNow.length > 0) {
        current.happenings.push({ at: sec, kind: 'push', ids: bornNow });
        current.lastPhase = 'ws-push';
      }
    }
    if (sec === current.hi) {
      current.pending = [...pending];
      current.requests = requests;
      current.emptyResponses = emptyResponses;
      current.delaySeconds = delaySeconds;
      current.overheadBytes = overheadBytes;
      current.wireBytes = wireBytes;
      windows.push(current);
      current = null;
    }
  }
  if (pending.length > 0) {
    throw new Error(`http: ${horizon} 초 끝에 넘기지 못한 메시지 ${pending.length} 개`);
  }
  return {
    mode: mode.mode,
    periodSec,
    pollTimes,
    upgrade,
    windows,
    totals: { requests, emptyResponses, delaySeconds, overheadBytes, wireBytes },
    sizes,
  };
}

type MetricName = 'http-requests' | 'empty-responses' | 'delay-seconds' | 'overhead-bytes';

export async function httpAlgorithm(ctx: FacetContext<HttpData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HttpData>;
  const data = ctx.data;
  const shown: Record<MetricName, number> = {
    'http-requests': 0,
    'empty-responses': 0,
    'delay-seconds': 0,
    'overhead-bytes': 0,
  };
  // 지금 보이는 값을 들고 차이만 보낸다 — 계기는 누적 채널이라 판이 바뀌면 되돌려야 한다
  const showMetric = (name: MetricName, value: number): void => {
    const delta = value - shown[name];
    shown[name] = value;
    ctx.metric(name, delta);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (receive: number): Promise<boolean> => {
    const run = simulateHttp(data, receive);
    await ctx.emit({
      type: 'run-start',
      payload: {
        receive,
        mode: run.mode,
        periodSec: run.periodSec,
        pollTimes: run.pollTimes,
        births: [...data.births],
        horizonSec: data.horizonSec,
        windowSec: data.windowSec,
      },
    });
    showMetric('http-requests', 0);
    showMetric('empty-responses', 0);
    showMetric('delay-seconds', 0);
    showMetric('overhead-bytes', 0);
    if (!(await rctx.sleep(data.stepMs))) return false;

    if (run.upgrade !== null) {
      if (ctx.cancelled) return false;
      await ctx.emit({ type: 'upgrade', payload: { ...run.upgrade } });
      await phase('ws-upgrade');
      showMetric('http-requests', 1);
      showMetric('overhead-bytes', run.upgrade.requestBytes + run.upgrade.responseBytes);
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    for (const w of run.windows) {
      if (ctx.cancelled) return false;
      await ctx.emit({
        type: 'window',
        payload: {
          index: w.index,
          lo: w.lo,
          hi: w.hi,
          happenings: w.happenings.map((h) => ({ ...h, ids: [...h.ids] })),
          delivered: w.delivered.map((d) => ({ ...d })),
          pending: [...w.pending],
          requests: w.requests,
          emptyResponses: w.emptyResponses,
          delaySeconds: w.delaySeconds,
          overheadBytes: w.overheadBytes,
          wireBytes: w.wireBytes,
        },
      });
      if (w.lastPhase === 'msg-queue') await phase('msg-queue');
      else if (w.lastPhase === 'poll-empty') await phase('poll-empty');
      else if (w.lastPhase === 'poll-deliver') await phase('poll-deliver');
      else if (w.lastPhase === 'ws-push') await phase('ws-push');
      else if (w.lastPhase !== null) throw new Error(`http: 모르는 phase ${w.lastPhase}`);
      showMetric('http-requests', w.requests);
      showMetric('empty-responses', w.emptyResponses);
      showMetric('delay-seconds', w.delaySeconds);
      showMetric('overhead-bytes', w.overheadBytes);
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    let receive = data.receive;
    if (!(await playRun(receive))) return;
    for (;;) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'receive') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) throw new Error('http: receive 입력의 payload 가 객체가 아니다');
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number') throw new Error('http: receive 입력의 value 가 수가 아니다');
      if (!Number.isInteger(value) || value < 0 || value >= data.receiveModes.length) {
        throw new Error(`http: 사다리 밖 값 ${value}`);
      }
      receive = value;
      if (!(await playRun(receive))) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
