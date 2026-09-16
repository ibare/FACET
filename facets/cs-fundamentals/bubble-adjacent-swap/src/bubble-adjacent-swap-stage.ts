/**
 * bubble-adjacent-swap-stage — 인접 교환 조각의 전용 view.
 *
 * ── 이 화면이 무엇을 보이려 하는가
 *
 * 동사는 "떠오른다" 다. 그래서 화면에서 실제로 움직이는 것은 둘뿐이다.
 *
 *   1. **값 타일** — 칸(slot)은 제자리에 붙박여 있고 값만 옮겨 다닌다. 맞바꿈은 큰
 *      값이 **위로 떠올라 이웃을 넘어** 한 칸 오른쪽에 내려앉는 것으로 그린다. 멀리
 *      건너뛰는 그림이 아니라 옆칸 하나를 넘는 그림이다.
 *   2. **선두 표시와 그 자취** — 칸 아래를 달리는 삼각 표시. 견줌 한 번마다 **예외
 *      없이 한 칸** 오른쪽으로 간다. 맞바꿈이면 값을 데리고 가고, 그대로 두면 더 큰
 *      이웃에게 자리를 넘긴다. 어느 쪽이든 한 칸이다. 그 뒤로 자취선이 끊기지 않고
 *      이어져, 훑기가 끝나면 왼쪽 끝에서 오른쪽 끝까지 한 줄로 닿아 있다 — "찾는
 *      걸음 없이 도달했다" 의 증거다.
 *
 * ── 걸음마다 부르는 메서드를 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고, 되짚기가 앞으로 가기와 같은
 * 길을 탄다. 옮기기 전에는 `init` · `rewind` · `showCompare` · `carry` · `handOver`
 * · `settle` 여섯 메서드가 있었고 그중 되돌릴 수 있는 것은 하나도 없었다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는 장면의
 * `step` 이 실어 온 칸 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 채움과 테두리
 *
 * **채움은 값의 형편**(아직 도는 중 / 확정됨), **테두리는 견줌의 표식**이다. 값이
 * 자리를 옮기는 조각이라 고른 쪽을 채움으로 칠하면 맞바꾼 뒤 그 자리에 진 값이 앉아
 * 읽기가 뒤집힌다. 색 전환은 견줌 표시에만 쓰고 운동은 전부 위치 변화다 (S-piece).
 *
 * ── 세로
 *
 * 마운트 뒤 `viewBox` 를 다시 재지 않는다 (S-view). 칸 수가 몇이든 가로만 나뉘고
 * 세로는 고정이라, 글 안에 박혀도 위아래 문단이 밀리지 않는다.
 *
 * ── 뒷일
 *
 * 스스로 다음 회차를 예약하는 루프는 없다. 애니메이션 대기용 유한 프레임만 쓰며,
 * `destroy()` 가 그것들을 모두 걷고 대기 중인 약속을 풀어 준다 — 풀지 않으면 러너가
 * `reset()` 에서 알고리즘 종료를 기다리다 멈춘다 (S-piece).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다. 화면 문자는
 * 캡션뿐이고 전부 `params.t` 로 만든다 (C10). 칸에 적힌 값은 숫자 표식이라 문안이
 * 아니다.
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

import type { BubbleAdjacentSwapCaption, BubbleAdjacentSwapScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 고정값. 캡션 두 줄 + 칸 한 줄 + 선두 자취 한 줄. */
const H = 188;

/** 캡션 — 두 줄까지 자리를 잡아 두고 그 안에서 접는다. */
const CAP_Y1 = 20;
const CAP_Y2 = 38;
const CAP_SIDE = 24;

/** 칸이 놓이는 띠. */
const ROW_Y = 84;
const ROW_H = 62;

/** 맞바꿈에서 큰 값이 떠오르는 높이. */
const LIFT = 26;

/** 선두 표시(삼각형)와 그 자취선. */
const MARK_APEX_Y = 154;
const MARK_BASE_Y = 165;
const MARK_HALF = 7;
const TRAIL_Y = 171;
const TRAIL_W = 4;

