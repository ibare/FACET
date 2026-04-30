/**
 * 토큰화 (어휘 분석) facet 알고리즘 — ReactiveMechanism.
 *
 * 시그니처 행동: 좌→우로 한 글자씩 응시가 전진하면서 같은 종류 글자들을 한
 * 구간으로 길게 묶다가 더는 못 묶이는 순간 통째로 닫고, 그 구간을 종류 라벨과
 * 원문 값이 함께 새겨진 한 장의 카드로 떨궈 출력열에 붙인다.
 *
 * 진행 모델: 입력 반응형 + 자율 자동 시연. mount 직후 정적 init payload 가
 * 흐른 뒤, 같은 예제로 한 번 끝까지 스캔을 자동 재생한다 (한 글자 = 한 박자).
 * 스캔 종료 후 waitForInput 으로 다음 사용자 액션 (예제 전환, 재생, 리셋,
 * 속도 변경) 을 대기한다.
 *
 * 입력 (ReactiveMechanism, supportedControls = ['reset', 'speed', '*']):
 *   - next-example   payload?: unknown
 *                    예제 1·2·3 을 순환. 다음 예제 source 로 init 후 자동 스캔.
 *   - replay         payload?: unknown
 *                    현재 예제 처음부터 자동 스캔 재생.
 *
 *   reset 은 ReactiveMechanism 표준 — 알고리즘이 재실행되어 초기 예제로 돌아온다.
 *
 * 식별자 (C1):
 *   - `gaze`           응시 표식 자체 (단일 인스턴스, 위치만 변함).
 *   - `segment`        현재 자라고 있는 구간 박스 (단일 인스턴스).
 *   - `card:<index>`   출력 행에 안착한 토큰 카드 (인덱스로 식별).
 *
 * 이벤트 어휘 (모두 facet 로컬, StandardEventType 미포함):
 *   - init           payload: { source, exampleIndex, exampleName, examples,
 *                               kindPalette, gaze:0, segment:null, output:[] }
 *                    mount + reset + 예제 전환 시 1회. 도식 정적 상태 통보.
 *   - extend         target: 'segment'
 *                    payload: { gaze, segment: { start, end, kind } }
 *                    응시가 한 글자 전진해 구간이 한 칸 자랐다.
 *   - pending        target: 'segment'
 *                    payload: { gaze, segment: { start, end, kind } }
 *                    "최장 일치" 망설임 박자 — 한 글자 더 들여다본다.
 *                    구간 테두리가 잠시 점선으로 떠오른 상태.
 *   - swallow        target: 'gaze'
 *                    payload: { gaze, swallowedRange: { start, end },
 *                               kind: 'whitespace' | 'comment' }
 *                    공백·주석 구간을 통째로 회색으로 가라앉히고 응시는 그
 *                    구간을 건너뛴다. 카드 없음.
 *   - commit         target: `card:<index>`
 *                    payload: { tokenIndex, token: { start, end, kind, value },
 *                               gaze }
 *                    구간이 닫혀 한 장의 카드로 출력 행 끝에 안착한다.
 *   - promote        target: `card:<index>`
 *                    payload: { tokenIndex, fromKind: 'identifier',
 *                               toKind: 'keyword' }
 *                    직전 식별자 카드가 사전 대조를 거쳐 키워드로 갈아끼워진다.
 *   - error          target: `card:<index>`
 *                    payload: { tokenIndex, token: { start, end, kind: 'error',
 *                               value }, gaze }
 *                    인식 불가 글자 — 빨간 카드 1장 + 응시는 다음 시작점으로.
 *   - done           payload: { gaze, totalTokens }
 *                    스캔 종료. 카드 행 정렬 완료 표지.
 *   - example-set    payload: { exampleIndex, exampleName, source }
 *                    예제 전환 신호 (init 직전에 한 박자 보조 캡션용으로 사용).
 *   - invalid-input  payload: { op, raw }
 *
 *   메타 (silent):
 *   - phase          payload: { phase: 'idle' | 'scanning' | 'done' }
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type TokenKind =
  | 'keyword'
  | 'identifier'
  | 'number'
  | 'operator'
  | 'punct'
  | 'string'
  | 'error';

export type SwallowKind = 'whitespace' | 'comment';

export type Token = {
  start: number;
  end: number;
  kind: TokenKind;
  value: string;
};

export type TokenizationExample = {
  /** 예제 식별자 — 'basic' | 'compound' | 'comment' 등. */
  id: string;
  /** 사람이 읽는 짧은 이름. */
  name: { en: string; ko: string };
  /** 원시 소스 텍스트. */
  source: string;
};

export type KindPalette = Record<TokenKind | 'swallow', { swatch: string; label: { en: string; ko: string } }>;

export type TokenizationFacetData = {
  type: 'tokenization';
  /** 초기 노출 예제 인덱스. */
  initialExampleIndex: number;
  /** 예제 목록 (순환). */
  examples: TokenizationExample[];
  /** 한 박자 (한 글자 처리) 기본 시간 (ms). */
  stepMs: number;
  /** commit / swallow / error 박자에 곱하는 멈춤 비율 (1 이면 stepMs 동일). */
  closePulseRatio: number;
  /** 스캔 종료 후 다음 자동 재생까지 휴지 시간 (ms). */
  endHoldMs: number;
  /** 키워드 사전. */
  keywords: string[];
  /** 종류 색·라벨 팔레트 (범례 + 카드 색). */
  kindPalette: KindPalette;
};

