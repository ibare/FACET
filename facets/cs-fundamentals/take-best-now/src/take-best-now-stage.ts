/**
 * take-best-now-stage — 진열대에서 쟁반으로 **집어 내리는** 화면.
 *
 * 이 조각의 동사는 "집어 내린다" 이고, 화면의 모든 운동이 그 하나다.
 *
 *   위    진열대. 고를 수 있는 액면이 놓여 있다. 남은 몫에 안 들어가는 것은
 *         손이 닿지 않는 것으로 물러난다.
 *   아래  왼쪽은 쟁반(집은 것이 쌓이는 곳), 오른쪽은 남은 몫.
 *
 * 한 걸음마다 진열대의 동전 하나가 **실제로 아래로 떨어져** 쟁반의 다음 자리에
 * 앉고, 그때 남은 몫이 줄어든다. 떨어진 것이 다시 올라가는 길은 이 파일에 없다 —
 * 쟁반에 앉은 동전을 움직이는 코드가 아예 없는 것이 그 사실을 코드로 말한다.
 *
 * 크기(값의 대소)를 막대 높이로 그리지 않는다. 이 조각이 말하는 것은 대소 비교가
 * 아니라 "하나의 기준으로 집고 되돌아보지 않는다" 이므로, 재는 눈금을 두면
 * 화면이 다른 주장을 하게 된다.
 *
 * 색은 전부 design-tokens 경유 (S-view 결정 트리):
 *   집을 수 있는 것 = itemDefault / 손 안 닿는 것 = 구조색(bgSubtle+border) /
 *   지금 집는 것 = itemActive(+stateInk) / 쟁반에 앉은 것 = itemSorted(+textInverse) /
 *   쟁반 바닥 = sortedTailBg (확정된 영역) / 다 만든 순간의 계량기 = accent(+stateInk).
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
const ROW_Y = 150;
const ROW_H = 80;
const ROW_LABEL_Y = 138;
const METER_W = 132;
const ROW_GAP = 16;
const TRAY_PAD = 14;
/**
 * 쟁반 폭을 정할 때 쓰는 자리 수 **상한**. 자리 표시를 그리지는 않는다 —
 * 몇 번 집게 될지는 재생 전에 알 수 없고, 빈 자리를 그리면 답을 미리 말하게 된다.
 */
const TRAY_CAP = 5;
const CAPTION_Y = 264;
/** 한 걸음의 낙하 시간. 총 재생 길이는 여기에 stepMs 가 더해진다 (S-piece). */
const DROP_MS = 460;

/**
 * 진열대의 자리(ready/out/source)와 움직이는 동전(inflight)과 쟁반에 앉은
 * 것(settled). `source` 는 지금 집어 내리는 중인 자리 — 내려가는 동전과 같은
 * 색으로 칠하면 출발 순간 둘이 한 덩어리로 뭉쳐 보여서, 자리는 테두리만 남긴다.
 */
type CoinState = 'ready' | 'out' | 'source' | 'inflight' | 'settled';