/** 확정된 꼬리 영역. 위에서 이만큼 물러난 자리에서 내려온다. */
const TAIL_Y = 72;
const TAIL_H = 78;
const TAIL_DROP = 24;

/** 칸 폭은 캔버스에서 역산한다. 상수는 상한만 정한다 (S-piece). */
const CELL_MAX_W = 104;
const SIDE_MIN = 24;
const CELL_GAP = 8;

/** 견주는 짝이 서로 쪽으로 기울어지는 정도. */
const NUDGE = 4;

/** 테두리 — 기본 / 견주는 짝. 견줌은 **테두리**로만 말한다. */
const STROKE_PLAIN = 1.5;
const STROKE_COMPARING = 3;
/** 견주는 순간 테두리가 잠깐 부푸는 폭. */
const RING_SWELL = 2;

/**
 * 걸음마다의 운동 길이.
 *
 * `keep` 은 값이 하나도 안 움직여 얇은 걸음이 되기 쉬운 자리다. `stepMs` 를 올리면
 * 이미 긴 맞바꿈 걸음까지 함께 길어지므로, 그 걸음에만 선두가 넘어가는 운동을
 * 넉넉히 준다 — 걸음이 하는 말("선두만 넘어간다")과 같은 동사다 (S-piece 얇은 걸음).
 */
const MS_COMPARE = 260;
const MS_SWAP = 540;
const MS_KEEP = 280;
const MS_SETTLE = 340;

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** 타일 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type TileEl = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 글자 폭 어림. 브라우저 밖(테스트 DOM)에서는 `getComputedTextLength` 가 0 을
 * 주므로 잴 수 없다. 넓은 글자를 1, 라틴 문자를 0.55 로 어림하면 접는 자리를
 * 정하기에는 충분하다.
 */
function estimateWidth(text: string, px: number): number {
  let units = 0;
  for (const ch of text) units += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.55;
  return units * px;
}

/** 공백에서 두 줄까지 접는다. 넘치면 둘째 줄이 그대로 흘러넘친다. */
function wrapTwoLines(text: string, maxWidth: number, px: number): [string, string] {
  if (!text) return ['', ''];
  if (estimateWidth(text, px) <= maxWidth) return [text, ''];
  const words = text.split(' ');
  let first = '';
  let i = 0;
  while (i < words.length) {
    const candidate = first ? `${first} ${words[i]}` : words[i];
    if (first && estimateWidth(candidate, px) > maxWidth) break;
    first = candidate;
    i += 1;
  }
  return [first, words.slice(i).join(' ')];
}

export const bubbleAdjacentSwapStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BubbleAdjacentSwapScene> {
    const root = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    root.textContent = '';

    const capPx = Number.parseFloat(fontSizes.md);
    const capMaxW = PIECE_CANVAS_W - CAP_SIDE * 2;

    // ── 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 다시 짓는다.
    //    뒤에서 앞으로: 꼬리 영역 → 칸 → 값 타일 → 선두 → 캡션.
    const tailLayer = el('g');
    const slotLayer = el('g');
    const tileLayer = el('g');
    const leadLayer = el('g');
    const capLayer = el('g');
    root.append(tailLayer, slotLayer, tileLayer, leadLayer, capLayer);

    const capAttrs = {
      x: PIECE_CANVAS_W / 2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    };
    const cap1 = el('text', { ...capAttrs, y: CAP_Y1 });
    const cap2 = el('text', { ...capAttrs, y: CAP_Y2 });
    capLayer.append(cap1, cap2);

    // ── 기하. 칸 폭은 캔버스에서 역산하고 상수는 상한만 정한다 (S-piece).
    //    장면의 `origin` 길이가 칸 수를 정하므로 좌표는 장면에 담지 않는다.
    let count = 1;
    let pitch = CELL_MAX_W;
    let cellW = CELL_MAX_W - CELL_GAP;
    let originX = 0;

    function layout(n: number): void {
      count = Math.max(1, n);
      pitch = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / count));
      cellW = pitch - CELL_GAP;
      originX = Math.round((PIECE_CANVAS_W - pitch * count) / 2);
    }

    const slotX = (slot: number): number => originX + slot * pitch + CELL_GAP / 2;
    const slotCx = (slot: number): number => originX + slot * pitch + pitch / 2;

    // ── 이번 장면이 세운 DOM 손잡이. 장면이 아니라 그리기의 부산물이다.
    let tiles: TileEl[] = [];
    let trailEl: SVGLineElement | null = null;
    let markerEl: SVGPathElement | null = null;
    let tailEl: SVGGElement | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 타일도 선두도 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미
    // 새로 선 화면을 옛 장면으로 덮는다. 손잡이(`tiles` 등)도 매 그리기마다 새로
    // 대입되므로 옛 걸음 함수가 `await` 뒤에 그것을 읽으면 살아 있는 화면에 쓴다.
    // 그래서 `render` 첫머리에서 세대를 올리고, 운동은 자기 세대가 아니면 화면에
    // 손대지 않고 물러난다 (S-scene). `isInstant`·`onScrubStart` 는 장면 조각에서
    // 러너가 부르지 않으므로 빗장이 되지 못한다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 **한 시계**로 흐르게 한다. 세대가 지나면 손대지 않고 물러난다. */
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
        // 첫 프레임을 기다리지 않고 곧바로 출발 자리를 박는다 — 기다리면 정적
        // 그리기가 세운 **끝 자리**가 한 프레임 번쩍인다.
        tick();
      });
    }

    // ── 장면이 정하는 칠. 채움은 **값의 형편**, 테두리는 **견줌의 표식**이다.

    function isSettled(s: BubbleAdjacentSwapScene, slot: number): boolean {
      return s.settledFrom !== null && slot >= s.settledFrom;
    }

    /** 테두리 — 견줌의 표식. 칠하는 쪽과 부풀리는 쪽이 같은 함수를 지난다. */
    function strokeFor(s: BubbleAdjacentSwapScene, slot: number): { color: string; width: number } {
      const cmp = s.comparing;
      return cmp !== null && (slot === cmp.left || slot === cmp.right)
        ? { color: c.itemComparing, width: STROKE_COMPARING }
        : { color: c.border, width: STROKE_PLAIN };
    }

    function paintTile(tile: TileEl, s: BubbleAdjacentSwapScene, slot: number): void {
      // 채움 — 값의 형편. 아직 도는 중인가, 확정됐는가.
      const settled = isSettled(s, slot);
      tile.rect.setAttribute('fill', settled ? c.itemSorted : c.itemDefault);
      tile.label.setAttribute('fill', settled ? c.textInverse : c.text);
      // 테두리 — 견줌의 표식. 지금 견주고 있는 짝인가.
      const stroke = strokeFor(s, slot);
      tile.rect.setAttribute('stroke', stroke.color);
      tile.rect.setAttribute('stroke-width', String(stroke.width));
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function clear(): void {
      tailLayer.replaceChildren();
      slotLayer.replaceChildren();
      tileLayer.replaceChildren();
      leadLayer.replaceChildren();
      tiles = [];
      trailEl = null;
      markerEl = null;
      tailEl = null;
      cap1.textContent = '';
      cap2.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 확정된 꼬리와 선두의 자취선이 여기서 난다. 둘 다 **남는 강조**라 정적 경로에
     * 들어가야 되짚었을 때 살아남는다 (S-scene). 옮기기 전에는 꼬리가 `settledFrom`
     * 이라는 stage 변수에, 자취는 선의 `stroke-dashoffset` 속성에만 있었다.
     */
    function drawStatic(s: BubbleAdjacentSwapScene): void {
      layout(s.origin.length);

      // 확정된 꼬리. 아직 없으면 **짓지 않는다** — 숨겨 두면 앞 걸음의 속성이 함께
      // 남아 되짚기 판정이 어긋난다.
      if (s.settledFrom !== null && s.settledFrom < count) {
        const divider = originX + s.settledFrom * pitch;
        const zone = el('g');
        zone.append(
          el('rect', {
            x: divider,
            y: TAIL_Y,
            width: (count - s.settledFrom) * pitch,
            height: TAIL_H,
            rx: 8,
            fill: c.sortedTailBg,
          }),
          el('line', {
            x1: divider,
            y1: TAIL_Y,
            x2: divider,
            y2: TAIL_Y + TAIL_H,
            stroke: c.sortedTailBorder,
            'stroke-width': 1.5,
          }),
        );
        tailLayer.appendChild(zone);
        tailEl = zone;
      }

      // 붙박인 칸. 값이 오가도 이것은 움직이지 않는다.
      for (let i = 0; i < count; i += 1) {
        slotLayer.appendChild(
          el('rect', {
            x: slotX(i),
            y: ROW_Y,
            width: cellW,
            height: ROW_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
      }

      // 값 타일. 칸 번호가 자리를 정한다 — 이웃의 지금 좌표를 되읽지 않는다.
      for (let i = 0; i < count; i += 1) {
        const value = s.values[i];
        if (typeof value !== 'number') continue;
        const g = el('g');
        const rect = el('rect', {
          x: slotX(i),
          y: ROW_Y,
          width: cellW,
          height: ROW_H,
          rx: 6,
        });
        const label = el('text', {
          x: slotCx(i),
          y: ROW_Y + ROW_H / 2 + 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': '600',
        });
        // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
        label.textContent = String(value);
        g.append(rect, label);
        tileLayer.appendChild(g);
        const tile: TileEl = { g, rect, label };
        paintTile(tile, s, i);
        tiles[i] = tile;
      }

      // 선두의 자취. 0 번 칸에서 선두까지 한 줄. 아직 한 칸도 못 갔으면 짓지
      // 않는다 — 길이 0 짜리 선에 둥근 끝이 붙으면 점이 되어, 아직 나지 않은 길을
      // 미리 광고하는 꼴이 된다.
      if (s.lead > 0) {
        trailEl = el('line', {
          x1: slotCx(0),
          y1: TRAIL_Y,
          x2: slotCx(s.lead),
          y2: TRAIL_Y,
          stroke: c.risingMarker,
          'stroke-width': TRAIL_W,
          'stroke-linecap': 'round',
        });
        leadLayer.appendChild(trailEl);
      }

      // 선두 표시.
      const cx = slotCx(s.lead);
      markerEl = el('path', {
        d: `M ${cx} ${MARK_APEX_Y} L ${cx - MARK_HALF} ${MARK_BASE_Y} L ${cx + MARK_HALF} ${MARK_BASE_Y} Z`,
        fill: c.risingMarker,
      });
      leadLayer.appendChild(markerEl);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: BubbleAdjacentSwapCaption | null): void {
      const text = ((): string => {
        if (cap === null) return '';
        switch (cap.kind) {
          case 'compare':
            return tr('caption.compare', 'Compare {a} and {b} — only these two, side by side.', {
              a: cap.a,
              b: cap.b,
            });
          case 'swap':
            return tr(
              'caption.swap',
              '{big} is larger — it rises over its neighbour, one slot right.',
              { big: cap.big },
            );
          case 'keep':
            return tr('caption.keep', '{b} is already larger — nothing moves, and the lead is now {b}.', {
              b: cap.b,
            });
          case 'settled':
            return tr(
              'caption.settled',
              '{n} neighbour comparisons, and {max} is at the far right. No step ever went looking for it.',
              { n: cap.comparisons, max: cap.max },
            );
        }
      })();
      const [a, b] = wrapTwoLines(text, capMaxW, capPx);
      cap1.textContent = a;
      cap2.textContent = b;
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 `step` 이 실어 온 칸 번호에서
    //    셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).

    /**
     * 선두가 왼쪽 칸에서 오른쪽 칸으로 한 칸 간다. 자취선도 그만큼 늘어난다.
     *
     * 맞바꿈과 넘김이 함께 쓴다. 손잡이는 부르는 순간에 쥐어 두고, 그 뒤로는 자기
     * 것만 만진다.
     */
    function leadDraw(left: number, right: number): (p: number) => void {
      const mark = markerEl;
      const line = trailEl;
      const span = (right - left) * pitch;
      const tip = slotCx(right);
      return (p: number): void => {
        const lag = span * (1 - p);
        mark?.setAttribute('transform', `translate(${-lag} 0)`);
        line?.setAttribute('x2', String(tip - lag));
      };
    }

    /** 견주는 순간 — 두 칸이 서로 쪽으로 기울고 테두리가 잠깐 부풀었다 돌아온다. */
    function weigh(s: BubbleAdjacentSwapScene, left: number, right: number, mine: number): Promise<void> {
      const l = tiles[left];
      const r = tiles[right];
      if (!l || !r) return Promise.resolve();
      // 제 굵기는 장면에서 셈한다 — 화면을 도로 읽으면 되짚은 직후 값이 갈린다.
      const wl = strokeFor(s, left).width;
      const wr = strokeFor(s, right).width;
      return animate(MS_COMPARE, mine, (p) => {
        const k = Math.sin(p * Math.PI);
        l.g.setAttribute('transform', `translate(${NUDGE * k} 0)`);
        r.g.setAttribute('transform', `translate(${-NUDGE * k} 0)`);
        l.rect.setAttribute('stroke-width', String(wl + RING_SWELL * k));
        r.rect.setAttribute('stroke-width', String(wr + RING_SWELL * k));
      });
    }

    /**
     * 맞바꿈 — 큰 값이 떠올라 이웃을 넘고, 이웃은 그 밑으로 미끄러져 온다.
     *
     * 두 값과 선두가 **한 뜻으로** 움직인다. 시계를 나누면 lockstep 이 우연히 맞는
     * 꼴이 되고 하나를 `void` 로 흘릴 여지가 생기므로, 옮길 것을 한 그리기에 모아
     * **한 시계**로 흘린다 (S-scene).
     */
    function carry(left: number, right: number, mine: number): Promise<void> {
      const rising = tiles[right]; // 넘어간 값 — 정적 그리기가 이미 오른쪽에 세웠다.
      const sliding = tiles[left]; // 자리를 내준 값.
      if (!rising || !sliding) return Promise.resolve();
      // 넘어가는 쪽이 위로 그려져야 한다. 다음 정적 그리기가 순서를 되돌린다.
      tileLayer.appendChild(rising.g);
      const span = (right - left) * pitch;
      const lead = leadDraw(left, right);
      return animate(MS_SWAP, mine, (p) => {
        const lag = span * (1 - p);
        const arc = Math.sin(p * Math.PI) * LIFT;
        rising.g.setAttribute('transform', `translate(${-lag} ${-arc})`);
        sliding.g.setAttribute('transform', `translate(${lag} 0)`);
        lead(p);
      });
    }

    /** 넘김 — 값은 하나도 안 움직이고 선두만 한 칸 넘어간다. */
    function handOver(left: number, right: number, mine: number): Promise<void> {
      const lead = leadDraw(left, right);
      return animate(MS_KEEP, mine, lead);
    }

    /** 확정 — 꼬리 영역이 위에서 내려와 앉는다. */
    function settle(mine: number): Promise<void> {
      const zone = tailEl;
      if (!zone) return Promise.resolve();
      return animate(MS_SETTLE, mine, (p) => {
        zone.setAttribute('transform', `translate(0 ${-TAIL_DROP * (1 - p)})`);
        zone.setAttribute('opacity', String(p));
      });
    }

    function flow(s: BubbleAdjacentSwapScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'compare':
          return weigh(s, step.left, step.right, mine);
        case 'swap':
          return carry(step.left, step.right, mine);
        case 'keep':
          return handOver(step.left, step.right, mine);
        case 'settle':
          return settle(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 흐르며 얹힌 `transform` ·
     * `opacity` · 보간의 끝자리가 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이
     * 갈리지 않는다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 칸
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: BubbleAdjacentSwapScene,
      _prev: BubbleAdjacentSwapScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      clear();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      clear();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        // 캔버스 안쪽만 비운다. 컨테이너와 캔버스 자체는 러너 소유다 (S-view).
        root.textContent = '';
      },
    };
  },
};
