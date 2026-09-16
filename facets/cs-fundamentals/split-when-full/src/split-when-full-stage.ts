/**
 * split-when-full-stage — 꽉 찬 자리가 쪼개지는 자리.
 *
 * 빌트인 tree-layout 은 "노드 = 원 하나" 를 전제해 한 노드 안의 여러 키가 넘치고
 * 갈라지는 장면을 표현하지 못한다. 이 stage 는 부모 행 / 자식 행 두 줄에 노드를
 * 상자로, 키를 상자 안 칩으로 그려 "쪼개져 올라간다" 는 동사가 실제 이동으로
 * 일어나게 한다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **키 목록을 장면이 쥐므로 나머지는 전부 거기서 셈해진다.** 상자의 너비는 그 자리가
 * 담은 키의 수가 정하고, 칩의 가로는 그 안의 차례가 정하고, 넘쳤나 · 어느 것이 새로
 * 온 키인가 · 어느 것이 올라간 키인가도 목록에서 갈린다 — **화면에 나란히 뜨는 수가
 * 두 출처에서 오지 않는다.** 캡션의 "3개" 는 그 상자에 실제로 그려진 칩을 센 수다.
 *
 * ── 한 걸음은 배치 하나에서 배치 하나로 가는 보간이다
 *
 * 네 걸음이 하는 일이 다 달라 보이지만 (내려온다 · 끼어든다 · 올라간다 · 갈라진다)
 * 화면에서는 전부 같은 꼴이다 — **상자와 칩이 옛 자리에서 새 자리로 간다.** 그래서
 * 걸음 함수를 넷 두지 않고 `place(출발) → place(도착)` 보간 하나로 산다.
 *
 * 그 출발 배치는 `prev` 에서 꺼내지 않는다 (S-scene). `scene.ts` 의
 * `arrangementBefore` 가 `mark` 의 자리 번호와 장면이 이미 쥔 값으로 지금 배치를
 * 거꾸로 풀어 만든다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 칩들은 이미 끝 자리에 서 있고,
 * 걸음은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 정적으로 세운 직후라 그 사이에
 * 타이머도 프레임도 없어 페인트가 끼지 않는다.
 *
 * **한 걸음에 여러 것이 함께 움직인다.** 갈라지는 걸음은 상자 하나가 둘로 벌어지고
 * 형제가 한 칸 밀리는 것이 **한 동작**이므로 시계를 나누지 않는다 — 옮길 것을 한
 * 목록에 모아 한 트윈으로 흘린다 (S-scene).
 *
 * 색은 design-tokens 결정 트리를 따른다 — 비교 하이라이트(itemComparing), 새로
 * 들어온 키(itemActive), 넘친 자리(danger), 올라가 갈림 기준이 된 키(itemPivot).
 * 상태 타일 위 글자는 stateInk (S-piece).
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  arrangementBefore,
  arrangementOf,
  heldWithoutInsert,
  overflowing,
  promotedKey,
  slotOrigin,
  type SplitArrangement,
  type SplitWhenFullMark,
  type SplitWhenFullScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 460;
const NODE_H = 40;
const KEY_W = 42;
const KEY_GAP = 6;
const CHIP_H = 26;
const NODE_PAD = 8;
const PARENT_Y = 30;
const ROW_GAP = 92;
const CHILD_Y = PARENT_Y + NODE_H + ROW_GAP;
const CAPTION_Y = CHILD_Y + NODE_H + 46;

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
const HEIGHT = CAPTION_Y + 30;

/** 칩이 상자 안에서 앉는 세로. */
const PARENT_CHIP_Y = PARENT_Y + (NODE_H - CHIP_H) / 2;
const CHILD_CHIP_Y = CHILD_Y + (NODE_H - CHIP_H) / 2;
/** 아직 자리에 들어가지 않은 키가 떠 있는 세로. */
const HOVER_CHIP_Y = CHILD_Y - CHIP_H - 8;