type CoinParts = {
  g: SVGGElement;
  disc: SVGCircleElement;
  label: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** 떨어지는 동안 가로는 일찍 옮겨 붙고 (ease-out), 세로는 뒤로 갈수록 빨라진다. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function easeIn(t: number): number {
  return t * t;
}

export const takeBestNowStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // container 를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    void container;

    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 러너가 넘긴 t 에는 저작 문안이 얹혀 있다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const initial = (params.initialData ?? {}) as Record<string, unknown>;
    const coins = readNumbers(initial.coins);
    const initialTarget = typeof initial.target === 'number' ? initial.target : 0;

    const W = PIECE_CANVAS_W;

    // ── 가로 기하: 상수는 상한만 두고 폭은 캔버스에서 역산한다 (S-piece).
    const cellCount = Math.max(1, coins.length);
    const cellW = Math.min(SHELF_CELL_MAX, Math.floor((W - SIDE_MIN * 2) / cellCount));
    const shelfW = cellW * cellCount;
    const shelfX = Math.round((W - shelfW) / 2);
    const R = Math.max(14, Math.min(COIN_R_MAX, Math.floor(cellW / 2) - 12));

    const trayX = SIDE_MIN;
    const trayW = W - SIDE_MIN * 2 - METER_W - ROW_GAP;
    const meterX = trayX + trayW + ROW_GAP;
    const trayCy = ROW_Y + ROW_H / 2;
    const pitch = Math.min(2 * R + 8, Math.floor((trayW - TRAY_PAD * 2) / TRAY_CAP));
    const trayLastCx = trayX + trayW - TRAY_PAD - R;

    const shelfCx = (index: number): number => shelfX + cellW * index + cellW / 2;
    const slotCx = (slot: number): number =>
      Math.min(trayX + TRAY_PAD + R + slot * pitch, trayLastCx);

    // ── 조립 ────────────────────────────────────────────────────────────
    const root = el('g');
    svg.appendChild(root);

    const rail = el('line', {
      x1: shelfX,
      y1: RAIL_Y,
      x2: shelfX + shelfW,
      y2: RAIL_Y,
      stroke: c.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    root.appendChild(rail);

    const trayLabel = el('text', {
      x: trayX + 2,
      y: ROW_LABEL_Y,
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    trayLabel.textContent = tr('label.taken', 'Taken');
    root.appendChild(trayLabel);

    const meterLabel = el('text', {
      x: meterX + 2,
      y: ROW_LABEL_Y,
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    meterLabel.textContent = tr('label.remaining', 'Remaining');
    root.appendChild(meterLabel);

    const trayFloor = el('rect', {
      x: trayX,
      y: ROW_Y,
      width: trayW,
      height: ROW_H,
      rx: BOX_R,
      fill: c.sortedTailBg,
      stroke: c.border,
      'stroke-width': 1.5,
    });
    root.appendChild(trayFloor);

    const meterBox = el('rect', {
      x: meterX,
      y: ROW_Y,
      width: METER_W,
      height: ROW_H,
      rx: BOX_R,
      fill: c.bgSubtle,
      stroke: c.border,
      'stroke-width': 1.5,
    });
    root.appendChild(meterBox);

    const meterText = el('text', {
      x: meterX + METER_W / 2,
      y: trayCy,
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.xl,
      'font-weight': 600,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    root.appendChild(meterText);

    /** 쟁반에 앉은 동전이 사는 층. 진열대보다 뒤에 그린다. */
    const trayLayer = el('g');
    root.appendChild(trayLayer);

    const shelfLayer = el('g');
    root.appendChild(shelfLayer);

    /** 떨어지는 동전 한 닢만 잠깐 사는 층. 언제나 맨 위. */
    const flyLayer = el('g');
    root.appendChild(flyLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'text-anchor': 'middle',
    });
    root.appendChild(caption);

    // ── 동전 ────────────────────────────────────────────────────────────
    function paint(parts: CoinParts, state: CoinState): void {
      switch (state) {
        case 'ready':
          parts.disc.setAttribute('fill', c.itemDefault);
          parts.disc.setAttribute('stroke', c.text);
          parts.disc.setAttribute('stroke-dasharray', 'none');
          parts.label.setAttribute('fill', c.text);
          break;
        case 'out':
          parts.disc.setAttribute('fill', c.bgSubtle);
          parts.disc.setAttribute('stroke', c.border);
          parts.disc.setAttribute('stroke-dasharray', '5 4');
          parts.label.setAttribute('fill', c.textMuted);
          break;
        case 'source':
          parts.disc.setAttribute('fill', c.itemDefault);
          parts.disc.setAttribute('stroke', c.itemActive);
          parts.disc.setAttribute('stroke-dasharray', 'none');
          parts.label.setAttribute('fill', c.text);
          break;
        case 'inflight':
          parts.disc.setAttribute('fill', c.itemActive);
          parts.disc.setAttribute('stroke', c.itemActive);
          parts.disc.setAttribute('stroke-dasharray', 'none');
          parts.label.setAttribute('fill', c.stateInk);
          break;
        case 'settled':
          parts.disc.setAttribute('fill', c.itemSorted);
          parts.disc.setAttribute('stroke', c.itemSorted);
          parts.disc.setAttribute('stroke-dasharray', 'none');
          parts.label.setAttribute('fill', c.textInverse);
          break;
      }
    }

    function makeCoin(value: number, cx: number, cy: number, state: CoinState): CoinParts {
      const g = el('g', { transform: `translate(${cx} ${cy})` });
      const disc = el('circle', { cx: 0, cy: 0, r: R, 'stroke-width': 2 });
      const label = el('text', {
        x: 0,
        y: 0,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      label.textContent = String(value);
      g.appendChild(disc);
      g.appendChild(label);
      const parts: CoinParts = { g, disc, label };
      paint(parts, state);
      return parts;
    }

    const shelfCoins: CoinParts[] = coins.map((value, i) => {
      const parts = makeCoin(value, shelfCx(i), SHELF_CY, 'ready');
      shelfLayer.appendChild(parts.g);
      return parts;
    });

    // ── 애니메이션 살림 ─────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /** 스스로 다음 회차를 예약하는 루프. destroy 가 반드시 끊는다 (S-view). */
    function tween(ms: number, step: (t: number) => void): Promise<void> {
      if (destroyed) {
        step(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const frame = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const t = Math.min(1, (now() - start) / ms);
          step(t);
          if (t >= 1) {
            finish();
            return;
          }
          const next = requestAnimationFrame(frame);
          frames.add(next);
        };
        const first = requestAnimationFrame(frame);
        frames.add(first);
      });
    }

    // ── 상태 ────────────────────────────────────────────────────────────
    let target = initialTarget;
    let remaining = initialTarget;
    let flying: CoinParts | null = null;
    const settled: CoinParts[] = [];

    function renderMeter(): void {
      meterText.textContent = String(remaining);
      const done = remaining === 0;
      meterBox.setAttribute('fill', done ? c.accent : c.bgSubtle);
      meterBox.setAttribute('stroke', done ? c.accent : c.border);
      meterText.setAttribute('fill', done ? c.stateInk : c.text);
    }

    renderMeter();

    return {
      /** 만들 금액을 세운다. */
      setGoal(nextTarget: number): void {
        target = nextTarget;
        remaining = nextTarget;
        renderMeter();
      },

      /** 남은 몫이 갱신되고, 그 몫에 손이 닿는 자리만 남는다. */
      setRemaining(nextRemaining: number, reachable: number[]): void {
        remaining = nextRemaining;
        renderMeter();
        const open = new Set(reachable);
        shelfCoins.forEach((parts, i) => {
          paint(parts, open.has(i) ? 'ready' : 'out');
        });
      },

      /** 진열대의 동전 하나가 쟁반의 다음 자리로 내려온다. */
      async takeCoin(pick: { index: number; slot: number }): Promise<void> {
        const source = shelfCoins[pick.index];
        if (!source) return;
        const value = coins[pick.index] ?? 0;

        paint(source, 'source');

        const fromX = shelfCx(pick.index);
        const toX = slotCx(pick.slot);
        const coin = makeCoin(value, fromX, SHELF_CY, 'inflight');
        flyLayer.appendChild(coin.g);
        flying = coin;

        await tween(DROP_MS, (t) => {
          const x = fromX + (toX - fromX) * easeOut(t);
          const y = SHELF_CY + (trayCy - SHELF_CY) * easeIn(t);
          coin.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        });

        if (flying === coin) flying = null;
        coin.g.remove();

        // 앉은 뒤로는 이 동전을 움직이는 길이 없다.
        const seated = makeCoin(value, toX, trayCy, 'settled');
        trayLayer.appendChild(seated.g);
        settled.push(seated);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 손으로 짚어 보려고 처음으로 되감는다. */
      rewind(): void {
        for (const parts of settled) parts.g.remove();
        settled.length = 0;
        if (flying) {
          flying.g.remove();
          flying = null;
        }
        for (const parts of shelfCoins) paint(parts, 'ready');
        remaining = target;
        renderMeter();
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 낙하 중이었다면 기다리던 쪽을 풀어 준다 — 남는 타이머도 약속도 없다.
        for (const waiter of [...waiters]) waiter();
        waiters.clear();
        root.remove();
      },
    };
  },
};
