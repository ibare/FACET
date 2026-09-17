/**
 * partition-around-pivot-stage — 기준선 하나와 그것을 건너는 값들.
 *
 * 화면의 뼈대는 가운데를 세로로 가르는 **기준선**이다. 선의 아래 끝에 기준값이
 * 박혀 있고, 값들은 위쪽 줄에 흩어져 있다가 하나씩 선 위로 내려와 선에 걸터앉는다
 * (견줌). 그리고 선을 넘어 좌 또는 우의 방으로 미끄러져 내려가 자리를 잡는다.
 *
 * 그래서 이 view 의 운동은 전부 **위치 이동**이다.
 *
 * ── 걸음마다 부르는 메서드를 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고, 되짚기가 앞으로 가기와 같은
 * 길을 탄다. 예전에는 `armPivot` / `settlePivot`, `dressChip(true)` / `dressChip(false)`,
 * `finish()` / `rewind()` 같은 짝이 DOM 을 제자리에서 고쳤고 그 짝이 곧 숨은
 * 상태였다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는 장면의
 * `step` 이 실어 온 자리 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 칠을 둘로 가른다
 *
 *   - **채움 = 값의 형편.** 아직 안 봤다(`itemDefault`) / 지금 기준 위에 있다
 *     (`itemComparing`) / 기준보다 작다·크다(`categorical(2, 'pastel')` 두 자).
 *     형편을 **값**에 실으므로 값이 자리를 옮겨도 읽기가 뒤집히지 않는다.
 *   - **테두리 = 견줌의 표식.** 기준과 맞대어 본 값은 기준의 색(`itemPivot`)으로
 *     테를 두르고 **그것을 지우지 않는다.** 마지막 화면에 다섯 모두 표식을 단 채
 *     좌우로 갈려 있는 것이 이 조각의 결론이다. 옛 화면은 다음 걸음에서 표식을
 *     지워, 다 끝난 화면에 "어느 값이 왜 그쪽에 있는지" 가 남지 않았다.
 *
 * ── 왜 이 좌표인가
 *   - 값은 크기를 막대 높이로 그리지 않는다. 이 조각이 말하는 대소는 "기준보다
 *     작다 / 크다" 뿐이고, 그것은 **어느 쪽 방에 있는가**와 **어느 색인가**로 이미
 *     다 말해진다.
 *   - 두 방이 캔버스의 좌우를 가득 채운다. 방 폭에서 칩 크기를 역산하므로
 *     상수는 상한(`CHIP_MAX_W`)만 둔다 (S-piece).
 *   - 방은 값이 아니라 **영역**이다. 방이 덜 차는 것은 감추지 않는다 — 가른
 *     결과가 반반이 아니라는 것도 이 화면이 말해야 할 사실이다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 화면 문자는 캡션뿐이고 전부 `params.t` 로 만든다 — 문안은 `facet.ts` 의
 * `messages` 에 있다 (C10). 칩과 배지에 적힌 값, 방에 새긴 부등호는 숫자·수식
 * 표식이라 문안이 아니다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  countOn,
  isWeighed,
  slotOf,
  type PartitionAroundPivotScene,
  type PartitionSide,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로: 두 방이 캔버스를 좌우로 채우고 그 사이에 기준이 선다.
const W = PIECE_CANVAS_W;
const PAD = 24;
const CX = Math.round(W / 2);
const PIVOT_R = 23;
/** 기준 배지와 방 사이의 숨. */
const GATE_GAP = 14;
const CHIP_MAX_W = 56;
const CHIP_GAP = 8;
const CHIP_H = 34;

// ── 세로: 흩어진 줄 → 기준선 위 견줌 자리 → 두 방. 내용이 정하고 바뀌지 않는다.
const RAIL_Y = 32;
const LINE_TOP = 60;
const CMP_Y = 102;
const LAND_Y = 176;
const ROOM_H = 46;
const ROOM_Y = LAND_Y - ROOM_H / 2;
const LINE_BOT = LAND_Y + PIVOT_R + 5;
const LABEL_Y = 218;
const CAPTION_Y = 244;
const STAGE_H = 258;

const ROOM_W = CX - PIVOT_R - GATE_GAP - PAD;
const ROOM_LEFT_X = PAD;
const ROOM_RIGHT_X = CX + PIVOT_R + GATE_GAP;

