/**
 * smaller-key-same-strength — 같은 강도를 내는 두 열쇠의 길이를 강도 단마다 견준다.
 *
 * 데이터는 표준이 정한 표(강도 비트 · RSA 모듈러스 비트 · 타원 곡선 키 비트)다 — 1차 데이터.
 * 알고리즘은 단마다 배율(RSA ÷ 타원 곡선, 소수 첫째 자리)과 차(RSA − 타원 곡선)를 셈하고,
 * 타원 곡선 키 비트가 강도의 두 배인지 확인한다(어긋나면 던진다).
 *
 * 이벤트
 *   level   (silent 아님) 강도 한 단이 드러난다. 걸음 하나 = 강도 한 단.
 *     payload: {
 *       index: number      표의 몇째 단인가 (0 부터)
 *       strength: number   강도 비트
 *       rsa: number        RSA 모듈러스 비트
 *       ecc: number        타원 곡선 키 비트
 *       ratio: number      RSA ÷ 타원 곡선, 소수 첫째 자리로 반올림
 *       gap: number        RSA − 타원 곡선
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다(빈 두 쪽 · 강도 단 목록).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 강도 한 단 — 표의 한 줄. */
export type StrengthLevel = {
  readonly strength: number;
  readonly rsa: number;
  readonly ecc: number;
};

export type SmallerKeySameStrengthFacetData = {
  readonly type: 'smaller-key-same-strength';
  readonly stepMs: number;
  readonly levels: readonly StrengthLevel[];
};

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`smaller-key-same-strength: ${path} 는 양의 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘 · 장면 · 무대가 함께 쓴다. 어긋나면 던진다. */
export function narrowSmallerKeyData(raw: unknown): SmallerKeySameStrengthFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('smaller-key-same-strength: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'smaller-key-same-strength') {
    throw new Error(`smaller-key-same-strength: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  const stepMs = positiveInt(r.stepMs, 'initialData.stepMs');
  if (!Array.isArray(r.levels) || r.levels.length === 0) {
    throw new Error('smaller-key-same-strength: initialData.levels 는 비지 않은 배열이어야 한다');
  }
  const levels: StrengthLevel[] = r.levels.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`smaller-key-same-strength: initialData.levels[${i}] 가 객체가 아니다`);
    }
    const o = item as Record<string, unknown>;
    return {
      strength: positiveInt(o.strength, `initialData.levels[${i}].strength`),
      rsa: positiveInt(o.rsa, `initialData.levels[${i}].rsa`),
      ecc: positiveInt(o.ecc, `initialData.levels[${i}].ecc`),
    };
  });
  for (let i = 1; i < levels.length; i += 1) {
    const a = levels[i - 1] as StrengthLevel;
    const b = levels[i] as StrengthLevel;
    if (b.strength <= a.strength) {
      throw new Error(`smaller-key-same-strength: initialData.levels[${i}].strength 가 앞 단보다 크지 않다`);
    }
  }
  return { type: 'smaller-key-same-strength', stepMs, levels };
}

/** 배율 — RSA ÷ 타원 곡선, 소수 첫째 자리. */
export function keyRatio(rsa: number, ecc: number): number {
  return Math.round((rsa * 10) / ecc) / 10;
}

export async function smallerKeySameStrength(
  ctx: FacetContext<SmallerKeySameStrengthFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SmallerKeySameStrengthFacetData>;
  const data = narrowSmallerKeyData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  for (let index = 0; index < data.levels.length; index += 1) {
    if (!(await pause())) return;
    const level = data.levels[index] as StrengthLevel;
    // 타원 곡선의 가장 좋은 공격은 군 크기의 제곱근만큼 든다 — 키 비트 = 2 × 강도.
    if (level.ecc !== 2 * level.strength) {
      throw new Error(
        `smaller-key-same-strength: levels[${index}] 타원 곡선 ${level.ecc} 비트가 강도 ${level.strength} 의 두 배가 아니다`,
      );
    }
    if (level.rsa <= level.ecc) {
      throw new Error(`smaller-key-same-strength: levels[${index}] RSA 가 타원 곡선보다 길지 않다`);
    }
    await rctx.emit({
      type: 'level',
      payload: {
        index,
        strength: level.strength,
        rsa: level.rsa,
        ecc: level.ecc,
        ratio: keyRatio(level.rsa, level.ecc),
        gap: level.rsa - level.ecc,
      },
    });
  }
}