export type TokenizationInputEvent =
  | { type: 'next-example'; payload?: unknown }
  | { type: 'replay'; payload?: unknown };

const KEYWORDS_DEFAULT = [
  'if',
  'else',
  'return',
  'var',
  'let',
  'const',
  'while',
  'for',
  'function',
  'true',
  'false',
  'null',
];

function isWhitespace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

function isAlpha(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isAlnum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

function isPunct(c: string): boolean {
  return c === ';' || c === ',' || c === '(' || c === ')' || c === '{' || c === '}' || c === '[' || c === ']';
}

function isOpStart(c: string): boolean {
  return (
    c === '=' ||
    c === '<' ||
    c === '>' ||
    c === '!' ||
    c === '+' ||
    c === '-' ||
    c === '*' ||
    c === '/' ||
    c === '%' ||
    c === '&' ||
    c === '|'
  );
}

/** 두 글자 연산자 후보. */
function twoCharOpExt(c0: string, c1: string): boolean {
  if ((c0 === '>' || c0 === '<' || c0 === '=' || c0 === '!') && c1 === '=') return true;
  if (c0 === '&' && c1 === '&') return true;
  if (c0 === '|' && c1 === '|') return true;
  return false;
}

export async function tokenization(
  ctxBase: FacetContext<TokenizationFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TokenizationFacetData>;
  const {
    examples,
    stepMs,
    closePulseRatio,
    endHoldMs,
    keywords,
    kindPalette,
  } = ctx.data;

  const keywordSet = new Set<string>(keywords.length > 0 ? keywords : KEYWORDS_DEFAULT);

  let exampleIndex = Math.max(0, Math.min(examples.length - 1, ctx.data.initialExampleIndex));

  async function emitInit(): Promise<void> {
    const ex = examples[exampleIndex]!;
    await ctx.emit({
      type: 'init',
      payload: {
        source: ex.source,
        exampleIndex,
        exampleName: ex.name,
        examples: examples.map((e) => ({ id: e.id, name: e.name })),
        kindPalette,
        gaze: 0,
        segment: null,
        output: [],
      },
    });
  }

  async function scanCurrent(): Promise<void> {
    if (ctx.cancelled) return;
    const ex = examples[exampleIndex]!;
    const source = ex.source;

    await ctx.emit({ type: 'phase', payload: { phase: 'scanning' }, silent: true });

    let i = 0;
    let tokenIndex = 0;
    const closeMs = stepMs * closePulseRatio;

    while (i < source.length) {
      if (ctx.cancelled) return;
      const c = source[i]!;

      // ── 공백 통째 삼킴 ────────────────────────────────────────────
      if (isWhitespace(c)) {
        const start = i;
        while (i < source.length && isWhitespace(source[i]!)) i += 1;
        await ctx.emit({
          type: 'swallow',
          target: 'gaze',
          payload: {
            gaze: i,
            swallowedRange: { start, end: i },
            kind: 'whitespace',
          },
        });
        const ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 한 줄 주석 삼킴 (// ...) ──────────────────────────────────
      if (c === '/' && source[i + 1] === '/') {
        const start = i;
        while (i < source.length && source[i] !== '\n') i += 1;
        await ctx.emit({
          type: 'swallow',
          target: 'gaze',
          payload: {
            gaze: i,
            swallowedRange: { start, end: i },
            kind: 'comment',
          },
        });
        const ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 식별자 / 키워드 ───────────────────────────────────────────
      if (isAlpha(c)) {
        const start = i;
        i += 1;
        await ctx.emit({
          type: 'extend',
          target: 'segment',
          payload: {
            gaze: i,
            segment: { start, end: i, kind: 'identifier' },
          },
        });
        let ok = await ctx.sleep(stepMs);
        if (!ok || ctx.cancelled) return;

        while (i < source.length && isAlnum(source[i]!)) {
          i += 1;
          await ctx.emit({
            type: 'extend',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'identifier' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
        }
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;

        await ctx.emit({
          type: 'commit',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'identifier', value },
            gaze: i,
          },
        });
        ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;

        if (keywordSet.has(value)) {
          await ctx.emit({
            type: 'promote',
            target: `card:${myIndex}`,
            payload: {
              tokenIndex: myIndex,
              fromKind: 'identifier',
              toKind: 'keyword',
            },
          });
          ok = await ctx.sleep(closeMs);
          if (!ok || ctx.cancelled) return;
        }
        continue;
      }

      // ── 숫자 (정수) ───────────────────────────────────────────────
      if (isDigit(c)) {
        const start = i;
        i += 1;
        await ctx.emit({
          type: 'extend',
          target: 'segment',
          payload: {
            gaze: i,
            segment: { start, end: i, kind: 'number' },
          },
        });
        let ok = await ctx.sleep(stepMs);
        if (!ok || ctx.cancelled) return;

        while (i < source.length && isDigit(source[i]!)) {
          i += 1;
          await ctx.emit({
            type: 'extend',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'number' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
        }
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;
        await ctx.emit({
          type: 'commit',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'number', value },
            gaze: i,
          },
        });
        ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 문자열 (간단 — 닫는 따옴표까지) ───────────────────────────
      if (c === '"') {
        const start = i;
        i += 1;
        await ctx.emit({
          type: 'extend',
          target: 'segment',
          payload: {
            gaze: i,
            segment: { start, end: i, kind: 'string' },
          },
        });
        let ok = await ctx.sleep(stepMs);
        if (!ok || ctx.cancelled) return;
        while (i < source.length && source[i] !== '"' && source[i] !== '\n') {
          i += 1;
          await ctx.emit({
            type: 'extend',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'string' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
        }
        if (source[i] === '"') {
          i += 1;
          await ctx.emit({
            type: 'extend',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'string' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
        }
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;
        await ctx.emit({
          type: 'commit',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'string', value },
            gaze: i,
          },
        });
        ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 연산자 (1~2글자, 최장 일치 망설임) ────────────────────────
      if (isOpStart(c)) {
        const start = i;
        i += 1;
        await ctx.emit({
          type: 'extend',
          target: 'segment',
          payload: {
            gaze: i,
            segment: { start, end: i, kind: 'operator' },
          },
        });
        let ok = await ctx.sleep(stepMs);
        if (!ok || ctx.cancelled) return;

        if (i < source.length && twoCharOpExt(c, source[i]!)) {
          // 망설임 한 박자 — 한 글자에서 끊을 뻔하다 한 칸 더 들여다본다.
          await ctx.emit({
            type: 'pending',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'operator' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
          i += 1;
          await ctx.emit({
            type: 'extend',
            target: 'segment',
            payload: {
              gaze: i,
              segment: { start, end: i, kind: 'operator' },
            },
          });
          ok = await ctx.sleep(stepMs);
          if (!ok || ctx.cancelled) return;
        }
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;
        await ctx.emit({
          type: 'commit',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'operator', value },
            gaze: i,
          },
        });
        ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 구분자 (한 글자) ──────────────────────────────────────────
      if (isPunct(c)) {
        const start = i;
        i += 1;
        await ctx.emit({
          type: 'extend',
          target: 'segment',
          payload: {
            gaze: i,
            segment: { start, end: i, kind: 'punct' },
          },
        });
        let ok = await ctx.sleep(stepMs * 0.7);
        if (!ok || ctx.cancelled) return;
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;
        await ctx.emit({
          type: 'commit',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'punct', value },
            gaze: i,
          },
        });
        ok = await ctx.sleep(closeMs);
        if (!ok || ctx.cancelled) return;
        continue;
      }

      // ── 알 수 없는 글자 → 오류 토큰 ───────────────────────────────
      {
        const start = i;
        i += 1;
        const value = source.slice(start, i);
        const myIndex = tokenIndex;
        tokenIndex += 1;
        await ctx.emit({
          type: 'error',
          target: `card:${myIndex}`,
          payload: {
            tokenIndex: myIndex,
            token: { start, end: i, kind: 'error', value },
            gaze: i,
          },
        });
        const ok = await ctx.sleep(closeMs * 1.4);
        if (!ok || ctx.cancelled) return;
      }
    }

    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'done',
      payload: { gaze: source.length, totalTokens: tokenIndex },
    });
    await ctx.emit({ type: 'phase', payload: { phase: 'done' }, silent: true });
  }

  // ── 1. 초기 통보 + 첫 자동 스캔 ──────────────────────────────────
  await emitInit();
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  if (ctx.cancelled) return;
  await scanCurrent();
  if (ctx.cancelled) return;
  const okFirst = await ctx.sleep(endHoldMs);
  if (!okFirst || ctx.cancelled) return;
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // ── 2. 입력 반응 루프 ──────────────────────────────────────────────
  for (;;) {
    if (ctx.cancelled) return;
    let ev: TokenizationInputEvent;
    try {
      ev = await ctx.waitForInput<TokenizationInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'next-example') {
      exampleIndex = (exampleIndex + 1) % examples.length;
      const ex = examples[exampleIndex]!;
      await ctx.emit({
        type: 'example-set',
        payload: { exampleIndex, exampleName: ex.name, source: ex.source },
      });
      await emitInit();
      if (ctx.cancelled) return;
      await scanCurrent();
      if (ctx.cancelled) return;
      const ok = await ctx.sleep(endHoldMs);
      if (!ok || ctx.cancelled) return;
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
      continue;
    }

    if (ev.type === 'replay') {
      await emitInit();
      if (ctx.cancelled) return;
      await scanCurrent();
      if (ctx.cancelled) return;
      const ok = await ctx.sleep(endHoldMs);
      if (!ok || ctx.cancelled) return;
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
      continue;
    }

    await ctx.emit({
      type: 'invalid-input',
      payload: { op: 'unknown', raw: String((ev as { type?: string }).type ?? '?') },
    });
  }
}