// ── 지속시간. 걸음 간격(stepMs) 위에 더해지므로 짧게 잡는다 (S-piece).
const ARM_MS = 300;
const DESCEND_MS = 300;
/** 맞대어 보는 뜸 — 견줌 걸음이 "내려앉기" 하나로 끝나 얇아지는 것을 막는다. */
const WEIGH_MS = 260;
const CROSS_MS = 380;
const SETTLE_MS = 300;
/** 두 방이 각각 한 덩어리가 되는 순간. 이미 있던 것이라 부풀었다 돌아온다. */
const GROUP_MS = 260;

// ── 테두리는 견줌의 표식이다. 한 번 서면 그 회차 동안 지우지 않는다.
const CHIP_STROKE_PLAIN = 1.5;
const CHIP_STROKE_WEIGHED = 3;
const LINE_W_IDLE = 3;
const LINE_W_ACTIVE = 6;
/** 맞대는 순간 기준선과 배지 테가 잠깐 부푸는 폭. */
const LINE_SWELL = 3;
const BADGE_SWELL = 2;
const BADGE_STROKE_PLAIN = 1.5;
const BADGE_STROKE_FINAL = 3;
const ROOM_STROKE = 1.5;
/** 기준 자리가 확정되는 순간 배지가 부푸는 비율. */
const BADGE_PULSE = 0.18;
/** 두 쪽이 묶이는 순간 방이 부푸는 비율. */
const ROOM_SWELL = 0.04;

/**
 * 가른 결과의 두 자리. 알고리즘 상태가 아니라 **두 쪽을 식별하는 카테고리**라
 * `categorical` 을 쓴다 (S-view 결정 순서 3). 씨앗은 늘 2 다 — "지금까지 드러난
 * 수" 로 정하면 한 쪽이 처음 채워질 때 이미 칠한 쪽의 색이 갈린다.
 */
const SIDE_TINT = categorical(2, 'pastel');
const TINT_LESS = 0;
const TINT_GREATER = 1;

/** 방에 새겨진 부등호 표기. 문장이 아니라 수식이므로 번역 대상이 아니다 (C10). */
const LESS_GLYPH = '<';
const GREATER_GLYPH = '>';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
const easeOut = (t: number): number => 1 - (1 - t) ** 2;
const easeIn = (t: number): number => t * t;

/** 칩 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type Chip = { group: SVGGElement; box: SVGRectElement; label: SVGTextElement };
/** 방 하나의 DOM 손잡이. 테두리와 이름표가 함께 묶여 한 덩어리로 부푼다. */
type Room = { group: SVGGElement; rect: SVGRectElement; label: SVGTextElement; cx: number };

