/**
 * font-swap — 이벤트.
 *
 *   first-paint     payload { atMs: number }  — site.css 도착. 본문 줄이 읽혔고
 *                   차단 스타일시트가 모두 도착한 첫 ms. 대체 글꼴로 그린다 (silent 아님)
 *   font-requested  payload { atMs: number }  — 첫 스타일 계산에서 문단이 Brand 를
 *                   쓴다는 것을 알아 그 순간 요청한다 (silent 아님)
 *   font-arrived    payload { atMs: number }  — brand.woff2 도착. 아직 다시 그리지
 *                   않는다 — 도착과 바꿔 그림은 같은 ms 의 다른 차례다 (silent 아님)
 *   repaint         payload { atMs: number }  — Brand 의 글자 폭으로 다시 놓는다
 *                   (silent 아님)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface FontSwapFacetData {
  type: 'font-swap';
  /** 문서 두 줄과 site.css 두 규칙 — 번역하지 않는 자료 (native). */
  linkTag: string;
  paragraphTag: string;
  fontFaceRule: string;
  paragraphRule: string;
  /** p 태그 속 낱말. 줄바꿈을 셈하는 단위 — 번역하지 않는다. */
  words: string[];
  boxWidthPx: number;
  fallbackCharPx: number;
  fallbackSpacePx: number;
  brandCharPx: number;
  brandSpacePx: number;
  cssFile: string;
  fontFile: string;
  cssArriveMs: number;
  fontArriveMs: number;
  stepMs: number;
}

const NUMERIC_FIELDS = [
  'boxWidthPx',
  'fallbackCharPx',
  'fallbackSpacePx',
  'brandCharPx',
  'brandSpacePx',
  'cssArriveMs',
  'fontArriveMs',
  'stepMs',
] as const;

const STRING_FIELDS = ['linkTag', 'paragraphTag', 'fontFaceRule', 'paragraphRule', 'cssFile', 'fontFile'] as const;

/**
 * 자료 모양을 확인한다 — algorithm · scene · stage 가 나눠 쓰는 한 벌.
 *
 * 모르는 모양을 조용히 지나치지 않는다 (C6) — 호스트가 준 `initialData` 가
 * 이 모양이 아니면 걸음이 줄어든 화면이 오류 없이 나오는 대신 여기서 던진다.
 */
export function toFontSwapData(raw: unknown): FontSwapFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('font-swap: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.words) || d.words.length === 0 || d.words.some((w) => typeof w !== 'string')) {
    throw new Error('font-swap: initialData.words 가 비지 않은 문자열 배열이 아니다');
  }
  for (const key of NUMERIC_FIELDS) {
    if (typeof d[key] !== 'number') throw new Error(`font-swap: initialData.${key} 가 수가 아니다`);
  }
  for (const key of STRING_FIELDS) {
    if (typeof d[key] !== 'string') throw new Error(`font-swap: initialData.${key} 가 문자열이 아니다`);
  }
  return {
    type: 'font-swap',
    linkTag: d.linkTag as string,
    paragraphTag: d.paragraphTag as string,
    fontFaceRule: d.fontFaceRule as string,
    paragraphRule: d.paragraphRule as string,
    words: [...(d.words as string[])],
    boxWidthPx: d.boxWidthPx as number,
    fallbackCharPx: d.fallbackCharPx as number,
    fallbackSpacePx: d.fallbackSpacePx as number,
    brandCharPx: d.brandCharPx as number,
    brandSpacePx: d.brandSpacePx as number,
    cssFile: d.cssFile as string,
    fontFile: d.fontFile as string,
    cssArriveMs: d.cssArriveMs as number,
    fontArriveMs: d.fontArriveMs as number,
    stepMs: d.stepMs as number,
  };
}

export interface WordLayout {
  lineIndex: number;
  xModelPx: number;
  widthModelPx: number;
}

export interface WrapLayout {
  words: WordLayout[];
  lineCount: number;
  lineWidthsModelPx: number[];
}

