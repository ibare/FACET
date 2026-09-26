/**
 * just-before-paint — 값이 한 장 사이에 여러 번 바뀌어도 requestAnimationFrame 에 건
 * 그리기는 박자마다 한 번 불린다.
 *
 * 메시지와 박자를 시각 차례로 섞어 돈다. 메시지는 `latest` 하나를 덮어쓸 뿐이고, 박자가 오면
 * 그 순간 떠 둔 콜백 목록(`draw` 하나)을 부른 뒤 스타일 · 레이아웃 · 페인트가 뒤따른다.
 * `draw` 가 안에서 다시 건 요청은 뜬 목록에 없으므로 다음 박자로 넘어간다.
 *
 * 이벤트 (시각은 ms, 셈한 그대로의 수 — 표시할 때만 반올림한다):
 *
 *   init    (silent) { beats: { beat: number; at: number }[]; until: number; pending: number }
 *           바탕 — 볼 박자들의 시각, 시간축의 끝(가장 늦은 사건의 시각), 처음 걸린 draw 가 불릴 박자
 *   message { index: number; at: number; value: number; was: number; lost: number | null;
 *             messages: number }
 *           메시지 하나가 도착해 latest 를 덮어쓴다. `was` 는 덮어쓰인 값, `lost` 는 박자를 한 번도
 *           못 만나고 덮어쓰인 메시지의 번호(없으면 null), `messages` 는 여태 도착한 메시지 수
 *   call    { beat: number; at: number; value: number; gathered: number; took: number | null;
 *             calls: number; next: number }
 *           박자의 콜백 단계 — draw 가 한 번 불려 latest 를 box 에 넣는다. `gathered` 는 지난 박자 뒤
 *           도착한 메시지 수, `took` 은 그 값을 가져온 메시지 번호(지난 박자 뒤 메시지가 없으면 null),
 *           `calls` 는 여태 부른 수, `next` 는 draw 가 새로 건 요청이 불릴 박자
 *   paint   { beat: number; value: number; paints: number; last: boolean; unseen: number[] }
 *           같은 박자의 스타일 · 레이아웃 · 페인트 — box 의 값이 화면에 나온다. `last` 는 마지막 사건인가,
 *           `unseen` 은 여태 도착한 메시지 가운데 draw 가 한 번도 가져가지 못한 것의 값 (도착 차례)
 *
 * silent 는 init 하나. 나머지는 모두 걸음이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type JustBeforePaintFacetData = {
  type: 'just-before-paint';
  stepMs: number;
  /** 화면에 두는 코드 (자바스크립트 · 번역하지 않음) */
  code: string[];
  /** 코드 줄 가운데 무엇이 어느 줄인가 (0 부터) */
  roles: { handler: number; write: number; request: number; kickoff: number };
  /** 코드 안의 이름 — 화면의 칸 이름으로 쓴다 */
  names: { latest: string; box: string; draw: string };
  /** `latest` 의 처음 값 */
  start: number;
  /** 화면 새로 고침 빈도 (Hz) */
  hz: number;
  /** 박자 1 부터 몇 박자까지 보는가 */
  beats: number;
  /** 도착하는 메시지 — 도착 시각(ms)과 값 */
  messages: { at: number; value: number }[];
};

type Happening =
  | { kind: 'message'; at: number; index: number; value: number }
  | { kind: 'beat'; at: number; beat: number };

/** 박자 k 의 시각 — 자르지 않고 매번 셈한다. */
function beatAt(k: number, hz: number): number {
  return (k * 1000) / hz;
}

/** 시각 t 가 박자 시각과 같은가 — 같으면 어느 쪽을 먼저 둘지 지어낼 수 없다. */
function onBeat(t: number, hz: number): boolean {
  const k = Math.round((t * hz) / 1000);
  return k * 1000 === t * hz;
}

function readData(raw: JustBeforePaintFacetData): JustBeforePaintFacetData {
  if (raw.type !== 'just-before-paint') throw new Error(`just-before-paint: 모르는 자료 ${String(raw.type)}`);
  if (!(raw.hz > 0)) throw new Error(`just-before-paint: 빈도가 양수가 아니다 (${raw.hz})`);
  if (!Number.isInteger(raw.beats) || raw.beats < 1) throw new Error(`just-before-paint: 박자 수가 틀렸다 (${raw.beats})`);
  if (raw.messages.length === 0) throw new Error('just-before-paint: 메시지가 없다');
  for (const [i, m] of raw.messages.entries()) {
    if (!Number.isFinite(m.at) || m.at <= 0) throw new Error(`just-before-paint: 메시지 ${i} 의 시각이 틀렸다 (${m.at})`);
    if (!Number.isFinite(m.value)) throw new Error(`just-before-paint: 메시지 ${i} 의 값이 수가 아니다`);
    if (onBeat(m.at, raw.hz)) throw new Error(`just-before-paint: 메시지 ${i} 가 박자 시각 ${m.at} ms 에 도착한다`);
    const before = raw.messages[i - 1];
    if (before !== undefined && before.at >= m.at) throw new Error(`just-before-paint: 메시지 ${i} 의 시각이 앞 메시지보다 늦지 않다`);
  }
  for (const [role, line] of Object.entries(raw.roles)) {
    if (raw.code[line] === undefined) throw new Error(`just-before-paint: 코드에 ${role} 줄(${line})이 없다`);
  }
  return raw;
}

export async function justBeforePaint(context: FacetContext<JustBeforePaintFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<JustBeforePaintFacetData>;
  const data = readData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const beats: { beat: number; at: number }[] = [];
  for (let k = 1; k <= data.beats; k += 1) {
    if (ctx.cancelled) return;
    beats.push({ beat: k, at: beatAt(k, data.hz) });
  }
  const happenings: Happening[] = [
    ...data.messages.map((m, index): Happening => ({ kind: 'message', at: m.at, index, value: m.value })),
    ...beats.map((b): Happening => ({ kind: 'beat', at: b.at, beat: b.beat })),
  ].sort((a, b) => a.at - b.at);
  const until = Math.max(...happenings.map((h) => h.at));

  await ctx.emit({ type: 'init', payload: { beats, until, pending: 1 }, silent: true });

  let latest = data.start;
  let box = data.start;
  let lastIndex: number | null = null;
  let since = 0;
  let messages = 0;
  let calls = 0;
  let paints = 0;
  const taken = new Set<number>();
  const final = happenings[happenings.length - 1];

  for (const h of happenings) {
    if (!(await pause())) return;
    if (h.kind === 'message') {
      const was = latest;
      const lost = since > 0 ? lastIndex : null;
      latest = h.value;
      lastIndex = h.index;
      since += 1;
      messages += 1;
      await ctx.emit({
        type: 'message',
        payload: { index: h.index, at: h.at, value: h.value, was, lost, messages },
      });
      continue;
    }
    // 박자 — 그 순간 떠 둔 목록(draw 하나)을 부른다. draw 가 다시 건 요청은 다음 박자의 몫이다
    calls += 1;
    box = latest;
    const took = since > 0 ? lastIndex : null;
    if (took !== null) taken.add(took);
    const gathered = since;
    since = 0;
    await ctx.emit({
      type: 'call',
      payload: { beat: h.beat, at: h.at, value: box, gathered, took, calls, next: h.beat + 1 },
    });
    if (!(await pause())) return;
    paints += 1;
    const unseen = data.messages.filter((m, i) => m.at < h.at && !taken.has(i)).map((m) => m.value);
    await ctx.emit({
      type: 'paint',
      payload: { beat: h.beat, value: box, paints, last: h === final, unseen },
    });
  }
}
