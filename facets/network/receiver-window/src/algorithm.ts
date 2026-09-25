/**
 * receiver-window — 받는 쪽 버퍼의 빈자리가 창으로 돌아가고, 보내는 쪽은 그만큼만 보낸다.
 *
 * 모형 (예로 정한 값 — 버퍼 크기 · 조각 크기 · 보낼 양 · 처음 창 · 앱이 읽는 양은 모두 예다.
 * 실제 TCP 의 창 0 탐침 · 날아가는 중인 양은 이 모형에 없다):
 *   - 시간은 라운드로만 흐른다. 라운드 = 두 걸음 (보냄 → 읽고 알림)
 *   - (보냄) 보내는 쪽이 마지막으로 받은 창 안에서 조각 단위로 보낸다 — 보낸 조각 수 × 조각 크기 ≤ 창.
 *     보낸 것은 같은 걸음에 버퍼에 들어간다. 앞 라운드 것은 이미 모두 확인되었다
 *   - (읽고 알림) 앱이 그 라운드의 양을 읽어 버퍼에서 뺀다. 새 창 = 버퍼 크기 − 아직 안 읽은 양
 *   - 보낸 합이 전체에 닿는 보냄 걸음에서 끝난다 (그 라운드의 읽고 알림은 없다)
 *   - 창이 0 인 라운드의 보냄 걸음은 아무것도 보내지 않는 걸음 (`stall`)
 *   - 버퍼가 넘치거나 · 있는 것보다 많이 읽거나 · 읽기 일정이 모자라거나 · 읽는 양이 조각 단위가 아니면 던진다
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   send   { round: number; window: number; first: number; count: number;
 *            firstByte: number; lastByte: number; used: number; sent: number; done: boolean }
 *          first = 이번에 보낸 첫 조각의 순번(0 부터), count ≥ 1. used = 보낸 뒤 버퍼에 든 바이트
 *   stall  { round: number; window: number; used: number }
 *          창이 0 이라 보낸 조각이 0
 *   read   { round: number; read: number; segments: number; used: number; window: number }
 *          read = 앱이 읽은 바이트, segments = 그만큼의 조각 수, window = 새로 알린 창
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReceiverWindowFacetData = {
  type: 'receiver-window';
  stepMs: number;
  /** 받는 쪽 버퍼 크기 (바이트) */
  bufferBytes: number;
  /** 조각 하나의 크기 (바이트) */
  segmentBytes: number;
  /** 보낼 전체 (바이트) */
  totalBytes: number;
  /** 연결을 열 때 알렸다고 치는 창 (바이트) */
  initialWindow: number;
  /** 앱이 라운드마다 읽는 양 (바이트) */
  reads: number[];
};

export async function receiverWindow(context: FacetContext<ReceiverWindowFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ReceiverWindowFacetData>;
  const { stepMs, bufferBytes, segmentBytes, totalBytes, initialWindow, reads } = ctx.data;

  if (!(segmentBytes > 0) || bufferBytes % segmentBytes !== 0 || totalBytes % segmentBytes !== 0) {
    throw new Error('receiver-window: 버퍼 크기와 전체 양은 조각 크기의 배수여야 한다');
  }
  if (initialWindow > bufferBytes || initialWindow < 0) {
    throw new Error(`receiver-window: 처음 창 ${initialWindow} 이 버퍼 크기 ${bufferBytes} 를 벗어난다`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const maxRounds = reads.length + 1;
  let used = 0;
  let sent = 0;
  let window = initialWindow;

  for (let round = 1; sent < totalBytes; round += 1) {
    // 걸음 0 은 이미 읽을 것이 있는 화면(두 끝 · 처음 창)이라 첫 보냄 앞에도 머문다
    if (!(await pause())) return;
    if (round > maxRounds) throw new Error('receiver-window: 읽기 일정이 모자라 끝나지 않는다');

    // (보냄) 창 안에서 조각 단위로
    let count = 0;
    while (sent + count * segmentBytes < totalBytes && (count + 1) * segmentBytes <= window) {
      if (ctx.cancelled) return;
      count += 1;
    }
    const firstByte = sent + 1;
    used += count * segmentBytes;
    sent += count * segmentBytes;
    if (used > bufferBytes) {
      throw new Error(`receiver-window: 라운드 ${round} 에서 버퍼가 넘친다 (${used} > ${bufferBytes})`);
    }
    const done = sent >= totalBytes;

    if (count === 0) {
      await ctx.emit({ type: 'stall', payload: { round, window, used } });
    } else {
      await ctx.emit({
        type: 'send',
        payload: {
          round,
          window,
          first: (firstByte - 1) / segmentBytes,
          count,
          firstByte,
          lastByte: sent,
          used,
          sent,
          done,
        },
      });
    }
    if (done) return;

    // (읽고 알림)
    if (!(await pause())) return;
    const read = reads[round - 1];
    if (read === undefined) throw new Error(`receiver-window: 라운드 ${round} 의 읽는 양이 없다`);
    if (read < 0 || read % segmentBytes !== 0) {
      throw new Error(`receiver-window: 라운드 ${round} 의 읽는 양 ${read} 이 조각 단위가 아니다`);
    }
    if (read > used) {
      throw new Error(`receiver-window: 라운드 ${round} 에 있는 것(${used})보다 많이 읽는다 (${read})`);
    }
    used -= read;
    window = bufferBytes - used;
    await ctx.emit({
      type: 'read',
      payload: { round, read, segments: read / segmentBytes, used, window },
    });
  }
}
