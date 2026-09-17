/**
 * conflict-miss stage view — 충돌 실패를 그리는 전용 캔버스.
 *
 * 장면(Scene) 방식이다. 걸음마다 부르는 메서드를 두지 않고 `render(next, prev,
 * {animate})` 하나로 산다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사는 **밀어낸다** 이다. 하나가 들어올 때마다 다른 하나가 쫓겨난다. 그래서
 * 캐시의 줄을 가로로 눕히지 않고 **세로 기둥 넷**으로 세웠다.
 *
 *   - 들어오는 주소는 위에서 대기하다가 **가로로 미끄러져** 자기 인덱스의
 *     기둥 위로 간다. 여섯 번 모두 같은 기둥으로 간다 — 그 반복이 논증이다.
 *   - 그 다음 **아래로 내려앉으면서**, 살던 것을 기둥 **아래로 밀어낸다.**
 *     둘이 같은 방향으로 함께 움직이므로 밀려나는 것으로 읽힌다.
 *   - 나머지 기둥 셋은 처음부터 끝까지 점선인 채로 **내내 비어 있다.** 바로
 *     그 곁에 "빈 줄" 셈을 놓아, 자리가 모자란 것이 아님을 같은 눈길에 담는다.
 *
 * ── 이행이 화면에 보탠 것 — 판정의 자취
 *
 * 옛 화면은 조각의 결론 절반을 걸음마다 지우고 있었다. 밀려난 것은 기둥 아래에
 * 쌓여 남았지만 **판정(MISS)은 다음 걸음에 지워졌고 `done` 에서 아예 거두어졌다.**
 * 그래서 다 끝난 화면은 "지금 이게 들어 있다" 만 말하고 왜 계속 빗나가는지를
 * 말하지 못했다 — 그 수는 캡션 문장에만 있었다.
 *
 * 캔버스 아래에 **판정의 띠**를 두었다. 찾은 차례대로 주소 하나에 칸 하나이고,
 * 칸의 칠이 그 접근의 판정이다. 완주하면 여섯 칸이 모두 같은 칠로 서서 "여섯 번
 * 물어 여섯 번 다 빗나갔다" 를 그림이 말한다. 캡션의 수도 이 띠와 **같은 훑기**
 * (`replayOf`) 에서 나온다.
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 한 축에 두 뜻을 싣지 않는다.
 *
 *   - **채움** = 값의 형편. 타일이 있으면 그 줄에 무엇이 앉아 있는 것이고, 없으면
 *     비어 있다 (`—`). 밀려난 조각은 점선 테두리뿐이라 살아 있는 타일과 어휘가
 *     갈린다.
 *   - **테두리** = 물음의 표식. **물음이 온 적 있는 줄**만 실선 강조를 두르고
 *     나머지는 점선으로 남는다. 옛 화면은 이 자리에 "차 있나" 를 실어 `seated`
 *     배열과 같은 말을 두 번 하고 있었다. 완주 화면에서 기둥 하나만 둘러진 채
 *     서는 것이 이 조각의 주장 그 자체다 — **물음은 언제나 그 줄 하나로만 갔다.**
 *
 * ── 자리
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않는다. 세로만 이 파일이
 * 상수로 갖고, 마운트한 뒤로는 바꾸지 않는다 (S-view). 기둥 너비도 조각 너비도
 * 띠 칸 너비도 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece: 그 폭을 채운다).
 * 띠 칸 수는 **선언의 주소 수**가 정한다 — 지금까지 드러난 수로 정하면 칸이 하나
 * 늘 때마다 앞 칸들의 너비가 통째로 갈린다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  askedLinesOf,
  emptyIndicesOf,
  evictedByLineOf,
  hitCountOf,
  replayOf,
  type CacheReplay,
  type ConflictMissScene,
  type ConflictMissStep,
} from './scene.js';

/** 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 286;

const W = PIECE_CANVAS_W;

// ── 가로 배치 (너비는 캔버스에서 역산하고 상수는 상한만)
const COL_MAX_W = 124;
const SIDE_MIN = 26;
const COL_GAP = 14;
const CHIP_MAX_W = 26;
const TRAIL_MAX_W = 46;
const TRAIL_GAP = 6;

// ── 세로 배치
const WAIT_Y = 14; // 들어오는 타일이 기다리는 높이
const TILE_H = 34;
const FRAME_Y = 74;
const FRAME_H = 94;
const HEAD_BASELINE = 92; // 인덱스 숫자
const SLOT_Y = 100;
const SLOT_H = 50;
const SEATED_Y = 108; // 줄에 앉은 타일의 높이
const EXIT_Y = 190; // 밀려난 타일이 프레임 밖으로 빠지는 높이
const BRACE_TOP = 172;
const BRACE_Y = 181;
const CHIP_Y = 182;
const CHIP_H = 20;
const EMPTY_BASELINE = 199;
const PUSHED_BASELINE = 218;
const TRAIL_Y = 230; // 판정의 띠
const TRAIL_H = 20;
const CAPTION_BASELINE = 270;

// ── 걸음의 길이. 걸음 벽시계 = 운동 + stepMs (S-piece).
const ROUTE_MS = 260;
const DROP_MS = 380;
/**
 * 마지막 걸음이 띠를 훑는 시간.
 *
 * `done` 은 구조를 바꾸지 않아 흐를 것이 없고, 그대로 두면 걸음 벽시계가
 * `stepMs` 뿐이라 800ms 아래로 떨어진다 (S-piece 의 얇은 걸음). `stepMs` 를
 * 올리면 이미 긴 접근 걸음이 함께 길어지므로, 그 걸음이 하는 말과 **같은 동사**
 * — 쌓인 판정을 훑어 센다 — 로 얇은 운동 하나를 얹는다.
 */