export const partitionAroundPivotStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PartitionAroundPivotScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${STAGE_H}`);

    // ── 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 다시 짓는다.
    const roomsLayer = el('g');
    const lineLayer = el('g');
    const chipsLayer = el('g');
    const captionText = el('text', {
      x: CX,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
    });
    svg.append(roomsLayer, lineLayer, chipsLayer, captionText);

    // ── 기하. 장면의 값 개수가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    //    한쪽으로 전부 몰려도 겹치지 않는 크기를 방 폭에서 역산한다.
    let chipW = CHIP_MAX_W;
    let railStep = 0;

    function layout(count: number): void {
      const n = Math.max(1, count);
      chipW = Math.min(CHIP_MAX_W, Math.floor((ROOM_W - CHIP_GAP * (n - 1)) / n));
      railStep = (W - PAD * 2) / n;
    }

    function railX(i: number): number {
      return PAD + railStep * (i + 0.5);
    }

    // 두 방 모두 기준선 쪽에서 바깥으로 쌓인다. 먼저 건넌 값이 선에 가깝다 —
    // 그래야 기준이 양쪽에 끼인 채로 남아 "두 쪽 사이" 가 눈에 보인다.
    function slotX(side: PartitionSide, slot: number): number {
      return side === 'less'
        ? ROOM_LEFT_X + ROOM_W - chipW / 2 - slot * (chipW + CHIP_GAP)
        : ROOM_RIGHT_X + chipW / 2 + slot * (chipW + CHIP_GAP);
    }

    /** 그 값이 지금 서 있어야 할 자리. 장면에서만 셈한다 — 화면을 도로 읽지 않는다. */
    function chipPoint(s: PartitionAroundPivotScene, i: number): { x: number; y: number } {
      const side = s.placed[i];
      if (side !== undefined && side !== null) {
        return { x: slotX(side, slotOf(s, i)), y: LAND_Y };
      }
      if (s.onLine === i) return { x: CX, y: CMP_Y };
      return { x: railX(i), y: RAIL_Y };
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    let chipEls = new Map<number, Chip>();
    let rooms: Room[] = [];
    let lineEl: SVGLineElement | null = null;
    let badgeEl: SVGGElement | null = null;
    let badgeDiscEl: SVGCircleElement | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 견줌 걸음은 마디 둘(내려앉기 · 맞대기)을 이어 달린다. 되짚기가 그 사이에
    // 끼어들면 남은 마디가 깨어나 이미 새로 선 화면을 덮으므로, `render` 첫머리에서
    // 세대를 올리고 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을
    // 댄다. `isInstant` / `onScrubStart` 는 장면 조각에서 러너가 부르지 않으므로
    // 빗장이 되지 못한다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canRaf = typeof requestAnimationFrame === 'function';

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      if (!alive(mine)) return Promise.resolve();
      if (!canRaf || ms <= 0) {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
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
          draw(raw);
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

    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const place = (chip: Chip, x: number, y: number): void => {
      chip.group.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
    };

    // ── 칠. 채움은 값의 형편, 테두리는 견줌의 표식이다.

    function fillOf(s: PartitionAroundPivotScene, i: number): { box: string; ink: string } {
      const side = s.placed[i];
      if (side === 'less') return { box: SIDE_TINT[TINT_LESS] ?? c.itemDefault, ink: c.stateInk };
      if (side === 'greater') {
        return { box: SIDE_TINT[TINT_GREATER] ?? c.itemDefault, ink: c.stateInk };
      }
      if (s.onLine === i) return { box: c.itemComparing, ink: c.stateInk };
      return { box: c.itemDefault, ink: c.text };
    }

    function dressChip(chip: Chip, s: PartitionAroundPivotScene, i: number): void {
      const paint = fillOf(s, i);
      chip.box.setAttribute('fill', paint.box);
      chip.label.setAttribute('fill', paint.ink);
      const weighed = isWeighed(s, i);
      chip.box.setAttribute('stroke', weighed ? c.itemPivot : c.border);
      chip.box.setAttribute(
        'stroke-width',
        String(weighed ? CHIP_STROKE_WEIGHED : CHIP_STROKE_PLAIN),
      );
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      roomsLayer.replaceChildren();
      lineLayer.replaceChildren();
      chipsLayer.replaceChildren();
      chipEls = new Map();
      rooms = [];
      lineEl = null;
      badgeEl = null;
      badgeDiscEl = null;
      captionText.textContent = '';
    }

    /** 방 하나 — 영역 tint 와 부등호 이름표. 묶인 뒤에만 테두리를 **짓는다**. */
    function makeRoom(x: number, glyph: string, pivot: number, grouped: boolean): Room {
      const group = el('g');
      const rect = el('rect', {
        x,
        y: ROOM_Y,
        width: ROOM_W,
        height: ROOM_H,
        rx: 10,
        fill: x === ROOM_LEFT_X ? c.subtreeShadeLeft : c.subtreeShadeRight,
      });
      // 아직 묶이지 않았으면 테두리를 숨기는 것이 아니라 짓지 않는다 — 숨기기만
      // 하면 앞 걸음의 속성이 남아 되짚기 판정에서 어긋난다.
      if (grouped) {
        rect.setAttribute('stroke', c.border);
        rect.setAttribute('stroke-width', String(ROOM_STROKE));
      }
      const label = el('text', {
        x: x + ROOM_W / 2,
        y: LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: grouped ? c.text : c.textMuted,
      });
      label.textContent = `${glyph} ${pivot}`;
      group.append(rect, label);
      roomsLayer.appendChild(group);
      return { group, rect, label, cx: x + ROOM_W / 2 };
    }

    /** 값 하나를 담은 칩. 자리와 칠은 부르는 쪽이 정한다. */
    function makeChip(value: number): Chip {
      const group = el('g');
      const box = el('rect', {
        x: -chipW / 2,
        y: -CHIP_H / 2,
        width: chipW,
        height: CHIP_H,
        rx: 6,
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      label.textContent = String(value);
      group.append(box, label);
      chipsLayer.appendChild(group);
      return { group, box, label };
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 방 · 기준선 · 기준 배지 · 값 칩 · 견줌의 표식이 모두 여기서 난다. 남는
     * 표식(견주었다 · 어느 쪽인가 · 기준 자리 확정 · 두 덩어리)을 여기 넣어야
     * 되짚었을 때 남는다.
     */
    function drawStatic(s: PartitionAroundPivotScene): void {
      layout(s.origin.length);

      // ── 두 방. 좌는 중성 tint, 우는 강조 tint (좌소우대 색지).
      rooms = [
        makeRoom(ROOM_LEFT_X, LESS_GLYPH, s.pivot, s.grouped),
        makeRoom(ROOM_RIGHT_X, GREATER_GLYPH, s.pivot, s.grouped),
      ];

      // ── 기준선. 접혀 있거나(배지 안) 펴져 화면을 좌우로 가르거나 둘 중 하나다.
      const line = el('line', {
        x1: CX,
        y1: s.lineArmed ? LINE_TOP : ROOM_Y,
        x2: CX,
        y2: LINE_BOT,
        stroke: c.itemPivot,
        'stroke-width': s.onLine === null ? LINE_W_IDLE : LINE_W_ACTIVE,
        'stroke-linecap': 'round',
      });
      lineLayer.appendChild(line);
      lineEl = line;

      // ── 기준 배지. 건너지 않는 유일한 값. 테 굵기는 **자리가 확정됐나**만 말한다.
      const badge = el('g', { transform: `translate(${CX} ${LAND_Y})` });
      const disc = el('circle', {
        cx: 0,
        cy: 0,
        r: PIVOT_R,
        fill: c.itemPivot,
        stroke: c.stateInk,
        'stroke-width': s.pivotSettled ? BADGE_STROKE_FINAL : BADGE_STROKE_PLAIN,
      });
      const text = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: c.stateInk,
      });
      text.textContent = String(s.pivot);
      badge.append(disc, text);
      lineLayer.appendChild(badge);
      badgeEl = badge;
      badgeDiscEl = disc;

      // ── 값 칩. 기준선 위에 걸터앉은 것은 맨 뒤에 붙여 선 위로 올린다.
      const order = s.origin.map((_, i) => i).filter((i) => s.onLine !== i);
      if (s.onLine !== null) order.push(s.onLine);
      for (const i of order) {
        const value = s.origin[i];
        if (typeof value !== 'number') continue;
        const chip = makeChip(value);
        const at = chipPoint(s, i);
        place(chip, at.x, at.y);
        dressChip(chip, s, i);
        chipEls.set(i, chip);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(s: PartitionAroundPivotScene): void {
      const cap = s.caption;
      if (cap === null) {
        captionText.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'intro':
          captionText.textContent = tr(
            'caption.intro',
            'Every value meets the same pivot {pivot}.',
            { pivot: s.pivot },
          );
          return;
        case 'weigh':
          captionText.textContent = tr(
            'caption.weigh',
            'Now weighing {value} against the pivot {pivot}.',
            { value: s.origin[cap.index] ?? 0, pivot: s.pivot },
          );
          return;
        case 'crossed': {
          const value = s.origin[cap.index] ?? 0;
          captionText.textContent =
            s.placed[cap.index] === 'less'
              ? tr('caption.less', '{value} < {pivot} — it crosses to the left.', {
                  value,
                  pivot: s.pivot,
                })
              : tr('caption.greater', '{value} > {pivot} — it crosses to the right.', {
                  value,
                  pivot: s.pivot,
                });
          return;
        }
        case 'pivotFinal':
          captionText.textContent = tr(
            'caption.pivotFinal',
            'The pivot never crossed. Its place is settled.',
          );
          return;
        case 'done':
          // 캡션의 수와 방에 앉은 칩이 같은 셈을 지난다 — 장면의 `placed` 하나다.
          captionText.textContent = tr(
            'caption.done',
            '{less} on the left, {greater} on the right — split, not sorted.',
            { less: countOn(s, 'less'), greater: countOn(s, 'greater') },
          );
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 `step` 이 실어 온 자리
    //    번호에서 셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).

    /** 기준선이 배지에서 위로 자라 화면을 좌우로 가른다. */
    function arm(mine: number): Promise<void> {
      const line = lineEl;
      if (line === null) return Promise.resolve();
      return animate(ARM_MS, mine, (p) => {
        const e = easeOut(p);
        line.setAttribute('y1', String(r1(ROOM_Y + (LINE_TOP - ROOM_Y) * e)));
      });
    }

    /**
     * 값 하나가 줄에서 내려와 기준선 위에 걸터앉고(마디 1), 기준과 맞대어 본다
     * (마디 2). 마디 둘을 이어 달리므로 `await` 뒤마다 세대를 확인한다.
     */
    async function weigh(index: number, mine: number): Promise<void> {
      const chip = chipEls.get(index);
      const line = lineEl;
      const disc = badgeDiscEl;
      if (!chip) return;
      const fromX = railX(index);
      await animate(DESCEND_MS, mine, (p) => {
        const e = easeInOut(p);
        place(chip, fromX + (CX - fromX) * e, RAIL_Y + (CMP_Y - RAIL_Y) * e);
      });
      if (!alive(mine)) return;
      // 맞대는 순간 — 기준선과 배지 테가 잠깐 부풀었다 제 굵기로 돌아온다.
      await animate(WEIGH_MS, mine, (p) => {
        const swell = Math.sin(p * Math.PI);
        line?.setAttribute('stroke-width', String(r1(LINE_W_ACTIVE + LINE_SWELL * swell)));
        disc?.setAttribute('stroke-width', String(r1(BADGE_STROKE_PLAIN + BADGE_SWELL * swell)));
      });
    }

    /** 선을 넘어 한쪽 방으로 미끄러져 내려간다. 옆으로 먼저, 그 다음 아래로. */
    function cross(
      s: PartitionAroundPivotScene,
      index: number,
      mine: number,
    ): Promise<void> {
      const chip = chipEls.get(index);
      if (!chip) return Promise.resolve();
      const to = chipPoint(s, index);
      // 건너는 동안에는 아직 "지금 견주는 중" 의 채움이다. 다 건너면 마무리
      // 그리기가 그 쪽의 채움으로 통째로 다시 세운다.
      chip.box.setAttribute('fill', c.itemComparing);
      chip.label.setAttribute('fill', c.stateInk);
      return animate(CROSS_MS, mine, (p) => {
        place(chip, CX + (to.x - CX) * easeOut(p), CMP_Y + (to.y - CMP_Y) * easeIn(p));
      });
    }

    /** 기준선이 오므라들고 기준값의 자리만 남는다 — 이 조각의 결론이다. */
    function settle(mine: number): Promise<void> {
      const line = lineEl;
      const badge = badgeEl;
      if (line === null || badge === null) return Promise.resolve();
      return animate(SETTLE_MS, mine, (p) => {
        const e = easeInOut(p);
        line.setAttribute('y1', String(r1(LINE_TOP + (ROOM_Y - LINE_TOP) * e)));
        const k = 1 + Math.sin(Math.PI * p) * BADGE_PULSE;
        badge.setAttribute('transform', `translate(${CX} ${LAND_Y}) scale(${r1(k)})`);
      });
    }

    /** 두 쪽이 각각 한 덩어리가 된다. 이미 있던 것이라 부풀었다 돌아온다. */
    function group(mine: number): Promise<void> {
      const live = rooms.slice();
      if (live.length === 0) return Promise.resolve();
      return animate(GROUP_MS, mine, (p) => {
        const k = 1 + Math.sin(Math.PI * p) * ROOM_SWELL;
        for (const room of live) {
          room.group.setAttribute(
            'transform',
            `translate(${r1(room.cx)} ${LAND_Y}) scale(${r1(k)}) translate(${r1(-room.cx)} ${-LAND_Y})`,
          );
        }
      });
    }

    function flow(s: PartitionAroundPivotScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'arm':
          return arm(mine);
        case 'weigh':
          return weigh(step.index, mine);
        case 'cross':
          return cross(s, step.index, mine);
        case 'settle':
          return settle(mine);
        case 'group':
          return group(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(견줌 중 채움 · 부푼 테 · 방의 scale)이 한꺼번에 사라져, 흐른 화면과
     * 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 자리
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: PartitionAroundPivotScene,
      _prev: PartitionAroundPivotScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next);
    }

    return {
      render,

      /**
       * 기다리던 것을 깨우는 자리. 타이머·프레임을 거두는 것만으로는 모자란다 —
       * 취소된 tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 그것을
       * 기다리므로 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
       */
      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        roomsLayer.remove();
        lineLayer.remove();
        chipsLayer.remove();
        captionText.remove();
      },
    };
  },
};
