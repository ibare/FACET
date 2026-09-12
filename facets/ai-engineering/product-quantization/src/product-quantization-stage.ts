/**
 * 곱 양자화 stage — 값 여덟을 **살** 로 세운 별 위에서 되살린 값이 대표의 고리에
 * 눌려 붙는 것을 본다.
 *
 * 어째서 이 모양인가. 이 화면의 동사는 "맞물린다" 이고 맞물리는 두 쪽은 **오차**
 * 와 **자리** 다. 값을 칸에 담아 한 줄로 늘어놓으면 둘 중 어느 쪽도 보이지 않는다 —
 * 값이 달라진 것만 보인다. 그래서
 *
 *   - 대표 넷(2 · 4 · 6 · 8)을 **동심원 넷** 으로 둔다. 값이 고른 격자라 원이 된다.
 *   - 되살린 값은 토막마다 하나뿐이므로 그 토막의 살들이 **한 고리 위의 호** 로
 *     모인다. 토막을 쪼개면 호가 짧아지고 각자 제 고리를 찾아 흩어진다.
 *   - 오차는 원본 꼭짓점과 되살린 자리 사이의 **벌어짐** 이다. 재는 그 자리에
 *     그대로 둔다 — 옆의 계기로 날려 보내지 않는다.
 *   - 자리는 오른쪽에 **쌓이는 번호** 다. 호가 짧아질수록 번호가 하나씩 올라온다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 색은 전부 design-tokens 경유다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 캔버스 세로. 그림이 정하는 값이라 그림 곁에 둔다. 가로는 러너가 정한다.
 * 마운트한 뒤로 viewBox 를 다시 재지 않는다 (S-view).
 */
const H = 366;

/** 별의 중심과 축척. 값 1 이 UNIT 만큼의 반지름을 얻는다. */
const STAR_CX = 214;
const STAR_CY = 174;
const UNIT = 16;
/** 구획 칼금과 색지가 뻗는 끝. 가장 바깥 고리(값 8)보다 조금 넓다. */
const OUTER = UNIT * 8.6;
/** 번호 딱지를 되살린 자리 바깥으로 밀어 놓는 거리. */
const CHIP_GAP = 21;

/** 오른쪽에 번호가 쌓이는 자리. */
const SLOT_X = 452;
const SLOT_W = 74;
const SLOT_BASE_Y = 316;
const SLOT_H = 30;
const SLOT_GAP = 3;

const CAPTION_X = 20;
const CAPTION_Y = 352;

const FRAME_MS = 16;
/** 되살린 값이 고리로 옮겨 붙는 시간. */
const MOVE_MS = 420;
/** 구획을 다시 긋는 시간. */
const CUT_MS = 300;

type Scene = { vector: number[]; grid: number[] };

