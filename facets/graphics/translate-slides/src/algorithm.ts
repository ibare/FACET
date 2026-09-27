/**
 * translate-slides — 도형을 옮기면 도형의 점들은 저마다 얼마나 움직이는가.
 *
 * 삼각형을 옮김 차례대로 이어 옮긴다 (p' = p + 옮김, 앞 걸음의 자리에서 이어서).
 * 옮김 벡터는 데이터의 값을 베끼지 않고, 꼭짓점마다 (새 자리 − 앞 자리) 로 셈해 싣는다.
 * 좌표계는 x 오른쪽 · y 위다.
 *
 * 이벤트 (발신 순서)
 *
 * - `init` (silent) — 바탕. 걸음 0 을 갈아 끼운다.
 *   payload: {
 *     frame: { minX: number; maxX: number; minY: number; maxY: number };  // 거쳐 갈 모든 자리의 범위
 *     slideCount: number;                                                // 옮김 수
 *   }
 * - `slide` — 한 걸음 = 옮김 하나.
 *   payload: {
 *     index: number;                                    // 1 부터
 *     from: { id: string; x: number; y: number }[];     // 옮기기 전 자리 (앞 걸음의 끝 자리)
 *     at: { id: string; x: number; y: number }[];       // 옮긴 뒤 자리
 *     moved: { id: string; dx: number; dy: number }[];  // 꼭짓점마다 잰 이번 옮김 (at − from)
 *     fromStart: { id: string; dx: number; dy: number }[];  // 꼭짓점마다 잰 처음 자리부터의 옮김 (at − 처음)
 *   }
 *
 * ctx.metric 은 부르지 않는다. 자동 재생을 마치면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Corner = { id: string; x: number; y: number };
export type Shift = { dx: number; dy: number };
export type CornerShift = { id: string } & Shift;
export type Frame = { minX: number; maxX: number; minY: number; maxY: number };

export type TranslateSlidesFacetData = {
  type: 'translate-slides';
  stepMs: number;
  /** 삼각형 꼭짓점 — 식별자와 처음 자리 */
  corners: Corner[];
  /** 옮김 차례 */
  slides: Shift[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`translate-slides: ${path} 는 유한한 수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** 자료 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowTranslateSlidesData(raw: unknown): TranslateSlidesFacetData {
  if (!isRecord(raw)) throw new Error('translate-slides: 자료가 객체가 아니다');
  if (raw.type !== 'translate-slides') {
    throw new Error(`translate-slides: type 이 'translate-slides' 가 아니다 (받은 값 ${String(raw.type)})`);
  }
  const stepMs = finite(raw.stepMs, 'stepMs');
  if (stepMs < 0) throw new Error('translate-slides: stepMs 는 음수일 수 없다');
  if (!Array.isArray(raw.corners)) throw new Error('translate-slides: corners 가 배열이 아니다');
  if (raw.corners.length < 3) throw new Error('translate-slides: corners 는 셋 이상이어야 한다');
  const seen = new Set<string>();
  const corners: Corner[] = raw.corners.map((c: unknown, i: number) => {
    if (!isRecord(c)) throw new Error(`translate-slides: corners[${i}] 가 객체가 아니다`);
    if (typeof c.id !== 'string' || c.id === '') {
      throw new Error(`translate-slides: corners[${i}].id 가 빈 문자열이거나 문자열이 아니다`);
    }
    if (seen.has(c.id)) throw new Error(`translate-slides: corners[${i}].id '${c.id}' 가 겹친다`);
    seen.add(c.id);
    return { id: c.id, x: finite(c.x, `corners[${i}].x`), y: finite(c.y, `corners[${i}].y`) };
  });
  if (!Array.isArray(raw.slides)) throw new Error('translate-slides: slides 가 배열이 아니다');
  if (raw.slides.length === 0) throw new Error('translate-slides: slides 가 비었다');
  const slides: Shift[] = raw.slides.map((s: unknown, i: number) => {
    if (!isRecord(s)) throw new Error(`translate-slides: slides[${i}] 가 객체가 아니다`);
    return { dx: finite(s.dx, `slides[${i}].dx`), dy: finite(s.dy, `slides[${i}].dy`) };
  });
  return { type: 'translate-slides', stepMs, corners, slides };
}

/** p' = p + 옮김 — 꼭짓점 하나를 옮긴다. */
function slideCorner(p: Corner, shift: Shift): Corner {
  return { id: p.id, x: p.x + shift.dx, y: p.y + shift.dy };
}

/** 두 자리 사이를 꼭짓점마다 잰다 (뒤 − 앞). */
function measure(before: Corner[], after: Corner[]): CornerShift[] {
  return after.map((q, i) => {
    const p = before[i];
    if (!p || p.id !== q.id) throw new Error(`translate-slides: 꼭짓점 ${q.id} 의 짝이 없다`);
    return { id: q.id, dx: q.x - p.x, dy: q.y - p.y };
  });
}

export async function translateSlides(ctx: FacetContext<TranslateSlidesFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<TranslateSlidesFacetData>;
  const data = narrowTranslateSlidesData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const start = data.corners.map((c) => ({ ...c }));

  // 거쳐 갈 자리를 먼저 모두 셈한다 — 무대의 범위가 여기서 나온다.
  const places: Corner[][] = [start];
  for (const shift of data.slides) {
    const last = places[places.length - 1]!;
    places.push(last.map((p) => slideCorner(p, shift)));
  }
  const all = places.flat();
  const frame: Frame = {
    minX: Math.min(...all.map((p) => p.x)),
    maxX: Math.max(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxY: Math.max(...all.map((p) => p.y)),
  };

  await rctx.emit({
    type: 'init',
    payload: { frame, slideCount: data.slides.length },
    silent: true,
  });

  // 걸음 0 은 이미 읽을 것이 있는 화면(처음 자리의 삼각형)이라 한 번 머문다.
  if (!(await pause())) return;

  for (let i = 1; i < places.length; i += 1) {
    if (rctx.cancelled) return;
    const from = places[i - 1]!;
    const at = places[i]!;
    await rctx.emit({
      type: 'slide',
      payload: {
        index: i,
        from: from.map((p) => ({ ...p })),
        at: at.map((p) => ({ ...p })),
        moved: measure(from, at),
        fromStart: measure(start, at),
      },
    });
    if (!(await pause())) return;
  }
}
