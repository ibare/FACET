/**
 * compare-and-swap-stage — 자리와 값을 나눠 그리는 조각 stage.
 *
 * 짝마다 **자리** 둘(고정된 칸)과 **값** 둘(그 위에 얹힌 타일)을 그린다. 견주면
 * 값이 자리에서 살짝 들리고, 판정이 참일 때만 두 값이 동시에 호를 타고 엇갈려
 * 서로의 자리로 건너간다. 거짓이면 들렸던 값이 제 자리로 도로 내려앉는다 —
 * 옮김이 일어난 짝에만 호의 자취가 남으므로, 다 끝난 화면에서 "견줌 셋 중 하나만
 * 무언가를 옮겼다" 가 한눈에 보인다.
 *
 * 값의 크기를 막대 높이로 그리지 않는다. 이 조각이 말하려는 것은 크기의 대소가
 * 아니라 판정과 이동이 다른 동작이라는 것이다.
 *
 * ── 걸음마다 부르는 메서드를 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고, 되짚기가 앞으로 가기와 같은
 * 길을 탄다. 앞서 `Token.seat` 에 숨어 있던 "어느 칸에 어느 값이 앉았나" 는
 * 장면이 말한다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는
 * 장면의 처음 배치에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 채움과 테두리
 *
 * **채움은 값의 형편** — 들려 있다(itemComparing) / 건너가는 중이다(itemSwapping) /
 * 앉아 있다(itemDefault). 지나간다.
 * **테두리는 견줌의 표식** — 견주어진 짝의 **자리**가 점선을 벗고 실선이 된다.
 * 남는다. 표식을 값이 아니라 자리에 붙이는 것이 요점이다. 값에 붙이면 맞바꾼 뒤
 * 표식이 값을 따라가 읽기가 뒤집힌다.
 *
 * 화면에 그리는 문자는 값(숫자)과 판정 표식(`5 > 3`) 뿐이다. 수식·기호 표기는
 * 번역 대상이 아니므로 키를 만들지 않는다 (C10 표식/문안 판정 3번). 캡션 문안은
 * 여기서 `params.t` 로 만든다 — 문안은 `facet.ts` 의 `messages` 에 있다 (C10).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  hasCrossed,
  isJudged,
  orderAt,
  seatsOf,
  type CompareAndSwapCaption,
  type CompareAndSwapScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

// ── 크기는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece "그 폭을 채운다").
const GROUP_MAX_W = 190;
const GROUP_GAP = 40;
const SIDE_MIN = 22;
const TOKEN_MAX_W = 68;
const SEAT_GAP = 18;

// ── 세로는 내용이 정한다. 마운트 뒤로 바꾸지 않는다 (S-view).
const TOKEN_H = 44;
const TOP_PAD = 16;
/** 자리 중심에서 호 꼭대기까지. 두 값이 스치지 않고 지나가려면 타일 높이보다 커야 한다. */
const ARC_H = 38;
const GLYPH_DROP = 22;
const CAPTION_DROP = 34;
const BOTTOM_PAD = 14;

const SEAT_CY = TOP_PAD + TOKEN_H / 2 + ARC_H;
const GLYPH_Y = SEAT_CY + ARC_H + TOKEN_H / 2 + GLYPH_DROP;
const CAPTION_Y = GLYPH_Y + CAPTION_DROP;
const CANVAS_H = CAPTION_Y + BOTTOM_PAD;

/** 견줌이 값을 자리에서 들어올리는 높이. */
const LIFT = 8;
/** 판정 표식이 떠오르며 올라오는 높이. */
const GLYPH_RISE = 6;
const LIFT_MS = 240;
const CROSS_MS = 560;
const SETTLE_MS = 260;
/**
 * 마지막 걸음은 캡션만 바뀌어 흐를 것이 없다 — 벽시계가 `stepMs` 그대로라 앞뒤와
 * 구별되지 않는다. `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로, 그 걸음에만
 * 얇은 운동을 얹는다. 헤아리는 걸음이니 **헤아려지는 것**(판정 표식 셋)이 한 번
 * 부풀었다 돌아온다 — 이미 서 있던 것이라 나타나는 꼴이 아니라 부푸는 꼴이 맞다.
 */
const TALLY_MS = 260;
const TALLY_SWELL = 0.18;

