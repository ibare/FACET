/**
 * 이벤트 — parser-stops
 *
 * - 'line-read'     { id: string; atMs: number; final: boolean } — 평범한 줄 하나를 읽었다.
 *                    final 이 참이면 이 줄을 끝으로 문서 전체를 다 읽었다.
 * - 'script-stop'   { id: string; atMs: number; src: string; dur: number; exec: number } —
 *                    속성 없는 script 줄을 만나 그 줄에서 파서가 멈추고 src 를 요청했다.
 * - 'receiving'     { atMs: number; received: number; total: number } — 멎어 있는 동안
 *                    100ms 마다 지금까지 받은 몫을 알린다.
 * - 'script-arrive' { atMs: number; src: string } — 자원이 도착해 실행이 시작됐다.
 * - 'script-resume' { atMs: number; src: string; stalledForMs: number } — 실행이 끝나
 *                    파서가 다시 내려간다. stalledForMs 는 멈춘 채 흐른 시각의 길이다.
 *
 * silent 이벤트는 없다 — 다섯 종류 전부 화면의 걸음이 된다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 문서의 줄 하나. 코드 글자는 번역하지 않는 자료다 (표기 native). */
export interface ParserStopsLine {
  readonly id: string;
  /** 원본 마크업 (예: `<h1>Today</h1>`). */
  readonly code: string;
  readonly kind: 'text' | 'script';
  /** kind 가 'script' 일 때만 있다 — resources 의 키. */
  readonly src?: string;
}

export interface ParserStopsResource {
  /** 받기 걸리는 시간 (ms). */
  readonly dur: number;
  /** 도착 뒤 실행에 걸리는 시간 (ms). */
  readonly exec: number;
}

export interface ParserStopsFacetData {
  type: 'parser-stops';
  /** 문서 줄 — 차례대로. */
  lines: ParserStopsLine[];
  /** src → 받기/실행 시간. */
  resources: Record<string, ParserStopsResource>;
  /** 걸음 하나가 끝난 뒤 머무는 ms. */
  stepMs: number;
}

/** 한 줄을 읽는 데 걸리는 시간 (ms) — common.md 의 모형. */
const PARSE_MS = 10;
/** 멎어 있는 동안 받은 몫을 알리는 간격 (ms). */
const RECEIVE_TICK_MS = 100;

export async function parserStops(ctx: FacetContext<ParserStopsFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<ParserStopsFacetData>;
  const { lines, resources, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  let atMs = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (rc.cancelled) return;
    const line = lines[i];
    if (line === undefined) throw new Error(`parser-stops: 줄 인덱스 ${i} 가 데이터에 없다`);
    atMs += PARSE_MS;
    const final = i === lines.length - 1;

    if (line.kind === 'script') {
      if (final) throw new Error(`parser-stops: script 줄(${line.id})이 문서의 마지막 줄이다 — 모형 밖`);
      const src = line.src;
      if (src === undefined) throw new Error(`parser-stops: script 줄(${line.id})에 src 가 없다`);
      const resource = resources[src];
      if (resource === undefined) throw new Error(`parser-stops: 자원 ${src} 이 데이터에 없다`);

      const stoppedAtMs = atMs;
      await ctx.emit({
        type: 'script-stop',
        payload: { id: line.id, atMs: stoppedAtMs, src, dur: resource.dur, exec: resource.exec },
      });
      if (!(await pause())) return;

      let received = 0;
      while (received + RECEIVE_TICK_MS < resource.dur) {
        if (rc.cancelled) return;
        received += RECEIVE_TICK_MS;
        await ctx.emit({
          type: 'receiving',
          payload: { atMs: stoppedAtMs + received, received, total: resource.dur },
        });
        if (!(await pause())) return;
      }

      const arrivedAtMs = stoppedAtMs + resource.dur;
      await ctx.emit({ type: 'script-arrive', payload: { atMs: arrivedAtMs, src } });
      if (!(await pause())) return;

      const resumedAtMs = arrivedAtMs + resource.exec;
      await ctx.emit({
        type: 'script-resume',
        payload: { atMs: resumedAtMs, src, stalledForMs: resumedAtMs - stoppedAtMs },
      });
      if (!(await pause())) return;
      atMs = resumedAtMs;
    } else {
      await ctx.emit({ type: 'line-read', payload: { id: line.id, atMs, final } });
      if (!(await pause())) return;
    }
  }
}
