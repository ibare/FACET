/**
 * growth-outpaces stage — 한 식이 한 막대다.
 *
 * 항 셋이 그 막대를 몫으로 나눠 갖고, n 이 커질수록 최고차항의 경계가 오른쪽으로
 * 미끄러져 나머지 둘을 벽에 밀어붙인다. 라벨은 제 몫 위에 매달려 함께 끌려가고,
 * 자리를 잃으면 지시선이 길게 늘어난다 — 밀려나는 것이 눈에 보이게.
 *
 * **축척을 몫(%)으로 잡은 것이 이 그림의 전제다.** 합이 111 에서 1,010,100 으로
 * 자라 선형 축척으로는 한 화면에 들어오지 않고, 로그를 쓰면 "먹어 치운다" 는
 * 주장이 납작해진다. 몫으로 보이면 축척 문제가 통째로 사라지고 주장만 남는다.
 * 사라진 절대 크기는 머리의 `f(n) = …` 읽기와 항마다의 값이 도로 말해 준다.
 * 전제를 밝히는 것은 글의 일이므로 화면에 각주를 두지 않는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  shiftLightness,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). 가로는 러너가 준다. */
const H = 196;
const W = PIECE_CANVAS_W;

const SIDE = 30;
const BAR_X = SIDE;
const BAR_W = W - SIDE * 2;
const BAR_Y = 70;
const BAR_H = 54;

const HEAD_Y = 26;
const LABEL_Y = 52;
const TRAIL_Y = 142;
const TRAIL_LABEL_Y = 158;
const CAP_Y = 182;

/** 라벨 사이의 최소 틈. 좁아지면 밀어낸다. */
const LABEL_GAP = 10;
/** 막대 안에 몫을 적을 수 있는 최소 폭. */
const PCT_MIN_W = 46;

const SLIDE_MS = 460;
const DROP_MS = 160;
const COLLAPSE_MS = 520;
const FRAME_MS = 16;

type Step = {
  n: number;
  terms: [number, number, number];
  sum: number;
  topIndex: number;
  pctText: string;
  caption: string;
};

type Scene = {
  quadratic: number;
  linear: number;
  constant: number;
};

/**
 * `initialData` 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이기 때문이다 (S-piece).
 */
