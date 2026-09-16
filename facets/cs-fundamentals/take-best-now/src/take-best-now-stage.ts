/**
 * take-best-now-stage — 진열대에서 쟁반으로 **집어 내리는** 화면.
 *
 * 이 조각의 동사는 "집어 내린다" 이고, 화면의 모든 운동이 그 하나다.
 *
 *   위    진열대. 고를 수 있는 액면이 놓여 있다. 남은 몫에 안 들어가는 것은
 *         손이 닿지 않는 것으로 물러난다.
 *   아래  왼쪽은 쟁반(집은 것이 쌓이는 곳), 오른쪽은 남은 몫.
 *
 * ── 집은 것들이 쌓인 자취가 마지막 화면에 남는다
 *
 * 쟁반에 앉은 동전은 **집은 차례대로** 왼쪽부터 늘어서고, 그 아래에 그때까지
 * **닿은 거리**가 눈금으로 적힌다 — 25 · 35 · 40 · 41. 옮기기 전 화면에는 이
 * 눈금이 없었고 계량기가 남은 몫만 보였으므로, 다 끝난 화면에는 "어느 차례에
 * 어디까지 닿았나" 가 남지 않았다. 이 조각의 주장이 바로 그 누적이라 장면으로
 * 올리면서 함께 세운다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편** — 진열대의 동전이 남은 몫에 아직 들어가나(itemDefault),
 * 손이 닿지 않나(bgSubtle). **테두리는 고름의 표식** — 이번에 집는 자리는 굵게,
 * 전에 집은 적 있는 자리는 가늘게 itemActive 로 남는다. 값이 자리를 옮기는
 * 조각이라 고른 쪽을 채움으로 칠하면 옮긴 뒤의 읽기가 뒤집힌다. 갈라 두면
 * 진열대 한 자리가 "들어가나" 와 "집었나" 를 한꺼번에 말할 수 있다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 되돌릴 명령이 없으므로 `rewind()` 도 사라졌다 — 처음
 * 장면을 그리는 것이 곧 되감는 일이다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 집은 동전은 이미 쟁반에
 * 앉아 있고, 애니메이션은 그것을 **진열대 자리로 도로 물려 놓고** 떨어뜨린다.
 * 출발 자리는 장면의 `step` 이 실어 온 자리 번호에서 셈한다 — `prev` 는 쓰지
 * 않는다 (S-scene).
 *
 * 크기(값의 대소)를 막대 높이로 그리지 않는다. 이 조각이 말하는 것은 대소 비교가
 * 아니라 "하나의 기준으로 집고 되돌아보지 않는다" 이므로, 재는 눈금을 두면
 * 화면이 다른 주장을 하게 된다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 * 화면 문자는 레이블과 캡션뿐이고 전부 `params.t` 로 만든다 (C10). 동전에 적힌
 * 액면과 쟁반의 누계 눈금은 도형에 새겨진 숫자 표식이라 문안이 아니다.
 *
 * 타이머: rAF 와 그것을 기다리는 약속뿐이다. `destroy()` 가 걸린 프레임을 모두
 * 걷고 **대기 중이던 약속을 즉시 풀어 준다** — 취소된 tick 은 아예 불리지 않으므로
 * resolve 를 tick 안에만 두면 약속이 영영 안 풀린다 (S-piece).
 *
 * 색은 전부 design-tokens 경유 (S-view 결정 트리).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  radii,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { reachedBy, type TakeBestNowCaption, type TakeBestNowScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 마운트 뒤 바뀌지 않는다 (S-view). */
const H = 288;
/** 쟁반·계량기 상자의 모서리. 토큰 경유 (S-view). */
const BOX_R = Number.parseFloat(radii.lg);