/** initialData 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불린다. */
function readScene(initial: unknown): Scene {
  const src = (typeof initial === 'object' && initial !== null ? initial : {}) as Record<string, unknown>;
  const nums = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  return { vector: nums(src.vector), grid: nums(src.grid) };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
/** 시작과 끝을 눅인 진행. 옮겨 붙는 것이 툭 끊기지 않게. */
const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export const productQuantizationStageView: CanvasView = {
  canvas: { height: H },

  // 컨테이너는 건드리지 않는다 — 러너가 캔버스를 먼저 붙이고 mount 를 부르므로
  // `container.textContent = ''` 한 줄이 화면을 통째로 지운다 (S-view). 그릴 곳은
  // `params.canvas` 하나뿐이라 컨테이너를 받기만 하고 쓰지 않는다.
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const svg = params.canvas;

    const n = scene.vector.length;
    /** 살 i 의 각도. 맨 위에서 시작해 시계 방향으로 돈다. */
    const angleOf = (i: number): number => -90 + (360 / Math.max(1, n)) * i;
    const half = 180 / Math.max(1, n);
    const px = (a: number, r: number): number => STAR_CX + r * Math.cos(rad(a));
    const py = (a: number, r: number): number => STAR_CY + r * Math.sin(rad(a));

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          onFrame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 층
    const root = el('g', { class: 'facet-pq' });
    const gShade = el('g', {});
    const gRing = el('g', {});
    const gCut = el('g', {});
    const gGap = el('g', {});
    const gOriginal = el('g', {});
    const gRestored = el('g', {});
    const gChip = el('g', {});
    const gSlot = el('g', {});
    const gText = el('g', {});
    root.append(gShade, gRing, gCut, gGap, gOriginal, gRestored, gChip, gSlot, gText);
    svg.appendChild(root);

    // ── 대표 넷의 고리. 값이 고른 격자라 원으로 선다.
    for (const value of scene.grid) {
      gRing.appendChild(
        el('circle', {
          cx: STAR_CX,
          cy: STAR_CY,
          r: value * UNIT,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 고리에 새긴 대표값. 수식 표기라 표식이다 (C10).
      const label = el('text', {
        x: px(angleOf(0) - half, value * UNIT) - 4,
        y: py(angleOf(0) - half, value * UNIT) + 4,
        'text-anchor': 'end',
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      label.textContent = String(value);
      gRing.appendChild(label);
    }

    // ── 살. 값이 놓이는 축이다.
    for (let i = 0; i < n; i += 1) {
      gRing.appendChild(
        el('line', {
          x1: STAR_CX,
          y1: STAR_CY,
          x2: px(angleOf(i), OUTER),
          y2: py(angleOf(i), OUTER),
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        }),
      );
    }

    // ── 원본. 이 화면에서 유일하게 움직이지 않는 것이다.
    const originalPoints = scene.vector
      .map((v, i) => `${px(angleOf(i), v * UNIT)},${py(angleOf(i), v * UNIT)}`)
      .join(' ');
    gOriginal.appendChild(
      el('polygon', {
        points: originalPoints,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
      }),
    );
    for (let i = 0; i < n; i += 1) {
      gOriginal.appendChild(
        el('circle', {
          cx: px(angleOf(i), scene.vector[i] * UNIT),
          cy: py(angleOf(i), scene.vector[i] * UNIT),
          r: 3,
          fill: colors.text,
        }),
      );
    }

    // ── 되살린 것. 토막마다 한 고리 위의 호로 모인다.
    const restoredPath = el('path', {
      class: 'facet-pq__restored',
      d: '',
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    });
    gRestored.appendChild(restoredPath);

    // ── 벌어짐. 길이가 곧 그 자리의 오차다.
    const gapLines: SVGLineElement[] = [];
    for (let i = 0; i < n; i += 1) {
      const line = el('line', {
        class: 'facet-pq__gap',
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        stroke: colors.danger,
        'stroke-width': 2,
      });
      gapLines.push(line);
      gGap.appendChild(line);
    }

    // ── 색지와 칼금. 토막을 가른다.
    const shades: SVGPathElement[] = [];
    const cuts: SVGLineElement[] = [];
    for (let i = 0; i < n; i += 1) {
      const shade = el('path', { d: '', fill: colors.subtreeShadeLeft, stroke: 'none' });
      shades.push(shade);
      gShade.appendChild(shade);
      const cut = el('line', {
        x1: px(angleOf(i) - half, 8),
        y1: py(angleOf(i) - half, 8),
        x2: px(angleOf(i) - half, 8),
        y2: py(angleOf(i) - half, 8),
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '4 3',
      });
      cuts.push(cut);
      gCut.appendChild(cut);
    }

    // ── 글. 범례 · 오른쪽 기둥의 머리말 · 캡션.
    function legendRow(y: number, stroke: string, text: string): void {
      gText.appendChild(
        el('line', { x1: CAPTION_X, y1: y, x2: CAPTION_X + 16, y2: y, stroke, 'stroke-width': 3 }),
      );
      const label = el('text', {
        x: CAPTION_X + 22,
        y: y + 4,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      label.textContent = text;
      gText.appendChild(label);
    }
    legendRow(22, colors.text, t('label.original', 'Original'));
    legendRow(40, colors.accent, t('label.restored', 'Restored'));
    legendRow(58, colors.danger, t('label.gap', 'Gap = error'));

    const slotTitle = el('text', {
      x: SLOT_X,
      y: 44,
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    slotTitle.textContent = t('label.slots', 'Numbers kept');
    gText.appendChild(slotTitle);

    const byteText = el('text', {
      x: SLOT_X + SLOT_W / 2,
      y: SLOT_BASE_Y + 20,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
    });
    // `0 B` 는 수식 표기라 표식이다 — 키를 만들지 않는다 (C10).
    byteText.textContent = '0 B';
    gText.appendChild(byteText);

    const captionText = el('text', {
      class: 'facet-pq__caption',
      x: CAPTION_X,
      y: CAPTION_Y,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    gText.appendChild(captionText);

    // ── 움직이는 상태
    /** 살마다 지금 되살린 값. 처음에는 원본 그대로라 벌어짐이 없다. */
    const restoredValue = scene.vector.slice();
    /** 칼금이 뻗은 길이. */
    const cutLength = new Array<number>(n).fill(0);
    /** 색지가 덮은 각도 범위. */
    const shadeFrom = new Array<number>(n).fill(angleOf(0) - half);
    const shadeTo = new Array<number>(n).fill(angleOf(0) - half);
    let activeSector = -1;
    let sectorSize = n;
    const chips = new Map<number, { group: SVGGElement; from: number; size: number }>();
    const slots: SVGGElement[] = [];

    function pathOfRestored(): string {
      if (n === 0) return '';
      const seg: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const r = restoredValue[i] * UNIT;
        const x = px(angleOf(i), r);
        const y = py(angleOf(i), r);
        if (i === 0) {
          seg.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
          continue;
        }
        const prev = restoredValue[i - 1] * UNIT;
        // 같은 고리 위의 이웃이면 호로 잇는다 — 토막 하나가 한 호로 읽히게.
        if (Math.abs(prev - r) < 0.4) seg.push(`A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`);
        else seg.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
      }
      const first = restoredValue[0] * UNIT;
      const last = restoredValue[n - 1] * UNIT;
      const x0 = px(angleOf(0), first);
      const y0 = py(angleOf(0), first);
      if (Math.abs(first - last) < 0.4) {
        seg.push(`A ${first.toFixed(2)} ${first.toFixed(2)} 0 0 1 ${x0.toFixed(2)} ${y0.toFixed(2)}`);
      } else {
        seg.push(`L ${x0.toFixed(2)} ${y0.toFixed(2)}`);
      }
      return seg.join(' ');
    }

    function shadePath(from: number, to: number): string {
      const span = to - from;
      if (span <= 0.01) return '';
      if (span >= 359.9) {
        const a = px(from, OUTER);
        const b = py(from, OUTER);
        const c = px(from + 180, OUTER);
        const d = py(from + 180, OUTER);
        return `M ${a.toFixed(2)} ${b.toFixed(2)} A ${OUTER} ${OUTER} 0 1 1 ${c.toFixed(2)} ${d.toFixed(2)} A ${OUTER} ${OUTER} 0 1 1 ${a.toFixed(2)} ${b.toFixed(2)} Z`;
      }
      const large = span > 180 ? 1 : 0;
      return [
        `M ${STAR_CX} ${STAR_CY}`,
        `L ${px(from, OUTER).toFixed(2)} ${py(from, OUTER).toFixed(2)}`,
        `A ${OUTER} ${OUTER} 0 ${large} 1 ${px(to, OUTER).toFixed(2)} ${py(to, OUTER).toFixed(2)}`,
        'Z',
      ].join(' ');
    }

    function paintShades(): void {
      for (let k = 0; k < n; k += 1) {
        shades[k].setAttribute('d', shadePath(shadeFrom[k], shadeTo[k]));
        // 고르는 중인 토막만 짙게. 나머지는 하나 걸러 옅게 깔아 묶음을 보인다.
        const lit = k === activeSector;
        shades[k].setAttribute('fill', lit ? colors.itemComparing : colors.subtreeShadeLeft);
        shades[k].setAttribute('opacity', lit ? '0.22' : k % 2 === 0 ? '1' : '0');
      }
    }

    function paintCuts(): void {
      for (let i = 0; i < n; i += 1) {
        const a = angleOf(i) - half;
        cuts[i].setAttribute('x2', px(a, 8 + cutLength[i]).toFixed(2));
        cuts[i].setAttribute('y2', py(a, 8 + cutLength[i]).toFixed(2));
      }
    }

    function paintGaps(): void {
      for (let i = 0; i < n; i += 1) {
        const a = angleOf(i);
        const rr = restoredValue[i] * UNIT;
        const ro = scene.vector[i] * UNIT;
        gapLines[i].setAttribute('x1', px(a, rr).toFixed(2));
        gapLines[i].setAttribute('y1', py(a, rr).toFixed(2));
        gapLines[i].setAttribute('x2', px(a, ro).toFixed(2));
        gapLines[i].setAttribute('y2', py(a, ro).toFixed(2));
      }
    }

    function paintChip(sector: number): void {
      const chip = chips.get(sector);
      if (!chip) return;
      const mid = angleOf(chip.from) + half * (chip.size - 1);
      const r = restoredValue[chip.from] * UNIT + CHIP_GAP;
      chip.group.setAttribute(
        'transform',
        `translate(${px(mid, r).toFixed(2)} ${py(mid, r).toFixed(2)})`,
      );
    }

    function paintRestored(): void {
      restoredPath.setAttribute('d', pathOfRestored());
      paintGaps();
      for (const sector of chips.keys()) paintChip(sector);
    }

    function clearRound(): void {
      for (const chip of chips.values()) chip.group.remove();
      chips.clear();
      for (const slot of slots) slot.remove();
      slots.length = 0;
      byteText.textContent = '0 B';
      activeSector = -1;
    }

    function addChip(sector: number, from: number, size: number, code: number): void {
      const group = el('g', {});
      group.appendChild(
        el('rect', {
          x: -13,
          y: -10,
          width: 26,
          height: 20,
          rx: 6,
          fill: colors.accent,
          stroke: 'none',
        }),
      );
      const label = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: colors.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      // `#3` 은 도형에 새긴 번호라 표식이다 (C10).
      label.textContent = `#${code}`;
      group.appendChild(label);
      gChip.appendChild(group);
      chips.set(sector, { group, from, size });
      paintChip(sector);
    }

    function addSlot(code: number): SVGGElement {
      const group = el('g', { class: 'facet-pq__slot' });
      group.appendChild(
        el('rect', {
          x: SLOT_X,
          y: 0,
          width: SLOT_W,
          height: SLOT_H,
          rx: 5,
          fill: colors.accent,
          stroke: 'none',
        }),
      );
      const label = el('text', {
        x: SLOT_X + SLOT_W / 2,
        y: SLOT_H / 2 + 4,
        'text-anchor': 'middle',
        fill: colors.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      label.textContent = `#${code}`;
      group.appendChild(label);
      gSlot.appendChild(group);
      slots.push(group);
      byteText.textContent = `${slots.length} B`;
      return group;
    }

    // ── 처음 화면. 되살린 것이 원본에 포개져 있어 벌어짐이 없다.
    paintShades();
    paintCuts();
    paintRestored();

    async function setParts(parts: number, size: number): Promise<void> {
      clearRound();
      sectorSize = size;
      const cutFrom = cutLength.slice();
      const shadeFromWas = shadeFrom.slice();
      const shadeToWas = shadeTo.slice();
      const cutTo = new Array<number>(n).fill(0);
      const nextFrom = new Array<number>(n).fill(0);
      const nextTo = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i += 1) {
        // 토막이 하나뿐이면 가를 것이 없다 — 칼금을 전부 거둔다.
        cutTo[i] = parts > 1 && i % size === 0 ? OUTER - 8 : 0;
      }
      for (let k = 0; k < n; k += 1) {
        if (k < parts) {
          nextFrom[k] = angleOf(k * size) - half;
          nextTo[k] = nextFrom[k] + (360 / parts);
        } else {
          // 사라지는 색지는 제 시작 각도에서 오므라든다.
          nextFrom[k] = shadeFromWas[k];
          nextTo[k] = shadeFromWas[k];
        }
        if (shadeToWas[k] - shadeFromWas[k] <= 0.01) {
          // 새로 생기는 색지는 제 시작 각도에서 벌어진다.
          shadeFrom[k] = nextFrom[k];
          shadeTo[k] = nextFrom[k];
        }
      }
      const openFrom = shadeFrom.slice();
      const openTo = shadeTo.slice();
      await tween(CUT_MS, (p) => {
        for (let i = 0; i < n; i += 1) cutLength[i] = lerp(cutFrom[i], cutTo[i], p);
        for (let k = 0; k < n; k += 1) {
          shadeFrom[k] = lerp(openFrom[k], nextFrom[k], p);
          shadeTo[k] = lerp(openTo[k], nextTo[k], p);
        }
        paintCuts();
        paintShades();
      });
    }

    async function chooseCode(info: {
      sector: number;
      from: number;
      size: number;
      code: number;
      value: number;
    }): Promise<void> {
      activeSector = info.sector;
      sectorSize = info.size;
      paintShades();
      addChip(info.sector, info.from, info.size, info.code);
      const slot = addSlot(info.code);
      const slotY = SLOT_BASE_Y - (slots.length * SLOT_H + (slots.length - 1) * SLOT_GAP);
      const was = restoredValue.slice();
      await tween(MOVE_MS, (p) => {
        for (let i = info.from; i < info.from + info.size; i += 1) {
          restoredValue[i] = lerp(was[i], info.value, p);
        }
        // 번호는 아래에서 제 자리로 올라온다.
        slot.setAttribute('transform', `translate(0 ${lerp(SLOT_BASE_Y, slotY, p).toFixed(2)})`);
        paintRestored();
      });
    }

    function settle(): void {
      activeSector = -1;
      paintShades();
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    return {
      destroy(): void {
        destroyed = true;
        // 걸어 둔 것을 먼저 거두고, 기다리던 것을 깨운다. 깨우지 않으면
        // projector 가 잡고 있는 promise 가 안 풀려 알고리즘이 붙들린다.
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
      setParts,
      chooseCode,
      settle,
      setCaption,
      /** 검사가 지금 되살린 값을 읽는 자리. 화면이 말하는 수와 견주는 데 쓴다. */
      restoredValues(): number[] {
        return restoredValue.slice();
      },
      /** 지금 쌓인 번호의 수. */
      slotCount(): number {
        return slots.length;
      },
      /** 지금 토막 하나에 든 값의 수. */
      chunkSize(): number {
        return sectorSize;
      },
    };
  },
};