type Pt = { x: number; y: number };
type BoxEl = { g: SVGGElement; rect: SVGRectElement };
type ChipEl = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colCenterX(index: number, total: number): number {
  const colW = PIECE_CANVAS_W / Math.max(1, total);
  return colW * index + colW / 2;
}

function boxWidthFor(keyCount: number): number {
  const n = Math.max(1, keyCount);
  return n * KEY_W + (n - 1) * KEY_GAP + NODE_PAD * 2;
}

function chipXs(centerX: number, keyCount: number): number[] {
  const totalW = keyCount * KEY_W + Math.max(0, keyCount - 1) * KEY_GAP;
  const left = centerX - totalW / 2;
  const xs: number[] = [];
  for (let i = 0; i < keyCount; i += 1) xs.push(left + i * (KEY_W + KEY_GAP));
  return xs;
}

function wrapCaption(text: string, maxChars = 46): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

// ── 배치에서 자리를 셈한다 ─────────────────────────────────────────────────
//
// 장면은 좌표를 모른다 (S-piece). 자리 번호와 키의 차례가 가로를, 부모/자식 행이
// 세로를 정하므로 여기서 캔버스에 역산한다.

type BoxPlace = { cx: number; width: number };
type ChipPlace = { value: number; x: number; y: number };
type Placement = { parent: BoxPlace; slots: BoxPlace[]; chips: ChipPlace[] };

/** 넣을 키가 처음 나타나는 자리 — 부모 위 한가운데. */
const SPAWN: Pt = { x: PIECE_CANVAS_W / 2 - KEY_W / 2, y: 2 };

function placeOf(arr: SplitArrangement, insertKey: number): Placement {
  const pCx = PIECE_CANVAS_W / 2;
  const chips: ChipPlace[] = [];

  const pXs = chipXs(pCx, arr.parentKeys.length);
  arr.parentKeys.forEach((v, i) => {
    chips.push({ value: v, x: pXs[i] ?? pCx, y: PARENT_CHIP_Y });
  });

  const slots = arr.slots.map((keys, slot) => {
    const cx = colCenterX(slot, arr.slots.length);
    const xs = chipXs(cx, keys.length);
    keys.forEach((v, i) => {
      chips.push({ value: v, x: xs[i] ?? cx, y: CHILD_CHIP_Y });
    });
    return { cx, width: boxWidthFor(keys.length) };
  });

  if (arr.hovering !== null) {
    chips.push({
      value: insertKey,
      x: colCenterX(arr.hovering, arr.slots.length) - KEY_W / 2,
      y: HOVER_CHIP_Y,
    });
  }

  return { parent: { cx: pCx, width: boxWidthFor(arr.parentKeys.length) }, slots, chips };
}