const SIDE_MIN = 28;
/** 진열대 한 자리의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const SHELF_CELL_MAX = 132;
const COIN_R_MAX = 34;
const SHELF_CY = 58;
/** 진열대 아래 선반 가로줄. */
const RAIL_Y = 102;
/** 지불 줄 (쟁반 + 계량기) 위치. */
const ROW_Y = 144;
const ROW_H = 96;
const ROW_LABEL_Y = 132;
const METER_W = 132;
const ROW_GAP = 16;
const TRAY_PAD = 14;
/** 쟁반 동전이 상자 위쪽에 앉는 여백. 남는 아래쪽이 누계 눈금 자리다. */
const TRAY_COIN_PAD = 4;
/** 쟁반 동전 아래 누계 눈금의 글자 밑선. */
const TICK_Y = ROW_Y + ROW_H - 6;
/**
 * 쟁반 폭을 정할 때 쓰는 자리 수 **상한**. 자리 표시를 그리지는 않는다 —
 * 몇 번 집게 될지는 재생 전에 알 수 없고, 빈 자리를 그리면 답을 미리 말하게 된다.
 *
 * 걸음에 따라 바뀌지 않는다. 집은 수로 간격을 다시 잡으면 이미 앉은 동전이
 * 걸음마다 움직여, "앉은 뒤로는 움직이지 않는다" 는 이 조각의 말과 어긋난다.
 */
const TRAY_CAP = 5;
const CAPTION_Y = 266;

/** 한 걸음의 낙하 시간. 총 재생 길이는 여기에 stepMs 가 더해진다 (S-piece). */
const DROP_MS = 460;
/** 동전이 앉았다고 볼 지점. 여기서 계량기가 줄고 누계 눈금이 선다. */
const LAND_AT = 0.84;
/**
 * 목표를 세우기만 하는 얇은 걸음에 얹는 운동 (S-piece).
 *
 * `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로 그 걸음에만 얹는다.
 * 계량기는 이미 서 있던 것이라 나타나는 꼴이 아니라 **부풀었다 돌아오는** 꼴이
 * 맞다 — 겨눈다는 말과 같은 동사다.
 */
const GOAL_MS = 280;
const GOAL_SWELL = 5;
/** 마지막 걸음. 쌓인 것을 왼쪽부터 하나씩 세어 나간다 — "몇 닢" 과 같은 동사다. */
const TALLY_MS = 360;
const COIN_SWELL = 3.5;

