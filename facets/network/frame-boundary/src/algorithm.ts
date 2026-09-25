/**
 * frame-boundary — 받는 쪽이 선 위 바이트를 하나씩 읽어 프레임의 처음과 끝을 알아본다.
 *
 * 모형 (PPP 의 바이트 채워 넣기, RFC 1662 를 줄인 것):
 *   - 보내는 쪽은 앞뒤에 표식(flag) 하나씩을 두고, 데이터 안의 표식 · 탈출(escape) 바이트는
 *     `탈출` 다음에 (그 바이트 XOR mask) 로 바꿔 싣는다. 그 밖의 바이트는 그대로.
 *   - 받는 쪽 상태는 셋 — 열리기 전(idle) · 열림(open) · 탈출 뒤(escaped). 표식에서 닫히면 closed.
 *   - 줄인 자리: PPP 의 주소 · 제어 · 프로토콜 칸과 FCS 는 두지 않는다 (설명 글이 밝힌다).
 *   - 보내는 쪽의 채워 넣기는 걸음 0 에 이미 끝나 있다. 걸음은 받는 쪽이 바이트 하나를 읽는 것이다.
 *
 * 이벤트
 *   init  (silent)  { data: number[]; wire: number[]; flag: number; escape: number; mask: number }
 *                   data = 실을 바이트, wire = 채워 넣어 만든 선 위 바이트 열. 걸음 0 을 갈아 끼운다
 *   read            { index: number; byte: number; kind: 'open' | 'keep' | 'escape' | 'restore' | 'close';
 *                     value?: number }
 *                   index = 선 위 자리, byte = 읽은 바이트. value 는 담은 값 (keep · restore 에만)
 *
 * 셈할 수 없는 상태는 던진다 — 열리기 전의 표식 아닌 바이트, 닫힌 뒤의 바이트, 끝까지 닫히지 않음,
 * 되찾은 데이터가 실은 데이터와 다름, 16진수 두 자리가 아닌 자료.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FrameBoundaryFacetData = {
  type: 'frame-boundary';
  stepMs: number;
  /** 실을 데이터 — 16진수 두 자리 대문자 */
  data: string[];
  flag: string;
  escape: string;
  mask: string;
};

type ReadKind = 'open' | 'keep' | 'escape' | 'restore' | 'close';

function parseByte(text: unknown, where: string): number {
  if (typeof text !== 'string' || !/^[0-9A-F]{2}$/.test(text)) {
    throw new Error(`frame-boundary: ${where} 는 16진수 두 자리 대문자여야 한다 — ${String(text)}`);
  }
  return parseInt(text, 16);
}

/** 보내는 쪽 — 앞뒤에 표식, 데이터 안의 표식 · 탈출은 탈출 + (b XOR mask) */
function stuff(data: number[], flag: number, escape: number, mask: number): number[] {
  const out = [flag];
  for (const b of data) {
    if (b === flag || b === escape) out.push(escape, b ^ mask);
    else out.push(b);
  }
  out.push(flag);
  return out;
}

export async function frameBoundary(ctx0: FacetContext<FrameBoundaryFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<FrameBoundaryFacetData>;
  const d = ctx.data;
  if (!Array.isArray(d.data) || d.data.length === 0) {
    throw new Error('frame-boundary: 실을 데이터가 비었다');
  }
  const data = d.data.map((b, i) => parseByte(b, `data[${i}]`));
  const flag = parseByte(d.flag, 'flag');
  const escape = parseByte(d.escape, 'escape');
  const mask = parseByte(d.mask, 'mask');
  if (flag === escape) throw new Error('frame-boundary: 표식과 탈출이 같다');
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('frame-boundary: stepMs 가 양수가 아니다');
  }

  const wire = stuff(data, flag, escape, mask);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { data: [...data], wire: [...wire], flag, escape, mask },
  });

  let state: 'idle' | 'open' | 'escaped' | 'closed' = 'idle';
  const got: number[] = [];

  for (let index = 0; index < wire.length; index += 1) {
    // 걸음 0 은 이미 선 위 열이 보이는 화면이라 첫 읽기 앞에도 머문다.
    if (!(await pause())) return;
    const byte = wire[index];
    if (byte === undefined) throw new Error(`frame-boundary: 선 위 ${index} 자리가 비었다`);
    let kind: ReadKind;
    let value: number | undefined;
    if (state === 'idle') {
      if (byte !== flag) throw new Error(`frame-boundary: 열리기 전에 표식이 아닌 바이트 (자리 ${index})`);
      state = 'open';
      kind = 'open';
    } else if (state === 'open') {
      if (byte === flag) {
        state = 'closed';
        kind = 'close';
      } else if (byte === escape) {
        state = 'escaped';
        kind = 'escape';
      } else {
        value = byte;
        got.push(value);
        kind = 'keep';
      }
    } else if (state === 'escaped') {
      value = byte ^ mask;
      got.push(value);
      state = 'open';
      kind = 'restore';
    } else {
      throw new Error(`frame-boundary: 닫힌 뒤에 바이트 (자리 ${index})`);
    }
    await ctx.emit({
      type: 'read',
      payload: value === undefined ? { index, byte, kind } : { index, byte, kind, value },
    });
  }

  if (state !== 'closed') throw new Error('frame-boundary: 선이 끝났는데 프레임이 닫히지 않았다');
  if (got.length !== data.length || got.some((b, i) => b !== data[i])) {
    throw new Error('frame-boundary: 되찾은 데이터가 실은 데이터와 다르다');
  }
}