const TALLY_MS = 280;

/** 도형에 새겨진 판정 글리프 — 번역하지 않는다 (C10 표식). */
const STAMP_MISS = 'MISS';
const STAMP_HIT = 'HIT';
/** 빈 줄에 놓는 표식. */
const EMPTY_MARK = '—';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function glyph(content: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

function move(node: SVGElement, x: number, y: number): void {
  node.setAttribute('transform', `translate(${x} ${y})`);
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * 타일의 형편. 옛 stage 는 이 이름을 선언해 두고 값은 어디에도 저장하지 않아
 * `rect` 의 `fill` 에만 형편이 있었고, 그것을 고치려고 DOM 구조를 도로 읽었다.
 * 지금은 장면에서 매번 정해져 조각으로 넘어온다.
 */
type Tone = 'incoming' | 'seated' | 'leaving';

/** 타일의 부품. 손잡이를 쥐고 있으므로 색을 고치려고 DOM 을 되읽지 않는다. */
type TileParts = {
  g: SVGGElement;
  box: SVGRectElement;
  addr: SVGTextElement;
  tagText: SVGTextElement;
};

/** 캔버스에서 역산한 자리. 그리기 전에 **한 번에** 셈한다. */
type Layout = {
  lineCount: number;
  colW: number;
  gridW: number;
  originX: number;
  tileW: number;
  waitX: number;
  trailW: number;
  trailX0: number;
  colX(i: number): number;
  colCx(i: number): number;
  seatX(i: number): number;
  trailX(i: number): number;
};

/** 정적 그리기가 세운 것들. 운동이 만질 손잡이를 여기서 받는다. */
type Drawn = {
  layout: Layout;
  replay: CacheReplay;
  seats: Map<number, TileParts>;
  slots: Map<number, SVGRectElement>;
  badge: SVGGElement | null;
  lastChip: SVGGElement | null;
  lastTrail: SVGGElement | null;
};

export const conflictMissStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ConflictMissScene> {
    void container; // 러너가 캔버스를 이미 붙였다 — 컨테이너는 건드리지 않는다 (S-view).

    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    const root = el('g');
    params.canvas.appendChild(root);

    // ── 층. 전부 정적 그리기가 매번 다시 채운다 — 재건 밖에 남는 요소가 없다.
    const gFrame = el('g');
    const gChips = el('g');
    const gBrace = el('g');
    const gTiles = el('g');
    const gBadge = el('g');
    const gTrail = el('g');
    const gSums = el('g');
    const gFlow = el('g'); // 운동 동안에만 서는 것 (길잡이 · 훑개)
    const gCaption = el('g');
    root.append(gFrame, gChips, gBrace, gTiles, gBadge, gTrail, gSums, gFlow, gCaption);

    const layers = [gFrame, gChips, gBrace, gTiles, gBadge, gTrail, gSums, gFlow, gCaption];

    // ── 애니메이션 자원. destroy 가 기다리던 것을 반드시 푼다 (S-piece).

    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 `destroy` 가 끼어들면 남은
     * 프레임이 이미 사라진 화면에 쓰므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(ms: number, mine: number, draw: (e: number) => void): Promise<void> {
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
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(ease(p));
          if (p >= 1) {
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

    // ── 자리 셈 ───────────────────────────────────────────────────────────
    //
    // **자리를 먼저 한 번에 셈하고 그 다음에 그린다.** 그리면서 이웃의 지금
    // 좌표를 재면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).

    function layoutOf(scene: ConflictMissScene): Layout {
      const lineCount = Math.max(1, scene.lineCount);
      const colW = Math.min(
        COL_MAX_W,
        Math.floor((W - SIDE_MIN * 2 - COL_GAP * (lineCount - 1)) / lineCount),
      );
      const gridW = colW * lineCount + COL_GAP * (lineCount - 1);
      const originX = Math.round((W - gridW) / 2);

      // 띠 칸 수는 선언의 주소 수가 정한다 — 지금까지 드러난 수로 정하면 칸이
      // 하나 늘 때마다 앞 칸들의 너비가 통째로 갈린다.
      const slots = Math.max(1, scene.addresses.length);
      const trailW = Math.min(
        TRAIL_MAX_W,
        Math.floor((W - SIDE_MIN * 2 - TRAIL_GAP * (slots - 1)) / slots),
      );
      const trailRowW = trailW * slots + TRAIL_GAP * (slots - 1);
      const trailX0 = Math.round((W - trailRowW) / 2);

      return {
        lineCount,
        colW,
        gridW,
        originX,
        tileW: colW - 16,
        waitX: Math.round(W * 0.52),
        trailW,
        trailX0,
        colX: (i) => originX + i * (colW + COL_GAP),
        colCx: (i) => originX + i * (colW + COL_GAP) + colW / 2,
        seatX: (i) => originX + i * (colW + COL_GAP) + 8,
        trailX: (i) => trailX0 + i * (trailW + TRAIL_GAP),
      };
    }

    // ── 조각들 ────────────────────────────────────────────────────────────

    function paintTile(parts: TileParts, next: Tone): void {
      const fill =
        next === 'incoming' ? c.itemActive : next === 'leaving' ? c.itemSwapping : c.itemDefault;
      const ink = next === 'seated' ? c.text : c.stateInk;
      parts.box.setAttribute('fill', fill);
      parts.box.setAttribute('stroke', next === 'seated' ? c.border : fill);
      parts.addr.setAttribute('fill', ink);
      parts.tagText.setAttribute('fill', ink);
    }

    function makeTile(layout: Layout, address: number, tag: number, next: Tone): TileParts {
      const g = el('g');
      const box = el('rect', {
        width: layout.tileW,
        height: TILE_H,
        rx: 6,
        'stroke-width': 1,
      });
      const addr = glyph(`addr ${address}`, {
        x: 9,
        y: 15,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      const tagText = glyph(`tag ${tag}`, {
        x: 9,
        y: 27,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        opacity: 0.75,
      });
      g.append(box, addr, tagText);
      const parts: TileParts = { g, box, addr, tagText };
      paintTile(parts, next);
      return parts;
    }

    /**
     * 줄의 테두리 — **물음의 표식**이다. 채움(무엇이 앉아 있나)은 타일이 말한다.
     * 두 축을 갈라 두면 밀려나는 동안에도 읽기가 뒤집히지 않는다.
     */
    function dressSlot(rect: SVGRectElement, asked: boolean): void {
      rect.setAttribute('stroke', asked ? c.itemComparing : c.border);
      rect.setAttribute('stroke-width', asked ? '2' : '1');
      rect.setAttribute('stroke-dasharray', asked ? 'none' : '4 4');
    }

    function makeEmptyMark(layout: Layout, i: number): SVGTextElement {
      return glyph(EMPTY_MARK, {
        x: layout.colCx(i),
        y: SLOT_Y + SLOT_H / 2 + 6,
        fill: c.textMuted,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
    }

    /** 들어오는 타일이 지날 길 — 언제나 같은 기둥으로 꺾인다. */
    function makeGuide(layout: Layout, index: number): SVGGElement {
      const g = el('g');
      const fromX = layout.waitX + layout.tileW / 2;
      const toX = layout.colCx(index);
      const midY = WAIT_Y + TILE_H / 2;
      g.appendChild(
        el('path', {
          d: `M ${fromX} ${midY} H ${toX} V ${SLOT_Y - 6}`,
          fill: 'none',
          stroke: c.auxCursor,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
          opacity: 0.8,
        }),
      );
      g.appendChild(
        el('polygon', {
          points: `${toX - 5},${SLOT_Y - 12} ${toX + 5},${SLOT_Y - 12} ${toX},${SLOT_Y - 3}`,
          fill: c.auxCursor,
          opacity: 0.8,
        }),
      );
      return g;
    }

    function makeStamp(layout: Layout, index: number, hit: boolean): SVGGElement {
      const g = el('g');
      const w = 44;
      const x = layout.colX(index) + 4;
      g.appendChild(
        el('rect', {
          x,
          y: 84,
          width: w,
          height: 18,
          rx: 4,
          fill: hit ? c.success : c.danger,
        }),
      );
      g.appendChild(
        glyph(hit ? STAMP_HIT : STAMP_MISS, {
          x: x + w / 2,
          y: 97,
          fill: hit ? c.textInverse : c.stateInk,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }),
      );
      return g;
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 장면이 말하는 것을 **전부** 세운다. 앞 화면과 견주어 달라진 것만 고치지
    // 않으므로 어느 걸음에서 오든 결과가 같다 (S-scene).

    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    function drawStatic(scene: ConflictMissScene): Drawn {
      rewind();

      const layout = layoutOf(scene);
      const replay = replayOf(scene);
      const asked = askedLinesOf(replay);
      const evicted = evictedByLineOf(replay);
      const empties = emptyIndicesOf(replay);
      const last = replay.verdicts[replay.verdicts.length - 1] ?? null;

      // 틀과 인덱스 머리
      gFrame.appendChild(
        el('rect', {
          x: layout.originX - 10,
          y: FRAME_Y,
          width: layout.gridW + 20,
          height: FRAME_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      gFrame.appendChild(
        glyph('index', {
          x: layout.originX,
          y: FRAME_Y - 8,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }),
      );

      const slots = new Map<number, SVGRectElement>();
      for (let i = 0; i < layout.lineCount; i += 1) {
        gFrame.appendChild(
          glyph(String(i), {
            x: layout.colCx(i),
            y: HEAD_BASELINE,
            fill: c.textMuted,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          }),
        );

        const slot = el('rect', {
          x: layout.colX(i) + 4,
          y: SLOT_Y,
          width: layout.colW - 8,
          height: SLOT_H,
          rx: 6,
          fill: 'none',
        });
        dressSlot(slot, asked.has(i));
        gFrame.appendChild(slot);
        slots.set(i, slot);

        // 아직 없는 것은 숨기지 말고 짓지 않는다.
        if ((replay.lines[i] ?? null) === null) gFrame.appendChild(makeEmptyMark(layout, i));
      }

      // 줄에 앉은 것
      const seats = new Map<number, TileParts>();
      for (let i = 0; i < layout.lineCount; i += 1) {
        const resident = replay.lines[i] ?? null;
        if (resident === null) continue;
        const parts = makeTile(layout, resident.address, resident.tag, 'seated');
        move(parts.g, layout.seatX(i), SEATED_Y);
        gTiles.appendChild(parts.g);
        seats.set(i, parts);
      }

      // 밀려난 것 — 사라지지 않고 기둥 아래에 쌓인다. 점선 테두리뿐이라
      // 살아 있는 타일과 어휘가 갈린다.
      let lastChip: SVGGElement | null = null;
      let pushedTotal = 0;
      let pushedAt: number | null = null;
      for (const index of [...evicted.keys()].sort((a, b) => a - b)) {
        const list = evicted.get(index) ?? [];
        if (list.length === 0) continue;
        pushedTotal += list.length;
        if (pushedAt === null) pushedAt = index;

        const chipW = Math.min(CHIP_MAX_W, Math.floor((layout.colW - 4) / list.length));
        const startX =
          layout.colX(index) + Math.round((layout.colW - chipW * list.length) / 2);

        list.forEach((res, k) => {
          const x = startX + k * chipW;
          const boxW = Math.max(4, chipW - 3);
          const chip = el('g');
          chip.appendChild(
            el('rect', {
              x,
              y: CHIP_Y,
              width: boxW,
              height: CHIP_H,
              rx: 3,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
          chip.appendChild(
            glyph(String(res.address), {
              x: x + boxW / 2,
              y: CHIP_Y + 14,
              fill: c.textMuted,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
            }),
          );
          gChips.appendChild(chip);
          // 방금 밀려난 것. 같은 훑기가 낸 객체라 신원으로 가린다 — 차례를
          // 빼서 가리면 같은 줄을 건너뛰어 물었을 때 엉뚱한 조각을 집는다.
          if (last !== null && last.evicted === res) lastChip = chip;
        });
      }
      if (pushedTotal > 0 && pushedAt !== null) {
        gChips.appendChild(
          glyph(t('label.pushedOut', 'Pushed out: {n}', { n: pushedTotal }), {
            x: layout.colCx(pushedAt),
            y: PUSHED_BASELINE,
            fill: c.textMuted,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          }),
        );
      }

      // 비어 있는 기둥을 묶어 셈을 그 곁에 남긴다 — 자리가 모자란 것이 아니다.
      if (empties.length > 0) {
        const first = layout.colCx(empties[0] ?? 0);
        const lastX = layout.colCx(empties[empties.length - 1] ?? 0);
        gBrace.appendChild(
          el('line', {
            x1: first,
            y1: BRACE_Y,
            x2: lastX,
            y2: BRACE_Y,
            stroke: c.textMuted,
            'stroke-width': 1,
            opacity: 0.55,
          }),
        );
        for (const i of empties) {
          gBrace.appendChild(
            el('line', {
              x1: layout.colCx(i),
              y1: BRACE_TOP,
              x2: layout.colCx(i),
              y2: BRACE_Y,
              stroke: c.textMuted,
              'stroke-width': 1,
              opacity: 0.55,
            }),
          );
        }
        gBrace.appendChild(
          glyph(t('label.emptyLines', 'Empty lines: {n}', { n: empties.length }), {
            x: (first + lastX) / 2,
            y: EMPTY_BASELINE,
            fill: c.textMuted,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          }),
        );
      }

      // 이번 판정 — 기둥 곁에 찍힌다. `done` 에서도 거두지 않는다.
      const badge = last === null ? null : makeStamp(layout, last.index, last.hit);
      if (badge !== null) gBadge.appendChild(badge);

      // 판정의 띠 — 찾은 차례대로 하나씩 남는다. 이것이 이 조각의 결론이다.
      let lastTrail: SVGGElement | null = null;
      for (const v of replay.verdicts) {
        const item = el('g');
        item.appendChild(
          el('rect', {
            x: layout.trailX(v.at),
            y: TRAIL_Y,
            width: layout.trailW,
            height: TRAIL_H,
            rx: 4,
            fill: v.hit ? c.success : c.danger,
          }),
        );
        item.appendChild(
          glyph(String(v.address), {
            x: layout.trailX(v.at) + layout.trailW / 2,
            y: TRAIL_Y + 14,
            fill: v.hit ? c.textInverse : c.stateInk,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
        gTrail.appendChild(item);
        lastTrail = item;
      }

      // 주소가 왜 그 줄로 가는지 — 수식 표기라 번역 대상이 아니다 (C10).
      if (last !== null) {
        const lines = [
          `addr ${last.address} ÷ ${scene.lineSize} = line ${last.lineNo}`,
          `line ${last.lineNo} mod ${layout.lineCount} = index ${last.index}`,
          `line ${last.lineNo} ÷ ${layout.lineCount} = tag ${last.tag}`,
        ];
        lines.forEach((text, row) => {
          gSums.appendChild(
            glyph(text, {
              x: W - 16,
              y: 22 + row * 16,
              fill: c.textMuted,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
            }),
          );
        });
      }

      // 캡션. 문안은 여기서 만들고 장면은 무엇을 말할지만 담았다 (C10).
      const text = captionText(scene, replay);
      if (text !== '') {
        gCaption.appendChild(
          glyph(text, {
            x: W / 2,
            y: CAPTION_BASELINE,
            fill: c.text,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          }),
        );
      }

      return { layout, replay, seats, slots, badge, lastChip, lastTrail };
    }

    function captionText(scene: ConflictMissScene, replay: CacheReplay): string {
      const caption = scene.caption;
      if (caption === null) return '';
      const last = replay.verdicts[replay.verdicts.length - 1] ?? null;

      switch (caption.kind) {
        case 'fill':
          return last === null
            ? ''
            : t('caption.fill', 'This address can sit in only one line: {index}.', {
                index: last.index,
              });
        case 'evict':
          return last === null || last.evicted === null
            ? ''
            : t(
                'caption.evict',
                'The same line again, so the older block is pushed out: {evicted}.',
                { evicted: last.evicted.address },
              );
        case 'done':
          return t(
            'caption.done',
            'Lookups: {total}, hits: {hits}. Lines still empty: {empty}.',
            {
              total: replay.verdicts.length,
              hits: hitCountOf(replay),
              empty: emptyIndicesOf(replay).length,
            },
          );
      }
    }

    // ── 운동 ──────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이 된다.

    async function flowAccess(
      scene: ConflictMissScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { layout, replay } = drawn;
      const last = replay.verdicts[replay.verdicts.length - 1] ?? null;
      if (last === null) return;

      const tile = drawn.seats.get(last.index);
      if (tile === undefined) return;

      /*
       * 출발 그림은 **한 걸음 전의 장면을 다시 셈해** 얻는다. `prev` 에서 꺼내면
       * 무엇을 흐르게 할지 고르는 데만 쓰라는 규약을 어긴다 (S-scene).
       */
      const before = replayOf(scene, scene.accesses.length - 1);
      const askedBefore = askedLinesOf(before);
      const residentBefore = before.lines[last.index] ?? null;

      // 아직 안 일어난 것을 물린다.
      paintTile(tile, 'incoming');
      move(tile.g, layout.waitX, WAIT_Y);
      drawn.badge?.setAttribute('opacity', '0');
      drawn.lastChip?.setAttribute('opacity', '0');
      drawn.lastTrail?.setAttribute('opacity', '0');

      const slot = drawn.slots.get(last.index);
      if (slot !== undefined) dressSlot(slot, askedBefore.has(last.index));

      // 이 줄이 비어 있던 자리면 `—` 가 아직 남아 있어야 한다.
      let pendingMark: SVGTextElement | null = null;
      if (residentBefore === null) {
        pendingMark = makeEmptyMark(layout, last.index);
        gFlow.appendChild(pendingMark);
      }

      // 밀려날 것은 아직 제자리에 앉아 있다.
      let leaving: TileParts | null = null;
      if (last.evicted !== null) {
        leaving = makeTile(layout, last.evicted.address, last.evicted.tag, 'seated');
        move(leaving.g, layout.seatX(last.index), SEATED_Y);
        gFlow.appendChild(leaving.g);
      }

      gFlow.appendChild(makeGuide(layout, last.index));

      // 1. 언제나 같은 기둥으로 미끄러진다.
      await tween(ROUTE_MS, mine, (e) => {
        move(tile.g, lerp(layout.waitX, layout.seatX(last.index), e), WAIT_Y);
      });
      if (!alive(mine)) return;

      drawn.badge?.removeAttribute('opacity');
      if (leaving !== null) paintTile(leaving, 'leaving');

      // 2. 내려앉으면서 살던 것을 아래로 밀어낸다. 둘이 한 뜻이라 시계도 하나다.
      await tween(DROP_MS, mine, (e) => {
        move(tile.g, layout.seatX(last.index), lerp(WAIT_Y, SEATED_Y, e));
        if (leaving !== null) {
          move(leaving.g, layout.seatX(last.index), lerp(SEATED_Y, EXIT_Y, e));
          leaving.g.setAttribute('opacity', String(Math.max(0, 1 - e)));
        }
      });
      if (!alive(mine)) return;

      // 자리를 잡았다 — 밀려난 것은 조각으로, 판정은 띠로 남는다.
      leaving?.g.remove();
      pendingMark?.remove();
      if (slot !== undefined) dressSlot(slot, true);
      paintTile(tile, 'seated');
      move(tile.g, layout.seatX(last.index), SEATED_Y);
      drawn.lastChip?.removeAttribute('opacity');
      drawn.lastTrail?.removeAttribute('opacity');
    }

    /**
     * 마지막 걸음 — 쌓인 판정을 왼쪽부터 훑어 센다.
     *
     * 진폭이 `e` 로만 정해져 양 끝에서 0 이다. 그래야 멎은 화면이 어느 걸음에서
     * 오든 같다 (프로토콜 4 절의 상시 운동 금지와 같은 자리).
     */
    async function flowTally(drawn: Drawn, mine: number): Promise<void> {
      const { layout, replay } = drawn;
      if (replay.verdicts.length === 0) return;

      const bandW = layout.trailW + TRAIL_GAP;
      const from = layout.trailX(0) - bandW;
      const to = layout.trailX(replay.verdicts.length - 1) + layout.trailW;
      const band = el('rect', {
        y: TRAIL_Y - 4,
        width: bandW,
        height: TRAIL_H + 8,
        rx: 5,
        fill: c.accent,
        x: from,
        opacity: 0,
      });
      gFlow.appendChild(band);

      await tween(TALLY_MS, mine, (e) => {
        band.setAttribute('x', String(lerp(from, to, e)));
        band.setAttribute('opacity', String(Math.sin(Math.PI * e) * 0.45));
      });
    }

    function flow(
      step: ConflictMissStep,
      scene: ConflictMissScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      return step.kind === 'access' ? flowAccess(scene, drawn, mine) : flowTally(drawn, mine);
    }

    // ── render ────────────────────────────────────────────────────────────

    async function render(
      next: ConflictMissScene,
      _prev: ConflictMissScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flow(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      /**
       * 걸어 둔 프레임을 거두고, **기다리던 promise 를 푼다.** 취소된 프레임은
       * 아예 불리지 않으므로 거두기만 해서는 `render` 의 `await` 가 영영 돌아오지
       * 않는다 (S-piece).
       */
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