/**
 * 자리의 테두리 — 아직 견주지 않은 자리(점선) / 견주어진 자리(실선).
 *
 * 견줌의 표식에 `itemComparing` 을 쓰지 않는다. 그 색은 채움에서 "지금 들려
 * 견주어지는 중" 을 뜻하므로, 같은 색을 테두리에 쓰면 "지금" 과 "이미" 가 한
 * 색으로 겹친다. 판정 표식(`5 > 3`)과 같은 `textMuted` 집안으로 묶는다.
 */
const SEAT_STROKE_PLAIN = 1.5;
const SEAT_STROKE_JUDGED = 2.5;

/** 호의 자취가 남는 짙기와, 건너가는 동안의 출발 짙기. */
const TRACE_OPACITY = 0.5;
const TRACE_FROM = 0.15;

/** 판정 표식 — 수식 기호라 번역하지 않는다 (C10). */
const SIGN = { greater: '>', less: '<', equal: '=' } as const;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** 이차 베지에 위의 한 점. 호를 그리는 path 와 값이 타는 경로가 같은 식을 쓴다. */
function quadAt(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

/** 값 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type TokenEl = { g: SVGGElement; tile: SVGRectElement; label: SVGTextElement };

export const compareAndSwapStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CompareAndSwapScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${CANVAS_H}`);

    // ── 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 다시 짓는다.
    //    호의 자취는 자리 위·값 아래에 둔다 — 자리 칸이 불투명이라 밑에 깔면
    //    호의 끝이 가려져 자리에서 떨어져 나간 것처럼 보인다.
    const seatsLayer = el('g');
    const tracesLayer = el('g');
    const glyphsLayer = el('g');
    const tokensLayer = el('g');
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.append(seatsLayer, tracesLayer, glyphsLayer, tokensLayer, captionText);

    // ── 기하. 짝의 수가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    //    그리기 전에 한 번에 셈해 둔다 — 그리면서 재면 순회 순서가 숨은 상태가 된다.
    let groupW = GROUP_MAX_W;
    let originX = 0;
    let tokenW = TOKEN_MAX_W;
    let half = 0;

    function layout(count: number): void {
      const n = Math.max(1, count);
      groupW = Math.min(GROUP_MAX_W, Math.floor((W - SIDE_MIN * 2 - GROUP_GAP * (n - 1)) / n));
      const totalW = groupW * n + GROUP_GAP * (n - 1);
      originX = Math.round((W - totalW) / 2);
      tokenW = Math.min(TOKEN_MAX_W, Math.floor((groupW - SEAT_GAP) / 2));
      half = (tokenW + SEAT_GAP) / 2;
    }

    function centerX(pair: number): number {
      return originX + pair * (groupW + GROUP_GAP) + groupW / 2;
    }
    function seatX(pair: number, seat: 0 | 1): number {
      return centerX(pair) + (seat === 0 ? -half : half);
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    let tokenEls = new Map<number, [TokenEl, TokenEl]>();
    let glyphEls = new Map<number, SVGTextElement>();
    let traceEls = new Map<number, SVGPathElement[]>();

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 값·표식·자취를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미
    // 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다.
     *
     * 기다리던 promise 는 `destroy` 가 깨운다 — 취소된 프레임은 아예 불리지 않으므로
     * 그 길이 없으면 `await render` 가 영영 돌아오지 않는다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    function place(token: TokenEl, x: number, y: number): void {
      token.g.setAttribute('transform', `translate(${x} ${y})`);
    }

    /** 값 하나를 담은 타일. 자리는 부르는 쪽이 정한다. */
    function makeToken(value: number, fill: string, ink: string): TokenEl {
      const g = el('g');
      const tile = el('rect', {
        x: -tokenW / 2,
        y: -TOKEN_H / 2,
        width: tokenW,
        height: TOKEN_H,
        rx: 8,
        fill,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0,
        y: 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: ink,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      label.textContent = String(value);
      g.append(tile, label);
      tokensLayer.appendChild(g);
      return { g, tile, label };
    }

    /** 채움은 **값의 형편**이다. 지나가는 것이라 짝의 결말이 나면 기본으로 돌아온다. */
    function fillFor(s: CompareAndSwapScene, pair: number): { fill: string; ink: string } {
      const f = s.focus;
      if (f !== null && f.pair === pair) {
        if (f.state === 'weighing') return { fill: c.itemComparing, ink: c.stateInk };
        if (f.state === 'crossed') return { fill: c.itemSwapping, ink: c.stateInk };
      }
      return { fill: c.itemDefault, ink: c.text };
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      seatsLayer.replaceChildren();
      tracesLayer.replaceChildren();
      glyphsLayer.replaceChildren();
      tokensLayer.replaceChildren();
      tokenEls = new Map();
      glyphEls = new Map();
      traceEls = new Map();
      captionText.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 자리 · 견줌의 표식 · 판정 표식 · 호의 자취 · 값이 모두 여기서 난다. 남는
     * 것(견주어진 자리 · 판정 표식 · 호의 자취)을 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: CompareAndSwapScene): void {
      layout(s.origin.length);

      for (let i = 0; i < s.origin.length; i += 1) {
        const judged = isJudged(s, i);
        const x0 = seatX(i, 0);
        const x1 = seatX(i, 1);

        // 자리 — 테두리가 **견줌의 표식**이다. 견주어진 짝은 점선을 벗는다.
        for (const x of [x0, x1]) {
          seatsLayer.appendChild(
            el('rect', {
              x: x - tokenW / 2,
              y: SEAT_CY - TOKEN_H / 2,
              width: tokenW,
              height: TOKEN_H,
              rx: 8,
              fill: c.bgSubtle,
              stroke: judged ? c.textMuted : c.ghostOutline,
              'stroke-width': judged ? SEAT_STROKE_JUDGED : SEAT_STROKE_PLAIN,
              ...(judged ? {} : { 'stroke-dasharray': '4 4' }),
            }),
          );
        }

        // 호의 자취 — 맞바꿈이 일어난 짝에만 남는다. 이 누적이 조각의 결론이다.
        if (hasCrossed(s, i)) {
          const mid = (x0 + x1) / 2;
          const arcs = [
            { from: x0, to: x1, apex: SEAT_CY - 2 * ARC_H },
            { from: x1, to: x0, apex: SEAT_CY + 2 * ARC_H },
          ].map((a) => {
            const path = el('path', {
              d: `M ${a.from} ${SEAT_CY} Q ${mid} ${a.apex} ${a.to} ${SEAT_CY}`,
              fill: 'none',
              stroke: c.itemSwapping,
              'stroke-width': 2,
              'stroke-linecap': 'round',
              opacity: TRACE_OPACITY,
            });
            tracesLayer.appendChild(path);
            return path;
          });
          traceEls.set(i, arcs);
        }

        // 판정 표식 — 견주었다는 사실과 그 답. 남는다.
        const order = orderAt(s, i);
        const origin = s.origin[i];
        if (judged && order !== null && origin !== undefined) {
          const glyph = el('text', {
            x: 0,
            y: 0,
            transform: `translate(${centerX(i)} ${GLYPH_Y})`,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: c.textMuted,
          });
          glyph.textContent = `${origin[0]} ${SIGN[order]} ${origin[1]}`;
          glyphsLayer.appendChild(glyph);
          glyphEls.set(i, glyph);
        }

        // 값 — 어느 칸에 어느 값이 앉았는지는 장면이 말한다.
        const seats = seatsOf(s, i);
        const { fill, ink } = fillFor(s, i);
        const lifted = s.focus !== null && s.focus.pair === i && s.focus.state === 'weighing';
        const y = SEAT_CY - (lifted ? LIFT : 0);
        const left = makeToken(seats[0], fill, ink);
        const right = makeToken(seats[1], fill, ink);
        place(left, x0, y);
        place(right, x1, y);
        tokenEls.set(i, [left, right]);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: CompareAndSwapCaption | null): void {
      if (cap === null) {
        captionText.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'compare':
          captionText.textContent = tr(
            'caption.compare',
            'Comparing {left} and {right} — the test itself moves nothing.',
            { left: cap.left, right: cap.right },
          );
          return;
        case 'swap':
          captionText.textContent = tr(
            'caption.swap',
            "Out of order, so the two values cross into each other's seats.",
            {},
          );
          return;
        case 'holdOrdered':
          captionText.textContent = tr(
            'caption.holdOrdered',
            'Already in order — the comparison ends there and nothing moves.',
            {},
          );
          return;
        case 'holdEqual':
          captionText.textContent = tr(
            'caption.holdEqual',
            'The two are equal — there is nothing to put in order.',
            {},
          );
          return;
        case 'summary':
          captionText.textContent = tr(
            'caption.summary',
            '{compares} comparisons, and only {swaps} of them moved anything.',
            { compares: cap.compares, swaps: cap.swaps },
          );
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 물려 놓고 시작한다. 출발 자리는 장면의 처음 배치에서 셈한다 —
    //    `prev` 에서 꺼내지 않는다 (S-scene).

    /** 견줌 — 두 값이 자리에서 들리고 판정 표식이 떠오른다. 아무것도 옮기지 않는다. */
    function weigh(pair: number, mine: number): Promise<void> {
      const tokens = tokenEls.get(pair);
      if (tokens === undefined) return Promise.resolve();
      const glyph = glyphEls.get(pair);
      const xs: [number, number] = [seatX(pair, 0), seatX(pair, 1)];
      const cx = centerX(pair);
      return animate(LIFT_MS, mine, (p) => {
        tokens.forEach((token, k) => place(token, xs[k], SEAT_CY - LIFT * p));
        if (glyph === undefined) return;
        glyph.setAttribute('opacity', String(p));
        glyph.setAttribute('transform', `translate(${cx} ${GLYPH_Y + GLYPH_RISE * (1 - p)})`);
      });
    }

    /**
     * 맞바꿈 — 두 값이 동시에 엇갈려 지나가 서로의 자리로 건너간다.
     *
     * 한 걸음에 둘이 움직이지만 **한 뜻의 운동**이라 시계를 둘로 나누지 않는다.
     * 옮길 것을 한 목록에 모아 한 시계로 흘린다 (S-scene).
     *
     * 지금 자리 1 에 앉은 값은 자리 0 에서 **위 호**를 타고 왔고, 자리 0 의 값은
     * 자리 1 에서 **아래 호**를 타고 왔다. 같은 순간에 세로로 갈려 있어야 스치지
     * 않는다.
     */
    function cross(pair: number, mine: number): Promise<void> {
      const tokens = tokenEls.get(pair);
      if (tokens === undefined) return Promise.resolve();
      const traces = traceEls.get(pair) ?? [];
      const x0 = seatX(pair, 0);
      const x1 = seatX(pair, 1);
      const mid = (x0 + x1) / 2;
      const moves = [
        { token: tokens[1], from: x0, to: x1, apex: SEAT_CY - 2 * ARC_H },
        { token: tokens[0], from: x1, to: x0, apex: SEAT_CY + 2 * ARC_H },
      ];
      return animate(CROSS_MS, mine, (p) => {
        const ink = String(TRACE_FROM + (TRACE_OPACITY - TRACE_FROM) * p);
        for (const path of traces) path.setAttribute('opacity', ink);
        for (const m of moves) {
          place(
            m.token,
            quadAt(m.from, mid, m.to, p),
            quadAt(SEAT_CY, m.apex, SEAT_CY, p) - LIFT * (1 - p),
          );
        }
      });
    }

    /** 견줬으나 옮길 이유가 없다 — 들렸던 값이 제 자리로 도로 내려앉는다. */
    function settle(pair: number, mine: number): Promise<void> {
      const tokens = tokenEls.get(pair);
      if (tokens === undefined) return Promise.resolve();
      const xs: [number, number] = [seatX(pair, 0), seatX(pair, 1)];
      return animate(SETTLE_MS, mine, (p) => {
        tokens.forEach((token, k) => place(token, xs[k], SEAT_CY - LIFT * (1 - p)));
      });
    }

    /** 헤아림 — 세어지는 것들(판정 표식)이 한 번 부풀었다 돌아온다. */
    function tally(mine: number): Promise<void> {
      const marks = [...glyphEls.entries()].map(([pair, glyph]) => ({ glyph, cx: centerX(pair) }));
      if (marks.length === 0) return Promise.resolve();
      return animate(TALLY_MS, mine, (p) => {
        const scale = 1 + Math.sin(p * Math.PI) * TALLY_SWELL;
        for (const m of marks) {
          m.glyph.setAttribute('transform', `translate(${m.cx} ${GLYPH_Y}) scale(${scale})`);
        }
      });
    }

    function flow(s: CompareAndSwapScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'weigh':
          return weigh(step.pair, mine);
        case 'cross':
          return cross(step.pair, mine);
        case 'settle':
          return settle(step.pair, mine);
        case 'tally':
          return tally(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(`opacity` · 부푼 `scale`)이 한꺼번에 사라져, 흐른 화면과 곧바로
     * 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 장면의 처음 배치에서
     * 셈한다 (S-scene).
     */
    async function render(
      next: CompareAndSwapScene,
      _prev: CompareAndSwapScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      /** rAF 만 쓴다. 예약된 프레임을 거두고 기다리던 promise 를 깨운다 (S-piece). */
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        captionText.remove();
        seatsLayer.remove();
        tracesLayer.remove();
        glyphsLayer.remove();
        tokensLayer.remove();
      },
    };
  },
};
