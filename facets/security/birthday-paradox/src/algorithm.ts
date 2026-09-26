/**
 * birthday-paradox — 자리가 256 인 해시에 입력을 하나씩 넣으면, 새 입력은 이미 앉은
 * 입력 모두와 새 짝을 이룬다. 입력은 하나씩 늘지만 짝은 불어나, 자리 대부분이 빈 채
 * 첫 겹침이 온다.
 *
 * 자리 번호는 SHA-256(입력의 ASCII) 의 마지막 바이트를 미리 셈한 실측값이라 데이터로
 * 받는다. 알고리즘은 SHA-256 을 돌리지 않는다. 입력은 목록 차례대로 넣고 첫 겹침에서
 * 멈춘다 — 목록의 마지막 입력이 첫 겹침이어야 한다 (아니면 던진다).
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나 = 입력 하나):
 *
 *   enter    { index: number, slot: number, partners: number[], pairs: number, filled: number }
 *            index 번째 입력이 자리 slot 에 앉는다. partners 는 이 입력과 새 짝을 이루는
 *            앞선 입력의 번호 전부 (0 .. index−1). pairs 는 지금까지의 짝의 합,
 *            filled 는 찬 자리 수.
 *   collide  { index: number, slot: number, other: number, partners: number[], pairs: number, filled: number }
 *            enter 와 같되, 앞선 입력 other 가 이미 같은 자리 slot 에 있다. 마지막 걸음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BirthdayInput = { name: string; slot: number };

export type BirthdayParadoxFacetData = {
  type: 'birthday-paradox';
  stepMs: number;
  /** 해시 자리 수 */
  size: number;
  /** 넣는 차례대로의 입력과 실측 자리 번호 */
  inputs: BirthdayInput[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function readBirthdayParadoxData(raw: unknown): BirthdayParadoxFacetData {
  if (!isRecord(raw)) throw new Error('birthday-paradox: initialData 가 객체가 아니다');
  if (raw.type !== 'birthday-paradox') {
    throw new Error(`birthday-paradox: initialData.type 이 'birthday-paradox' 가 아니다 (${String(raw.type)})`);
  }
  const { stepMs, size, inputs } = raw;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('birthday-paradox: initialData.stepMs 가 양수가 아니다');
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 2) {
    throw new Error('birthday-paradox: initialData.size 가 2 이상의 정수가 아니다');
  }
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error('birthday-paradox: initialData.inputs 가 둘 이상의 배열이 아니다');
  }
  const out: BirthdayInput[] = inputs.map((item: unknown, i: number) => {
    if (!isRecord(item)) throw new Error(`birthday-paradox: initialData.inputs[${i}] 가 객체가 아니다`);
    const { name, slot } = item;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`birthday-paradox: initialData.inputs[${i}].name 이 빈 문자열이거나 없다`);
    }
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= size) {
      throw new Error(`birthday-paradox: initialData.inputs[${i}].slot 이 0..${size - 1} 의 정수가 아니다`);
    }
    return { name, slot };
  });
  return { type: 'birthday-paradox', stepMs, size, inputs: out };
}

export async function birthdayParadox(context: FacetContext<BirthdayParadoxFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BirthdayParadoxFacetData>;
  const data = readBirthdayParadoxData(ctx.data);
  const { stepMs, inputs } = data;

  // 걸음 0 은 빈 자리 전부가 이미 선 화면이다 — 첫 발신 앞에서도 읽을 틈을 둔다.
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const taken = new Set<number>();
  let pairs = 0;

  for (let index = 0; index < inputs.length; index += 1) {
    if (!(await pause())) return;
    const input = inputs[index];
    if (input === undefined) throw new Error(`birthday-paradox: inputs[${index}] 가 없다`);
    // 이미 앉은 입력 모두가 새 짝이다.
    const partners = Array.from({ length: index }, (_, j) => j);
    pairs += partners.length;

    const other = inputs.findIndex((prev, j) => j < index && prev.slot === input.slot);
    if (other >= 0) {
      if (index !== inputs.length - 1) {
        throw new Error(
          `birthday-paradox: 첫 겹침이 inputs[${index}] 에서 왔는데 목록이 더 이어진다 — 목록은 첫 겹침에서 끝나야 한다`,
        );
      }
      await ctx.emit({
        type: 'collide',
        payload: { index, slot: input.slot, other, partners, pairs, filled: taken.size },
      });
      return;
    }
    taken.add(input.slot);
    if (index === inputs.length - 1) {
      throw new Error('birthday-paradox: 목록이 끝날 때까지 겹침이 없다 — 마지막 입력이 첫 겹침이어야 한다');
    }
    await ctx.emit({
      type: 'enter',
      payload: { index, slot: input.slot, partners, pairs, filled: taken.size },
    });
  }
}
