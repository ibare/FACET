/**
 * big-o-stage — 항 넷이 자리를 바꾸고, 마지막에 표기 하나가 남는다.
 *
 * 그리는 것은 셋이다.
 *   1. 가운데 — **자리 격자.** 세로 넉 줄이 1~4 위이고 가로 여섯 칸이 n 사다리다.
 *      항마다 토큰 하나가 제 자리 칸으로 옮겨 가고 지나온 길이 선으로 남는다.
 *      동률이면 같은 줄을 나눠 갖는다.
 *   2. 머리 — 다항식과 지금의 n.
 *   3. 아래 — 이번 단에서 각 항의 값과 몫. 자리가 잃은 절대 크기를 여기가 되돌려 준다.
 *
 * **세로를 값이 아니라 자리로 잡은 것이 이 그림의 전제다.** 합이 1 106 에서
 * 1 061 000 으로 자라 선형 축척으로는 한 화면에 들어오지 않고, 로그 축척을 쓰면
 * "따라잡는다" 는 주장이 되레 납작해진다. 자리는 1 에서 4 까지뿐이라 축척 문제가
 * 아예 없다. 가로도 값이 아니라 **사다리의 순서**다. 두 전제를 밝히는 것은 글의
 * 일이므로 화면에 각주를 두지 않는다.
 *
 * **손잡이 눈금을 자기 상수로 들지 않는다.** 어떤 사다리가 걸려 있는지는 선언이
 * 정하고 (`facet.ts` 의 `initialData`), 이 파일은 `mount` 가 받은 계수·사다리와
 * 걸음마다 오는 payload 로만 그린다. stage 가 algorithm 을 참조할 수 없으므로
 * (원칙 1) 눈금을 여기 다시 적고 싶어지는 자리인데, 그러면 선언과 갈려도 화면이
 * 멀쩡해 보인다. `test/big-o.test.ts` 의 "눈금과 걸음" 이 셋을 한 검사로 묶는다.
 *
 * **세로는 마운트한 뒤 바뀌지 않는다** (S-view). 줄은 넷으로 고정이고 동률은
 * 줄을 늘리는 것이 아니라 한 줄을 나눠 쓰는 것으로 담는다.
 *
 * 애니메이션이 있으므로 메서드가 `Promise` 를 돌려주고, `destroy()` 는 걸어 둔
 * 타이머를 거두고 **기다리던 것을 깨운다** — 깨우지 않으면 projector 가 붙든
 * promise 때문에 `await ctx.emit` 이 영영 안 돌아온다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 344;

const PAD_L = 16;
const HEAD_Y = 26;
const PLACE_LABEL_Y = 46;

/** 자리 격자. */
const GRID_X0 = 52;
const GRID_X1 = 704;
const GRID_W = GRID_X1 - GRID_X0;
const ROW_TOP = 54;
const ROW_H = 48;
const ROWS = 4;
const GRID_BOTTOM = ROW_TOP + ROWS * ROW_H;

const TICK_Y = 266;
const SHARE_LABEL_Y = 290;
const CHIP_Y = 310;
const CAP_Y = 334;

const TOKEN_H = 22;
const TOKEN_MAX_W = 64;
const TOKEN_MIN_W = 28;
/** 한 줄을 나눠 쓸 때 토큰 사이의 틈. */
const TOKEN_GAP = 4;

/** 판이 펴지는 시간, 토큰이 옮겨 가는 시간, 값이 내려앉는 시간, 굳는 시간. */
const GRID_MS = 420;
const MOVE_MS = 480;
const CHIP_MS = 180;
const SETTLE_MS = 560;
const FRAME_MS = 16;

type Pos = { x: number; y: number };

export type StageRung = {
  index: number;
  n: number;
  terms: number[];
  places: number[];
  sum: number;
  pcts: string[];
  caption: string;
};