function readScene(raw: unknown): Scene {
  if (typeof raw !== 'object' || raw === null) return { quadratic: 1, linear: 0, constant: 0 };
  const d = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
  return {
    quadratic: num(d.quadratic, 1),
    linear: num(d.linear, 0),
    constant: num(d.constant, 0),
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 자릿수가 폭을 먹는 자리라 천 단위를 끊어 준다. 도식 위의 표식이다 (C10). */
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

/** 계수에서 항의 이름을 만든다. 수식 표기는 표식이라 키를 만들지 않는다 (C10). */
function termNames(scene: Scene): [string, string, string] {
  const quad = scene.quadratic === 1 ? 'n²' : `${scene.quadratic}n²`;
  const lin = scene.linear === 1 ? 'n' : `${scene.linear}n`;
  return [quad, lin, `${scene.constant}`];
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const growthOutpacesStageView: CanvasView = {
  canvas: { height: H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 이 그림은 캔버스
  // 안쪽에만 그리므로 컨테이너를 건드리지 않는다 — 비우면 그 캔버스가 떨어져
  // 나가 화면이 통째로 빈다 (S-view).
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    const names = termNames(scene);

    // 항 셋은 서로를 가리는 세 범주다 → categorical (S-view 결정 트리 3).
    const hues = categorical(3, 'vivid');
    const hueOf = (i: number): string => hues[i] ?? colors.itemDefault;
    // 가장 큰 항만 제 색을 온전히 쓰고 나머지는 한 단계 밝힌다 (결정 트리 5).
    const dimOf = (i: number): string => shiftLightness(hueOf(i), 0.12);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const root = el('g', {});
    svg.appendChild(root);

    // ── 머리 읽기 — 지금의 n 과 그 자리의 합.
    const nText = el('text', {
      x: BAR_X,
      y: HEAD_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const sumText = el('text', {
      x: BAR_X + BAR_W,
      y: HEAD_Y,
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
    });
    root.appendChild(nText);
    root.appendChild(sumText);

    // ── 막대 — 빈 테두리가 먼저 서고 그 안이 세 몫으로 찬다.
    const frame = el('rect', {
      x: BAR_X,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      rx: 4,
      fill: 'none',
      stroke: colors.border,
      'stroke-width': 1,
    });
    const clip = el('clipPath', { id: `growth-outpaces-clip-${Math.random().toString(36).slice(2, 9)}` });
    const clipRect = el('rect', { x: BAR_X, y: BAR_Y, width: BAR_W, height: BAR_H, rx: 4 });
    clip.appendChild(clipRect);
    const defs = el('defs', {});
    defs.appendChild(clip);
    root.appendChild(defs);

    const segLayer = el('g', { 'clip-path': `url(#${clip.getAttribute('id')!})` });
    root.appendChild(segLayer);
    root.appendChild(frame);

    const segs = [0, 1, 2].map((i) =>
      el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: BAR_H, fill: dimOf(i) }),
    );
    for (const s of segs) segLayer.appendChild(s);

    const pctInside = el('text', {
      x: BAR_X,
      y: BAR_Y + BAR_H / 2 + 4,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.stateInk,
      opacity: 0,
    });
    root.appendChild(pctInside);

    const bigO = el('text', {
      x: BAR_X + BAR_W / 2,
      y: BAR_Y + BAR_H / 2 + 6,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.xl,
      fill: colors.stateInk,
      opacity: 0,
    });
    bigO.textContent = `O(${names[0]})`;
    root.appendChild(bigO);

    // ── 항 라벨 — 제 몫 위에 매달려 함께 끌려간다. 지시선이 그 끈이다.
    const leaders = [0, 1, 2].map((i) =>
      el('line', {
        x1: BAR_X,
        y1: LABEL_Y + 5,
        x2: BAR_X,
        y2: BAR_Y - 3,
        stroke: hueOf(i),
        'stroke-width': 1,
      }),
    );
    // 라벨의 색은 걸음마다 갈린다 — 가장 큰 항만 제 잉크를 쓰고 나머지는 흐려진다.
    // 그래서 여기서는 자리만 잡고 fill 은 layout() 이 정한다.
    const labels = [0, 1, 2].map(() =>
      el('text', {
        x: BAR_X,
        y: LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
        opacity: 0,
      }),
    );
    for (const l of leaders) root.appendChild(l);
    for (const l of labels) root.appendChild(l);

    // ── 발자국 — 최고차항의 경계가 단마다 어디까지 왔는지 남긴다.
    root.appendChild(
      el('line', {
        x1: BAR_X,
        y1: TRAIL_Y,
        x2: BAR_X + BAR_W,
        y2: TRAIL_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    const trailLayer = el('g', {});
    root.appendChild(trailLayer);

    const caption = el('text', {
      x: BAR_X,
      y: CAP_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(caption);

    // ── 지금 그려져 있는 몫. 다음 걸음은 여기서 저기로 미끄러진다.
    let widths: [number, number, number] = [0, 0, 0];
    let current: Step | null = null;

    /** 걸음마다의 운동. 프레임을 걸고 destroy 가 일괄로 거둔다. */
    function animate(durationMs: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / durationMs);
          apply(easeInOut(p));
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

    /** 라벨이 겹치면 밀어내고, 벽에 닿으면 되민다. */
    function placeLabels(centers: number[], halves: number[]): number[] {
      const out = centers.slice();
      for (let i = 1; i < out.length; i += 1) {
        const min = out[i - 1]! + halves[i - 1]! + LABEL_GAP + halves[i]!;
        if (out[i]! < min) out[i] = min;
      }
      let rightLimit = W - 4;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        const max = rightLimit - halves[i]!;
        if (out[i]! > max) out[i] = max;
        rightLimit = out[i]! - halves[i]! - LABEL_GAP;
      }
      let leftLimit = 4;
      for (let i = 0; i < out.length; i += 1) {
        const min = leftLimit + halves[i]!;
        if (out[i]! < min) out[i] = min;
        leftLimit = out[i]! + halves[i]! + LABEL_GAP;
      }
      return out;
    }

    /** 지금의 폭으로 막대·라벨·지시선을 다시 놓는다. */
    function layout(step: Step | null): void {
      let x = BAR_X;
      const centers: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const w = Math.max(0, widths[i]!);
        segs[i]!.setAttribute('x', String(x));
        segs[i]!.setAttribute('width', String(w));
        centers.push(x + w / 2);
        x += w;
      }

      if (step === null) return;

      const texts = [0, 1, 2].map((i) => `${names[i]} = ${group(step.terms[i]!)}`);
      const halves = texts.map((t) => (t.length * Number.parseFloat(fontSizes.sm) * 0.6) / 2);
      const placed = placeLabels(centers, halves);

      for (let i = 0; i < 3; i += 1) {
        labels[i]!.textContent = texts[i]!;
        labels[i]!.setAttribute('x', String(placed[i]!));
        labels[i]!.setAttribute('fill', i === step.topIndex ? colors.text : colors.textMuted);
        leaders[i]!.setAttribute('x1', String(placed[i]!));
        leaders[i]!.setAttribute('x2', String(centers[i]!));
        segs[i]!.setAttribute('fill', i === step.topIndex ? hueOf(i) : dimOf(i));
      }

      const quadW = Math.max(0, widths[0]!);
      if (quadW >= PCT_MIN_W) {
        pctInside.textContent = `${step.pctText}%`;
        pctInside.setAttribute('x', String(BAR_X + quadW / 2));
        pctInside.setAttribute('opacity', '1');
      } else {
        pctInside.setAttribute('opacity', '0');
      }
    }

    function targetWidths(step: Step): [number, number, number] {
      const total = step.sum > 0 ? step.sum : 1;
      const w0 = (step.terms[0]! / total) * BAR_W;
      const w1 = (step.terms[1]! / total) * BAR_W;
      return [w0, w1, Math.max(0, BAR_W - w0 - w1)];
    }

    /** 단이 끝나면 경계가 있던 자리를 자 위에 떨어뜨려 남긴다. */
    async function dropTick(step: Step, boundary: number): Promise<void> {
      const tick = el('line', {
        x1: boundary,
        y1: BAR_Y + BAR_H,
        x2: boundary,
        y2: BAR_Y + BAR_H,
        stroke: hueOf(0),
        'stroke-width': 2,
      });
      const mark = el('text', {
        x: Math.min(W - 12, Math.max(12, boundary)),
        y: TRAIL_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        opacity: 0,
      });
      mark.textContent = `${step.n}`;
      trailLayer.appendChild(tick);
      trailLayer.appendChild(mark);

      const from = BAR_Y + BAR_H;
      await animate(DROP_MS, (t) => {
        const y = from + (TRAIL_Y - 4 - from) * t;
        tick.setAttribute('y1', String(y));
        tick.setAttribute('y2', String(y + 8));
        mark.setAttribute('opacity', String(t));
      });
    }

    function clearAll(): void {
      widths = [0, 0, 0];
      current = null;
      while (trailLayer.firstChild) trailLayer.removeChild(trailLayer.firstChild);
      for (let i = 0; i < 3; i += 1) {
        segs[i]!.setAttribute('width', '0');
        segs[i]!.setAttribute('x', String(BAR_X));
        labels[i]!.setAttribute('opacity', '0');
        leaders[i]!.setAttribute('opacity', '0');
      }
      pctInside.setAttribute('opacity', '0');
      bigO.setAttribute('opacity', '0');
      nText.textContent = '';
      sumText.textContent = '';
      caption.textContent = '';
    }

    clearAll();

    return {
      async showStep(step: Step): Promise<void> {
        current = step;
        nText.textContent = `n = ${group(step.n)}`;
        sumText.textContent = `f(n) = ${group(step.sum)}`;
        caption.textContent = step.caption;
        bigO.setAttribute('opacity', '0');
        for (let i = 0; i < 3; i += 1) {
          labels[i]!.setAttribute('opacity', '1');
          leaders[i]!.setAttribute('opacity', '1');
          labels[i]!.setAttribute('transform', 'translate(0,0)');
        }

        const from: [number, number, number] = [widths[0]!, widths[1]!, widths[2]!];
        const to = targetWidths(step);
        await animate(SLIDE_MS, (t) => {
          widths = [
            from[0] + (to[0] - from[0]) * t,
            from[1] + (to[1] - from[1]) * t,
            from[2] + (to[2] - from[2]) * t,
          ];
          layout(step);
        });
        await dropTick(step, BAR_X + to[0]);
      },

      async collapse(text: string): Promise<void> {
        caption.textContent = text;
        const step = current;
        const from: [number, number, number] = [widths[0]!, widths[1]!, widths[2]!];
        await animate(COLLAPSE_MS, (t) => {
          widths = [from[0] + (BAR_W - from[0]) * t, from[1] * (1 - t), from[2] * (1 - t)];
          if (step) layout(step);
          for (const i of [1, 2]) {
            labels[i]!.setAttribute('opacity', String(1 - t));
            labels[i]!.setAttribute('transform', `translate(0,${(14 * t).toFixed(2)})`);
            leaders[i]!.setAttribute('opacity', String(1 - t));
          }
          labels[0]!.setAttribute('opacity', String(1 - t));
          leaders[0]!.setAttribute('opacity', String(1 - t));
          pctInside.setAttribute('opacity', String(1 - t));
          bigO.setAttribute('opacity', String(Math.max(0, t * 2 - 1)));
        });
      },

      rewind(): void {
        clearAll();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