export const splitWhenFullStageView: CanvasView = {
  canvas: { height: HEIGHT },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SplitWhenFullScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    const svg = params.canvas;
    svg.textContent = '';

    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지와 자리 번호만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const boxesLayer = svgEl('g');
    const chipsLayer = svgEl('g');
    const captionLayer = svgEl('g');
    svg.append(boxesLayer, chipsLayer, captionLayer);

    // 캡션은 고정 자리에 한 번만 짓고 다시 만들지 않는다. 그래서 정적 경로가
    // 매번 명시로 써 주어야 한다 — 되짚기에서 앞 걸음의 문안이 남지 않게.
    const captionText = svgEl('text', {
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
    });
    captionLayer.appendChild(captionText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 상자와 칩을 매번 새로 짓지만, 그 손잡이를 담는 `chipEls` ·
     * `slotBoxes` · `parentBox` 는 **다시 할당되는 클로저 변수**다. 옛 세대의
     * 프레임이 `await` 를 지난 뒤 그것을 읽으면 새 손잡이를 타고 살아 있는 화면에
     * 쓴다. 그래서 프레임마다 자기 세대를 확인하고 아니면 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const start = performance.now();
        let id = 0;
        const frame = (now: number): void => {
          frames.delete(id);
          const raw = Math.min(1, (now - start) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    /** 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다. */
    let parentBox: BoxEl | null = null;
    let slotBoxes: BoxEl[] = [];
    let chipEls = new Map<number, ChipEl>();

    function makeBox(rowY: number, place: BoxPlace, stroke: string): BoxEl {
      const g = svgEl('g', { transform: `translate(${place.cx}, 0)` });
      const rect = svgEl('rect', {
        x: -place.width / 2,
        y: rowY,
        width: place.width,
        height: NODE_H,
        rx: 10,
        fill: 'none',
        stroke,
        'stroke-width': 1.5,
      });
      g.appendChild(rect);
      return { g, rect };
    }

    function setBox(box: BoxEl, cx: number, width: number): void {
      box.g.setAttribute('transform', `translate(${cx}, 0)`);
      box.rect.setAttribute('x', String(-width / 2));
      box.rect.setAttribute('width', String(width));
    }

    /**
     * 칩의 칠. **저장하지 않고 파생시킨다** — 새로 온 키인가 · 올라간 키인가 ·
     * 견준 키인가가 전부 장면의 키 목록에서 갈린다.
     *
     * 명령형 stage 에서는 이 셋이 "되돌리는 명령이 없어 쌓이던" 칠이었지만 사실은
     * 정보였다. 장면으로 옮기면 저절로 사라지므로 일부러 살린다 (S-scene).
     */
    function toneOf(scene: SplitWhenFullScene, value: number): { fill: string; ink: string } {
      if (value === scene.insertKey) return { fill: colors.itemActive, ink: colors.stateInk };
      if (value === promotedKey(scene)) return { fill: colors.itemPivot, ink: colors.stateInk };
      if (value === scene.compared) return { fill: colors.itemComparing, ink: colors.stateInk };
      return { fill: colors.itemDefault, ink: colors.text };
    }

    function makeChip(place: ChipPlace, tone: { fill: string; ink: string }): ChipEl {
      const g = svgEl('g', { transform: `translate(${place.x}, ${place.y})` });
      const rect = svgEl('rect', {
        width: KEY_W,
        height: CHIP_H,
        rx: 6,
        fill: tone.fill,
      });
      const text = svgEl('text', {
        x: KEY_W / 2,
        y: CHIP_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: tone.ink,
      });
      text.textContent = String(place.value);
      g.append(rect, text);
      return { g, rect, text };
    }

    function setChip(chip: ChipEl, p: Pt): void {
      chip.g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform·
     * opacity·보간 끝자리도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: SplitWhenFullScene): void {
      boxesLayer.textContent = '';
      chipsLayer.textContent = '';
      chipEls = new Map<number, ChipEl>();

      const pl = placeOf(arrangementOf(scene), scene.insertKey);

      parentBox = makeBox(PARENT_Y, pl.parent, colors.border);
      boxesLayer.appendChild(parentBox.g);

      slotBoxes = pl.slots.map((place, slot) => {
        // 넘친 자리만 테두리가 갈린다. 늘 그려 두고 색을 감추면, 흐르며 선 화면과
        // 곧바로 세운 화면이 속성의 값만큼 달라 되짚기 판정에서 어긋난다.
        const box = makeBox(CHILD_Y, place, overflowing(scene, slot) ? colors.danger : colors.border);
        boxesLayer.appendChild(box.g);
        return box;
      });

      for (const place of pl.chips) {
        const chip = makeChip(place, toneOf(scene, place.value));
        chipsLayer.appendChild(chip.g);
        chipEls.set(place.value, chip);
      }
    }

    /** 캡션은 장면이 무엇을 말할지와 자리 번호만 담는다. 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: SplitWhenFullScene): string {
      const cap = scene.caption;
      if (!cap) return '';
      switch (cap.kind) {
        case 'descend':
          // 두 수 다 장면이 쥔 값이다 — 캡션의 "25" 와 칩 안의 "25" 가 한 출처다.
          return tr('caption.descend', '{key} is less than {compared}, so it heads into this child.', {
            key: scene.insertKey,
            compared: scene.compared ?? '',
          });
        case 'overflow':
          // "몇 개가 차 있나" 는 그 상자에 실제로 그려진 칩을 센다.
          return tr(
            'caption.overflow',
            'This slot already holds {capacity} keys — adding one overflows it to {count}.',
            {
              capacity: heldWithoutInsert(scene, cap.slot),
              count: scene.slots[cap.slot]?.length ?? 0,
            },
          );
        case 'promote':
          // 가운데 값도 부모 키의 차에서 나온다 — 올라간 칩과 같은 자를 쓴다.
          return tr('caption.promote', 'The middle key {key} rises into the parent.', {
            key: promotedKey(scene) ?? '',
          });
        case 'divide':
          return tr('caption.divide', 'What remains splits in two — {left} and {right}.', {
            left: `[${(scene.slots[cap.slot] ?? []).join(', ')}]`,
            right: `[${(scene.slots[cap.slot + 1] ?? []).join(', ')}]`,
          });
      }
    }

    function drawCaption(scene: SplitWhenFullScene): void {
      captionText.textContent = '';
      const text = captionTextOf(scene);
      if (!text) return;
      wrapCaption(text).forEach((line, i) => {
        const tspan = svgEl('tspan', {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_Y + i * 20,
        });
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    /**
     * 걸음 하나 — 배치 하나에서 배치 하나로 간다.
     *
     * 네 걸음이 전부 이 길로 온다. 내려오는 키만 화면에 없던 것이라 자리 대신
     * 나타나는 자리(`SPAWN`)에서 출발하고 함께 든다.
     *
     * 출발 배치는 `prev` 가 아니라 `arrangementBefore` 가 셈한다 (S-scene).
     */
    function flow(
      scene: SplitWhenFullScene,
      mark: SplitWhenFullMark,
      mine: number,
    ): Promise<void> {
      const to = placeOf(arrangementOf(scene), scene.insertKey);
      const from = placeOf(arrangementBefore(scene, mark), scene.insertKey);
      const fromChip = new Map(from.chips.map((c) => [c.value, { x: c.x, y: c.y }]));

      type ChipMove = { el: ChipEl; from: Pt; to: Pt; entering: boolean };
      const chipMoves: ChipMove[] = [];
      for (const place of to.chips) {
        const el = chipEls.get(place.value);
        if (!el) continue;
        const src = fromChip.get(place.value);
        chipMoves.push({
          el,
          from: src ?? SPAWN,
          to: { x: place.x, y: place.y },
          entering: src === undefined,
        });
      }

      type BoxMove = { box: BoxEl; from: BoxPlace; to: BoxPlace };
      const boxMoves: BoxMove[] = [];
      if (parentBox) boxMoves.push({ box: parentBox, from: from.parent, to: to.parent });
      to.slots.forEach((place, slot) => {
        const box = slotBoxes[slot];
        if (!box) return;
        // 갈라져 나온 둘은 **둘 다** 원래 자리에서 출발한다 — 한 상자가 둘로
        // 벌어지는 그림이 된다. 나머지 걸음에서는 자리 번호가 그대로다.
        boxMoves.push({ box, from: from.slots[slotOrigin(mark, slot)] ?? place, to: place });
      });

      const draw = (raw: number): void => {
        const e = easeInOutCubic(raw);
        for (const m of chipMoves) {
          setChip(m.el, { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) });
          if (m.entering) m.el.g.setAttribute('opacity', String(Math.min(1, raw * 2)));
        }
        for (const m of boxMoves) {
          setBox(m.box, lerp(m.from.cx, m.to.cx, e), lerp(m.from.width, m.to.width, e));
        }
      };

      // 끝 자리에 선 것을 옛 자리로 물려 놓고 출발한다. 정적으로 세운 직후라
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      draw(0);

      return tween(MOVE_MS, (raw) => {
        if (!alive(mine)) return;
        draw(raw);
      });
    }

    async function render(
      next: SplitWhenFullScene,
      /** 출발 배치를 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: SplitWhenFullScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const mark = next.mark;
      if (!mark) return;
      await flow(next, mark, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 opacity 를 통째로 거둔다. 되돌릴 목록을 손으로
      // 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const done of [...pending]) done();
        pending.clear();
        svg.textContent = '';
      },
    };
  },
};