/** 위첨자. 차수가 둘 이상일 때만 붙는다. 도식 위의 표식이라 키를 만들지 않는다 (C10). */
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 자릿수가 폭을 먹는 자리라 천 단위를 끊어 준다. 표식이다 (C10). */
function group(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.round(value)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
}

/**
 * 계수와 차수에서 항의 이름을 만든다. 수식 표기는 표식이라 키를 만들지 않는다 (C10).
 *
 * **이름에는 자릿수를 끊지 않는다.** 끊는 것은 값 쪽이다 — 식에 적히는 계수는
 * `1000` 이고 그것이 지금 얼마인지를 읽는 수는 `1,000` 이다. 둘을 같은 규칙으로
 * 다루면 `f(n) = … + 1,000` 처럼 식이 읽기 표가 된다.
 */
function termName(coefficient: number, degree: number): string {
  if (degree <= 0) return String(coefficient);
  const power = degree === 1 ? 'n' : `n${SUPERSCRIPT[degree] ?? `^${degree}`}`;
  return coefficient === 1 ? power : `${coefficient}${power}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** `initialData` 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불린다. */
function readScene(raw: unknown): { coefficients: number[]; ladder: number[]; n: number } {
  const d = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const list = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  const coefficients = list(d.coefficients);
  const ladder = list(d.ladder);
  return {
    coefficients: coefficients.length > 0 ? coefficients : [1],
    ladder: ladder.length > 0 ? ladder : [1],
    n: typeof d.n === 'number' ? d.n : (ladder[0] ?? 1),
  };
}

export const bigOStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const scene = readScene(params.initialData);
    const count = scene.coefficients.length;
    const degree = count - 1;
    const names = scene.coefficients.map((c, i) => termName(c, degree - i));
    const columns = Math.max(1, scene.ladder.length);
    const colW = GRID_W / columns;

    // 항 넷은 서로를 가리는 네 범주다 → categorical (S-view 결정 트리 3).
    const hues = categorical(Math.max(1, count), 'vivid');
    const hueOf = (i: number): string => hues[i] ?? colors.itemDefault;

    // ── 기다림 관리 ────────────────────────────────────────────
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 0 → 1 을 ms 동안 흘려 보낸다. 접히면 끝 상태로 건너뛰고 곧바로 돌아온다. */
    function animate(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          step(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          step(ease(raw));
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 층 ────────────────────────────────────────────────────
    const gridLayer = el('g', {});
    const trailLayer = el('g', {});
    const tokenLayer = el('g', {});
    const chipLayer = el('g', {});
    svg.appendChild(gridLayer);
    svg.appendChild(trailLayer);
    svg.appendChild(tokenLayer);
    svg.appendChild(chipLayer);

    function text(
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'start',
      family: string = fonts.mono,
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'font-family': family,
        'font-size': size,
        fill,
        'text-anchor': anchor,
      });
    }

    // ── 머리와 라벨 ────────────────────────────────────────────
    const formula = text(PAD_L, HEAD_Y, fontSizes.md, colors.text);
    formula.textContent = `f(n) = ${names.join(' + ')}`;
    svg.appendChild(formula);

    const nRead = text(GRID_X1, HEAD_Y, fontSizes.md, colors.textMuted, 'end');
    svg.appendChild(nRead);

    const placeLabel = text(PAD_L, PLACE_LABEL_Y, fontSizes.xs, colors.textMuted, 'start', fonts.body);
    placeLabel.textContent = tr('label.place', 'Place');
    svg.appendChild(placeLabel);

    const sizeLabel = text(PAD_L, TICK_Y, fontSizes.xs, colors.textMuted, 'start', fonts.body);
    sizeLabel.textContent = tr('label.size', 'Input size n');
    svg.appendChild(sizeLabel);

    const shareLabel = text(PAD_L, SHARE_LABEL_Y, fontSizes.xs, colors.textMuted, 'start', fonts.body);
    shareLabel.textContent = tr('label.share', 'Share of the sum');
    svg.appendChild(shareLabel);

    const caption = text(PAD_L, CAP_Y, fontSizes.sm, colors.text, 'start', fonts.body);
    svg.appendChild(caption);

    /** 마지막에 남는 표기. 계수를 떨어뜨린 최고차항 하나다. */
    const notation = text(
      GRID_X0 + GRID_W / 2,
      ROW_TOP + (ROWS * ROW_H) / 2 + 8,
      fontSizes.xl,
      colors.text,
      'middle',
    );
    notation.textContent = `O(${termName(1, degree)})`;
    notation.setAttribute('opacity', '0');
    svg.appendChild(notation);

    // ── 아래 읽기 — 항마다 값과 몫 ──────────────────────────────
    const chipW = (GRID_X1 - PAD_L) / Math.max(1, count);
    const chips = scene.coefficients.map((_, i) => {
      const x = PAD_L + i * chipW;
      const dot = el('rect', {
        x,
        y: CHIP_Y - 9,
        width: 9,
        height: 9,
        rx: 2,
        fill: hueOf(i),
      });
      const label = text(x + 15, CHIP_Y, fontSizes.xs, colors.textMuted);
      chipLayer.appendChild(dot);
      chipLayer.appendChild(label);
      return label;
    });

    // ── 토큰 ──────────────────────────────────────────────────
    const tokens = scene.coefficients.map((_, i) => {
      const g = el('g', { opacity: 0 });
      const box = el('rect', {
        x: -TOKEN_MAX_W / 2,
        y: -TOKEN_H / 2,
        width: TOKEN_MAX_W,
        height: TOKEN_H,
        rx: 4,
        fill: hueOf(i),
      });
      const label = text(0, 4, fontSizes.xs, colors.stateInk, 'middle');
      label.textContent = names[i] ?? '';
      g.appendChild(box);
      g.appendChild(label);
      tokenLayer.appendChild(g);
      return { g, box };
    });

    let previous: Pos[] | null = null;

    function colCenter(index: number): number {
      return GRID_X0 + (index + 0.5) * colW;
    }

    function rowCenter(place: number): number {
      return ROW_TOP + clamp(place, 0, ROWS - 1) * ROW_H + ROW_H / 2;
    }

    /** 이번 단에서 각 항이 설 자리. 동률이면 한 줄을 나눠 쓴다. */
    function placementsOf(step: StageRung): { pos: Pos[]; width: number } {
      const groups = new Map<number, number[]>();
      for (let i = 0; i < step.places.length; i += 1) {
        const place = clamp(step.places[i] ?? 0, 0, ROWS - 1);
        const bucket = groups.get(place) ?? [];
        bucket.push(i);
        groups.set(place, bucket);
      }
      let widest = 1;
      for (const bucket of groups.values()) widest = Math.max(widest, bucket.length);
      // 한 줄을 셋이 나눠 써도 이름 넉 자(`1000`)가 들어가야 한다. 칸 폭에서
      // 틈을 뺀 몫이 그 아래로 떨어지지 않게 바닥을 둔다.
      const width = clamp((colW - 10) / widest - TOKEN_GAP, TOKEN_MIN_W, TOKEN_MAX_W);

      const pos: Pos[] = scene.coefficients.map(() => ({ x: colCenter(step.index), y: rowCenter(0) }));
      for (const [place, bucket] of groups) {
        const span = bucket.length * width + (bucket.length - 1) * TOKEN_GAP;
        const left = colCenter(step.index) - span / 2;
        bucket.forEach((termIndex, k) => {
          pos[termIndex] = { x: left + k * (width + TOKEN_GAP) + width / 2, y: rowCenter(place) };
        });
      }
      return { pos, width };
    }

    function placeToken(i: number, at: Pos, width: number, lead: boolean): void {
      const token = tokens[i];
      if (!token) return;
      token.g.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
      token.box.setAttribute('x', String(-width / 2));
      token.box.setAttribute('width', String(width));
      token.box.setAttribute('stroke', lead ? colors.text : 'none');
      token.box.setAttribute('stroke-width', lead ? '1.5' : '0');
    }

    /** 격자를 다시 그린다. 밟지 않을 칸은 눈금을 흐리게 둔다. */
    function drawGrid(rungs: number): { sweep: SVGLineElement[]; ticks: SVGGElement[] } {
      gridLayer.textContent = '';
      const sweep: SVGLineElement[] = [];
      const ticks: SVGGElement[] = [];

      for (let r = 0; r < ROWS; r += 1) {
        if (r % 2 === 0) {
          gridLayer.appendChild(
            el('rect', {
              x: GRID_X0,
              y: ROW_TOP + r * ROW_H,
              width: GRID_W,
              height: ROW_H,
              fill: colors.bgSubtle,
            }),
          );
        }
        const line = el('line', {
          x1: GRID_X0,
          y1: ROW_TOP + (r + 1) * ROW_H,
          x2: GRID_X0,
          y2: ROW_TOP + (r + 1) * ROW_H,
          stroke: colors.border,
          'stroke-width': 1,
        });
        gridLayer.appendChild(line);
        sweep.push(line);

        const number = text(GRID_X0 - 10, rowCenter(r) + 4, fontSizes.xs, colors.textMuted, 'end');
        number.textContent = String(r + 1);
        gridLayer.appendChild(number);
      }

      for (let i = 0; i < columns; i += 1) {
        if (i > 0) {
          gridLayer.appendChild(
            el('line', {
              x1: GRID_X0 + i * colW,
              y1: ROW_TOP,
              x2: GRID_X0 + i * colW,
              y2: GRID_BOTTOM,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
        }
        const g = el('g', {});
        const tick = text(
          colCenter(i),
          TICK_Y,
          fontSizes.xs,
          i < rungs ? colors.text : colors.ghostOutline,
          'middle',
        );
        tick.textContent = group(scene.ladder[i] ?? 0);
        g.appendChild(tick);
        gridLayer.appendChild(g);
        ticks.push(g);
      }
      return { sweep, ticks };
    }

    function clearRun(): void {
      trailLayer.textContent = '';
      previous = null;
      notation.setAttribute('opacity', '0');
      for (const token of tokens) {
        token.g.setAttribute('opacity', '0');
        token.g.setAttribute('transform', 'translate(0 0)');
      }
      for (const chip of chips) chip.textContent = '';
      nRead.textContent = '';
    }

    drawGrid(columns);
    clearRun();
    nRead.textContent = `n = ${group(scene.n)}`;

    return {
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },

      /** 판을 세운다. 줄이 왼쪽에서 오른쪽으로 그어지고 눈금이 내려앉는다. */
      async setup(n: number, rungs: number, message: string) {
        clearRun();
        caption.textContent = message;
        nRead.textContent = `n = ${group(n)}`;
        const { sweep, ticks } = drawGrid(rungs);
        for (const g of ticks) g.setAttribute('opacity', '0');
        await animate(GRID_MS, (t) => {
          for (const line of sweep) line.setAttribute('x2', String(GRID_X0 + GRID_W * t));
          ticks.forEach((g, i) => {
            const local = clamp((t - i * 0.08) / 0.5, 0, 1);
            g.setAttribute('opacity', String(local));
            g.setAttribute('transform', `translate(0 ${(-8 * (1 - local)).toFixed(2)})`);
          });
        });
      },

      /** 한 단 — 토큰이 제 자리로 옮겨 가고 지나온 길이 남는다. */
      async showRung(step: StageRung) {
        const { pos, width } = placementsOf(step);
        const lead = step.places.map((p) => p === 0);
        const from = previous;

        // 값은 옮겨 가는 동안 비운다 — 이동 중의 칸에 옛 자리의 값을 남기면 거짓이 된다.
        for (const chip of chips) chip.setAttribute('opacity', '0');
        nRead.textContent = `n = ${group(step.n)}`;

        if (from === null) {
          for (let i = 0; i < tokens.length; i += 1) {
            placeToken(i, pos[i] ?? { x: GRID_X0, y: ROW_TOP }, width, lead[i] === true);
          }
          await animate(MOVE_MS, (t) => {
            for (let i = 0; i < tokens.length; i += 1) {
              const token = tokens[i];
              const at = pos[i];
              if (!token || !at) continue;
              token.g.setAttribute('opacity', String(t));
              token.g.setAttribute(
                'transform',
                `translate(${at.x.toFixed(2)} ${(at.y - 12 * (1 - t)).toFixed(2)})`,
              );
            }
          });
        } else {
          const trails = tokens.map((_, i) => {
            const start = from[i];
            if (!start) return null;
            trailLayer.appendChild(
              el('circle', { cx: start.x, cy: start.y, r: 2.5, fill: hueOf(i) }),
            );
            const line = el('line', {
              x1: start.x,
              y1: start.y,
              x2: start.x,
              y2: start.y,
              stroke: hueOf(i),
              'stroke-width': 1.5,
              opacity: 0.55,
            });
            trailLayer.appendChild(line);
            return line;
          });

          for (let i = 0; i < tokens.length; i += 1) {
            placeToken(i, from[i] ?? { x: GRID_X0, y: ROW_TOP }, width, lead[i] === true);
          }
          await animate(MOVE_MS, (t) => {
            for (let i = 0; i < tokens.length; i += 1) {
              const token = tokens[i];
              const start = from[i];
              const at = pos[i];
              if (!token || !start || !at) continue;
              const x = start.x + (at.x - start.x) * t;
              const y = start.y + (at.y - start.y) * t;
              token.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
              const line = trails[i];
              if (line) {
                line.setAttribute('x2', x.toFixed(2));
                line.setAttribute('y2', y.toFixed(2));
              }
            }
          });
        }

        previous = pos;

        // 값이 자리에 내려앉는다. 옮겨 간 뒤에만 보인다.
        for (let i = 0; i < chips.length; i += 1) {
          const chip = chips[i];
          if (!chip) continue;
          chip.textContent = `${names[i] ?? ''} = ${group(step.terms[i] ?? 0)} · ${step.pcts[i] ?? '0.0'}%`;
          chip.setAttribute('fill', i === 0 ? colors.text : colors.textMuted);
        }
        caption.textContent = step.caption;
        await animate(CHIP_MS, (t) => {
          for (const chip of chips) chip.setAttribute('opacity', String(t));
        });
      },

      /** 나머지를 지우면 표기 하나가 남는다. */
      async settle(message: string) {
        caption.textContent = message;
        const lines = [...trailLayer.querySelectorAll('line')];
        await animate(SETTLE_MS, (t) => {
          for (let i = 1; i < tokens.length; i += 1) {
            const token = tokens[i];
            const at = previous?.[i];
            if (!token || !at) continue;
            token.g.setAttribute('opacity', String(1 - t));
            token.g.setAttribute(
              'transform',
              `translate(${at.x.toFixed(2)} ${(at.y + 16 * t).toFixed(2)})`,
            );
          }
          for (const line of lines) line.setAttribute('opacity', String(0.55 * (1 - t * 0.8)));
          for (let i = 1; i < chips.length; i += 1) {
            chips[i]?.setAttribute('opacity', String(1 - t));
          }
          notation.setAttribute('opacity', String(clamp(t * 2 - 1, 0, 1)));
        });
      },

      reset() {
        drawGrid(columns);
        clearRun();
        nRead.textContent = `n = ${group(scene.n)}`;
        caption.textContent = '';
      },
    };
  },
};