/** 진열대 테두리 — 아무 표식 없음 / 전에 집은 적 있음 / 지금 집는 중. */
const STROKE_PLAIN = 1.5;
const STROKE_TAKEN = 2;
const STROKE_TAKING = 3.5;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 떨어지는 동안 가로는 일찍 옮겨 붙고 (ease-out), 세로는 뒤로 갈수록 빨라진다. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function easeIn(t: number): number {
  return t * t;
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 동전 한 닢의 DOM 손잡이. 뜻은 담지 않는다 — 장면이 말한다. */
type CoinParts = {
  g: SVGGElement;
  disc: SVGCircleElement;
  label: SVGTextElement;
};

/** 쟁반에 앉은 한 닢과 그 아래 누계 눈금. */
type SeatParts = CoinParts & { tick: SVGTextElement };

export const takeBestNowStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<TakeBestNowScene> {
    // container 를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    void container;

    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 러너가 넘긴 t 에는 저작 문안이 얹혀 있다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // ── 켜 나누기. 뒤에 붙은 것이 위에 그려진다. 쟁반이 진열대보다 위에 있어야
    //    떨어지는 동전이 선반 줄을 가리며 지나간다.
    const bgLayer = el('g');
    const shelfLayer = el('g');
    const trayLayer = el('g');
    const capLayer = el('g');
    const layers = [bgLayer, shelfLayer, trayLayer];
    for (const layer of [...layers, capLayer]) svg.appendChild(layer);

    // 캡션은 재건 밖 요소다 — 정적 경로가 매번 문자를 명시로 쓴다. 빠뜨리면 앞
    // 걸음의 문장이 남아 되짚기 판정에서 어긋난다.
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'text-anchor': 'middle',
    });
    capLayer.appendChild(caption);

    // ── 기하. 자리 수가 폭을 정하므로 장면의 `coins` 길이에서 매번 역산한다.
    //    자리를 **먼저 한 번에 셈하고** 그 다음에 그린다.
    let cellW = SHELF_CELL_MAX;
    let shelfX = SIDE_MIN;
    let shelfW = W - SIDE_MIN * 2;
    let R = COIN_R_MAX;
    let trayX = SIDE_MIN;
    let trayW = W - SIDE_MIN * 2 - METER_W - ROW_GAP;
    let meterX = trayX + trayW + ROW_GAP;
    let trayCy = ROW_Y + TRAY_COIN_PAD + R;
    let pitch = 2 * R + 8;
    let trayLastCx = trayX + trayW - TRAY_PAD - R;

    function layout(n: number): void {
      const cells = Math.max(1, n);
      cellW = Math.min(SHELF_CELL_MAX, Math.floor((W - SIDE_MIN * 2) / cells));
      shelfW = cellW * cells;
      shelfX = Math.round((W - shelfW) / 2);
      R = Math.max(14, Math.min(COIN_R_MAX, Math.floor(cellW / 2) - 12));

      trayX = SIDE_MIN;
      trayW = W - SIDE_MIN * 2 - METER_W - ROW_GAP;
      meterX = trayX + trayW + ROW_GAP;
      trayCy = ROW_Y + TRAY_COIN_PAD + R;
      pitch = Math.min(2 * R + 8, Math.floor((trayW - TRAY_PAD * 2) / TRAY_CAP));
      trayLastCx = trayX + trayW - TRAY_PAD - R;
    }

    const shelfCx = (index: number): number => shelfX + cellW * index + cellW / 2;
    const slotCx = (slot: number): number =>
      Math.min(trayX + TRAY_PAD + R + slot * pitch, trayLastCx);

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let shelfCoins: CoinParts[] = [];
    let trayCoins: SeatParts[] = [];
    let meterBox: SVGRectElement | null = null;
    let meterText: SVGTextElement | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 모든 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가
    // 이미 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를
    // 올리고, 운동은 자기 세대가 유효할 때만 화면에 손을 댄다.
    //
    // `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그
    // 둘을 부르지 않는다 (S-scene). 실효 있는 것은 `opts.animate` 검사와 이것뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 한 걸음을 **한 시계**로 흐르게 한다.
     *
     * `resolve` 를 쥔 `finish` 를 `waiters` 에 먼저 담는다. tick 안에만 두면
     * `destroy` 가 rAF 를 취소할 때 tick 이 아예 안 불려 약속이 영영 안 풀린다.
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = now();
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
          const p = Math.min(1, (now() - started) / ms);
          draw(p);
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

    // ── 부품 짓기.

    function makeCoin(
      parent: SVGGElement,
      value: number,
      cx: number,
      cy: number,
    ): CoinParts {
      const g = el('g', { transform: `translate(${cx} ${cy})` });
      const disc = el('circle', { cx: 0, cy: 0, r: R, 'stroke-width': STROKE_PLAIN });
      const label = el('text', {
        x: 0,
        y: 0,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      // 액면은 도형에 새겨진 숫자 표식이다 (C10) — 키를 만들지 않는다.
      label.textContent = String(value);
      g.appendChild(disc);
      g.appendChild(label);
      parent.appendChild(g);
      return { g, disc, label };
    }

    /**
     * 계량기를 칠한다. 다 만든 순간에만 색이 갈린다.
     *
     * 떨어지는 동안에는 아직 줄지 않은 몫을 보여야 하므로 값을 인자로 받는다 —
     * 그 값도 장면이 셈한 것이고 (`step.before`) 화면을 되읽지 않는다.
     */
    function paintMeter(value: number): void {
      if (meterBox === null || meterText === null) return;
      const done = value === 0;
      meterText.textContent = String(value);
      meterBox.setAttribute('fill', done ? c.accent : c.bgSubtle);
      meterBox.setAttribute('stroke', done ? c.accent : c.border);
      meterText.setAttribute('fill', done ? c.stateInk : c.text);
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function clear(): void {
      for (const layer of layers) layer.replaceChildren();
      shelfCoins = [];
      trayCoins = [];
      meterBox = null;
      meterText = null;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 선반 · 진열대 · 쟁반 · 누계 눈금 · 계량기가 모두 여기서 난다. **머무는
     * 강조**(집은 적 있는 자리의 테두리 · 쟁반에 쌓인 동전과 그 눈금)를 여기
     * 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: TakeBestNowScene): void {
      layout(s.coins.length);

      bgLayer.appendChild(
        el('line', {
          x1: shelfX,
          y1: RAIL_Y,
          x2: shelfX + shelfW,
          y2: RAIL_Y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );

      const trayLabel = el('text', {
        x: trayX + 2,
        y: ROW_LABEL_Y,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      trayLabel.textContent = tr('label.taken', 'Taken');
      bgLayer.appendChild(trayLabel);

      const meterLabel = el('text', {
        x: meterX + 2,
        y: ROW_LABEL_Y,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      meterLabel.textContent = tr('label.remaining', 'Remaining');
      bgLayer.appendChild(meterLabel);

      bgLayer.appendChild(
        el('rect', {
          x: trayX,
          y: ROW_Y,
          width: trayW,
          height: ROW_H,
          rx: BOX_R,
          fill: c.sortedTailBg,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );

      meterBox = el('rect', {
        x: meterX,
        y: ROW_Y,
        width: METER_W,
        height: ROW_H,
        rx: BOX_R,
        'stroke-width': 1.5,
      });
      bgLayer.appendChild(meterBox);

      meterText = el('text', {
        x: meterX + METER_W / 2,
        y: ROW_Y + ROW_H / 2,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 600,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      bgLayer.appendChild(meterText);
      paintMeter(s.remaining);

      // ── 진열대. 채움은 값의 형편, 테두리는 고름의 표식이다.
      const open = new Set(s.reachable);
      const takenHere = s.step !== null && s.step.kind === 'take' ? s.step.at : null;
      const everTaken = new Set(s.taken);

      s.coins.forEach((value, i) => {
        const parts = makeCoin(shelfLayer, value, shelfCx(i), SHELF_CY);
        const reachable = open.has(i);
        parts.disc.setAttribute('fill', reachable ? c.itemDefault : c.bgSubtle);
        parts.label.setAttribute('fill', reachable ? c.text : c.textMuted);
        if (takenHere === i) {
          parts.disc.setAttribute('stroke', c.itemActive);
          parts.disc.setAttribute('stroke-width', String(STROKE_TAKING));
        } else if (everTaken.has(i)) {
          parts.disc.setAttribute('stroke', c.itemActive);
          parts.disc.setAttribute('stroke-width', String(STROKE_TAKEN));
        } else {
          parts.disc.setAttribute('stroke', c.border);
          parts.disc.setAttribute('stroke-width', String(STROKE_PLAIN));
        }
        shelfCoins.push(parts);
      });

      // ── 쟁반. 집은 차례대로 늘어서고, 그 아래에 그때까지 닿은 거리가 남는다.
      //    앉은 동전을 움직이는 길은 이 화면에 없다 — 자리는 차례가 정한다.
      s.taken.forEach((at, slot) => {
        const value = s.coins[at] ?? 0;
        const cx = slotCx(slot);
        const parts = makeCoin(trayLayer, value, cx, trayCy);
        parts.disc.setAttribute('fill', c.itemSorted);
        parts.disc.setAttribute('stroke', c.itemSorted);
        parts.label.setAttribute('fill', c.textInverse);

        const tick = el('text', {
          x: cx,
          y: TICK_Y,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
        // 닿은 거리도 장면의 같은 함수를 지난다 — 계량기와 출처가 하나다.
        tick.textContent = String(reachedBy(s.coins, s.taken.slice(0, slot + 1)));
        trayLayer.appendChild(tick);

        trayCoins.push({ ...parts, tick });
      });
    }

    // ── 캡션. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10).

    function captionText(cap: TakeBestNowCaption): string {
      switch (cap.kind) {
        case 'goal':
          return tr('caption.goal', 'Make {target} out of these.', { target: cap.target });
        case 'take':
          return tr('caption.take', 'Takes {coin} — the largest that fits in {before}.', {
            coin: cap.coin,
            before: cap.before,
          });
        case 'done':
          return tr('caption.done', '{count} coins make {target}. Not one was put back.', {
            count: cap.count,
            target: cap.target,
          });
      }
    }

    function drawCaption(cap: TakeBestNowCaption | null): void {
      caption.textContent = cap === null ? '' : captionText(cap);
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다.

    /** 목표를 겨눈다. 계량기가 한 번 부풀었다 돌아온다. */
    function aim(mine: number): Promise<void> {
      const box = meterBox;
      if (box === null) return Promise.resolve();
      const x = meterX;
      return animate(GOAL_MS, mine, (p) => {
        const grow = GOAL_SWELL * Math.sin(p * Math.PI);
        box.setAttribute('x', String(x - grow));
        box.setAttribute('y', String(ROW_Y - grow));
        box.setAttribute('width', String(METER_W + grow * 2));
        box.setAttribute('height', String(ROW_H + grow * 2));
      });
    }

    /**
     * 진열대의 동전 하나가 쟁반의 다음 자리로 떨어진다.
     *
     * 정적 그리기가 이미 앉혀 두었으므로 진열대 자리로 도로 물려 놓고 떨어뜨린다.
     * 출발 자리는 `step.at`, 떨어지는 동안 계량기가 보일 수는 `step.before` 다 —
     * 둘 다 장면이 말하고 `prev` 도 화면도 되읽지 않는다.
     */
    function drop(
      s: TakeBestNowScene,
      step: { at: number; before: number },
      mine: number,
    ): Promise<void> {
      const slot = s.taken.length - 1;
      const seat = trayCoins[slot];
      if (seat === undefined) return Promise.resolve();

      const fromX = shelfCx(step.at);
      const toX = slotCx(slot);
      const after = s.remaining;

      return animate(DROP_MS, mine, (p) => {
        const x = fromX + (toX - fromX) * easeOut(p);
        const y = SHELF_CY + (trayCy - SHELF_CY) * easeIn(p);
        seat.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        // 앉기 전에는 그 자리의 누계가 아직 참이 아니다. 숨기는 것이 아니라
        // 아직 세지 않은 것이고, 앉는 순간 몫도 함께 준다.
        const landed = p >= LAND_AT;
        seat.tick.setAttribute('opacity', landed ? '1' : '0');
        paintMeter(landed ? after : step.before);
      });
    }

    /** 쌓인 것을 왼쪽부터 하나씩 세어 나간다. 마지막 걸음의 말과 같은 동사다. */
    function tally(mine: number): Promise<void> {
      const seats = [...trayCoins];
      if (seats.length === 0) return Promise.resolve();
      const r = R;
      return animate(TALLY_MS, mine, (p) => {
        for (let k = 0; k < seats.length; k += 1) {
          const local = clamp01(p * (seats.length + 1) - k);
          seats[k].disc.setAttribute('r', String(r + Math.sin(local * Math.PI) * COIN_SWELL));
        }
      });
    }

    function flow(s: TakeBestNowScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'goal':
          return aim(mine);
        case 'take':
          return drop(s, step, mine);
        case 'tally':
          return tally(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(`opacity` · 부푼 `r` · 부푼 계량기 상자)이 한꺼번에 사라져, 흐른
     * 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온
     * 자리 번호와 계기값에서 셈한다 (S-scene).
     */
    async function render(
      next: TakeBestNowScene,
      _prev: TakeBestNowScene | null,
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
        // 낙하 중이었다면 기다리던 쪽을 풀어 준다 — 남는 타이머도 약속도 없다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        clear();
        drawCaption(null);
        for (const layer of [...layers, capLayer]) {
          if (layer.parentNode) layer.parentNode.removeChild(layer);
        }
      },
    };
  },
};