/**
 * 욕심 줄바꿈 — 낱말을 차례로 놓다가 (지금 줄 폭 + 빈칸 + 낱말 폭) 이 상자 폭을
 * 넘으면 새 줄. 폭은 여기서만 셈한다 — scene 은 이것을 부르지 않고 stage 가
 * 부른다. 바탕(낱말 · 글자 폭 · 상자 폭)에서 결정되는 셈이라 두 자리에서
 * 따로 세면 언젠가 갈린다.
 */
export function wrapLayout(
  words: readonly string[],
  charPx: number,
  spacePx: number,
  boxWidthPx: number,
): WrapLayout {
  const layout: WordLayout[] = [];
  const lineWidthsModelPx: number[] = [];
  let line = 0;
  let cursor = 0;
  for (const word of words) {
    const width = word.length * charPx;
    if (width > boxWidthPx) {
      throw new Error(`font-swap: 낱말이 상자 폭보다 넓다: ${word}`);
    }
    const needed = cursor === 0 ? width : cursor + spacePx + width;
    if (needed <= boxWidthPx) {
      layout.push({ lineIndex: line, xModelPx: cursor === 0 ? 0 : cursor + spacePx, widthModelPx: width });
      cursor = needed;
    } else {
      lineWidthsModelPx.push(cursor);
      line += 1;
      layout.push({ lineIndex: line, xModelPx: 0, widthModelPx: width });
      cursor = width;
    }
  }
  lineWidthsModelPx.push(cursor);
  return { words: layout, lineCount: line + 1, lineWidthsModelPx };
}

interface FontSwapTimeline {
  cssArrivesAt: number;
  firstPaintAt: number;
  fontRequestedAt: number;
  fontArrivesAt: number;
}

/**
 * 이 조각의 문서는 두 줄뿐이다 (link · p). common.md 의 모형대로 줄 하나를
 * 10ms 에 읽고, 요청은 줄 끝에 나가고, 첫 장은 본문 줄이 읽혔고 차단
 * 스타일시트가 도착한 가장 이른 ms 다. 글꼴은 CSS 안에서만 불리므로 첫
 * 스타일 계산 = 첫 장의 ms 에 요청된다.
 */
function computeTimeline(data: FontSwapFacetData): FontSwapTimeline {
  const PARSE_MS = 10;
  const linkParsedAt = PARSE_MS;
  const cssArrivesAt = linkParsedAt + data.cssArriveMs;
  const bodyParsedAt = linkParsedAt + PARSE_MS;
  const firstPaintAt = Math.max(cssArrivesAt, bodyParsedAt);
  const fontRequestedAt = firstPaintAt;
  const fontArrivesAt = fontRequestedAt + data.fontArriveMs;
  return { cssArrivesAt, firstPaintAt, fontRequestedAt, fontArrivesAt };
}

/** 걸음 사이의 문 — 취소를 함께 진다 (C8). */
async function pause(ctx: ReactiveContext<FontSwapFacetData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return (await ctx.sleep(ms)) && !ctx.cancelled;
}

export async function fontSwap(ctx: FacetContext<FontSwapFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<FontSwapFacetData>;
  const data = toFontSwapData(rc.data);
  const timeline = computeTimeline(data);

  // 걸음 0(빔)은 scene.initial 이 이미 채운다 — 여기서는 첫 사건부터 발신한다.
  if (!(await pause(rc, data.stepMs))) return;
  await rc.emit({ type: 'first-paint', payload: { atMs: timeline.firstPaintAt } });

  if (!(await pause(rc, data.stepMs))) return;
  await rc.emit({ type: 'font-requested', payload: { atMs: timeline.fontRequestedAt } });

  if (!(await pause(rc, data.stepMs))) return;
  await rc.emit({ type: 'font-arrived', payload: { atMs: timeline.fontArrivesAt } });

  if (!(await pause(rc, data.stepMs))) return;
  await rc.emit({ type: 'repaint', payload: { atMs: timeline.fontArrivesAt } });
}
