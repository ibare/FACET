/**
 * 최근접 교차 stage — 위에서 내려다본 광선 하나와 구 다섯.
 *
 * 가로는 광선이 나아가는 쪽(−z), 세로는 x (아래가 +x). 눈에서 나간 굵은 선이
 * "지금까지 가장 가까운 t" 까지의 몫이고, 그 끝의 막대가 최근접이다. 시험마다
 * 근 두 점이 눈에서 광선을 따라 제자리로 나가고, 더 가까운 근이면 막대가 그
 * 자리로 **뒤로 물러난다** — 굵은 선이 줄어든다. 마지막에는 이긴 구의 색이
 * 광선을 거슬러 픽셀로 돌아온다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate, ViewInstance } from '@ffacet/core/runtime';
import type { SphereSpec, Vec3 } from './algorithm.js';
import type { NearestHitScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 토막의 길이 (상한). 시험 한 번 = 근이 나감, 더 가까우면 + 막대가 물러남 */
const MOVE_MS = 520;
/** 그림 칸의 위아래 — 목록 줄 아래부터 캡션 두 줄 위까지 */
const SCENE_TOP = 74;
const SCENE_BOTTOM = H - 58;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 소수 자리로 끊고 -0 을 0 으로 */
function fixed(x: number, digits: number): string {
  const s = x.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  // 음수는 긴 빼기표로
  return s.startsWith('-') ? `\u2212${s.slice(1)}` : s;
}

function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

/** 선형 0..1 RGB 를 칠할 색으로 — 색은 자료의 값 그대로다 (감마 없음) */
function paint(c: Vec3): string {
  const hex = c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

function ease(e: number): number {
  return e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2;
}

type Geometry = {
  /** 광선 위 t 의 화면 자리 */
  at(tRay: number): { x: number; y: number };
  /** 세계 점의 화면 자리 */
  point(p: Vec3): { x: number; y: number };
  scale: number;
  tBack: number;
  tFar: number;
};

/** 바탕(광선 · 구)에서 화면 자리를 정한다 — 가로 −z, 세로 x */
function layout(scene: NearestHitScene, top: number, bottom: number): Geometry {
  const { origin, dir, objects } = scene;
  if (!(dir[2] < 0)) throw new Error('nearest-hit stage: 광선이 −z 쪽으로 나가야 이 그림이 선다');
  let hMin = -origin[2];
  let hMax = -origin[2];
  let vMin = origin[0];
  let vMax = origin[0];
  for (const o of objects) {
    hMin = Math.min(hMin, -o.center[2] - o.radius);
    hMax = Math.max(hMax, -o.center[2] + o.radius);
    vMin = Math.min(vMin, o.center[0] - o.radius);
    vMax = Math.max(vMax, o.center[0] + o.radius);
  }
  // 광선 끝 화살표 몫과 가장자리 여백
  const hSpan = hMax - hMin;
  hMax += hSpan * 0.06;
  hMin -= hSpan * 0.02;
  vMin -= 0.3;
  vMax += 0.3;
  const margin = 16;
  const scale = Math.min((PIECE_CANVAS_W - 2 * margin) / (hMax - hMin), (bottom - top) / (vMax - vMin));
  const left = (PIECE_CANVAS_W - scale * (hMax - hMin)) / 2;
  const upper = top + (bottom - top - scale * (vMax - vMin)) / 2;
  const point = (p: Vec3) => ({
    x: Math.round((left + (-p[2] - hMin) * scale) * 10) / 10,
    y: Math.round((upper + (p[0] - vMin) * scale) * 10) / 10,
  });
  const at = (tRay: number) =>
    point([origin[0] + tRay * dir[0], origin[1] + tRay * dir[1], origin[2] + tRay * dir[2]]);
  // 광선이 그림 틀의 가로 끝에 닿는 t (−z 로 재어)
  const tFar = (hMax - -origin[2]) / -dir[2];
  const tBack = (hMin - -origin[2]) / -dir[2];
  return { at, point, scale, tBack, tFar };
}

type Handles = {
  /** 이번 걸음에 시험한 물체의 근 점 (작은 근 · 큰 근) */
  rootDots: SVGCircleElement[];
  marker: SVGGElement | null;
  reach: SVGLineElement;
  pixelRect: SVGRectElement;
  layer: SVGGElement;
};

export const nearestHitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function nameOf(id: string): string {
      switch (id) {
        case 'blue': return t('label.blue', 'blue sphere');
        case 'yellow': return t('label.yellow', 'yellow sphere');
        case 'red': return t('label.red', 'red sphere');
        case 'green': return t('label.green', 'green sphere');
        case 'purple': return t('label.purple', 'purple sphere');
        default: throw new Error(`nearest-hit stage: 표시 이름이 없는 물체 ${id}`);
      }
    }

    function sphereOf(scene: NearestHitScene, id: string): SphereSpec {
      const s = scene.objects.find((o) => o.id === id);
      if (s === undefined) throw new Error(`nearest-hit stage: 바탕에 없는 물체 ${id}`);
      return s;
    }

    function captionLines(scene: NearestHitScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') {
        return [
          t('caption.start', 'Test the spheres in list order.'),
          t('caption.none', 'Nearest t so far: none.'),
        ];
      }
      if (step.kind === 'pixel') {
        const s = sphereOf(scene, step.id);
        const best = scene.best;
        if (best === null) throw new Error('nearest-hit stage: 픽셀 걸음인데 최근접이 없다');
        return [
          t('caption.pixel', 'Pixel color: {name} ({r}, {g}, {b})', {
            name: nameOf(s.id),
            r: fixed(s.color[0], 3),
            g: fixed(s.color[1], 3),
            b: fixed(s.color[2], 3),
          }),
          t('caption.pixelFrom', 'from the nearest hit, t {best}.', { best: fixed(best.tHit, 2) }),
        ];
      }
      const entry = scene.tested[step.index];
      if (entry === undefined) throw new Error(`nearest-hit stage: 자취에 ${step.index} 번 시험이 없다`);
      const name = nameOf(entry.id);
      const first = entry.roots === null
        ? t('caption.noRoots', '{name}: no roots, the ray misses.', { name })
        : t('caption.roots', '{name}: roots {a} · {b}', {
          name,
          a: fixed(entry.roots[0], 2),
          b: fixed(entry.roots[1], 2),
        });
      const best = scene.best;
      if (best === null) throw new Error('nearest-hit stage: 시험 뒤인데 최근접이 없다');
      const bestText = fixed(best.tHit, 2);
      switch (step.verdict) {
        case 'closer': {
          // 견준 값으로 말한다 — 앞의 최근접은 장면의 step.from 에 있다
          if (step.from === null) {
            return [first, t('caption.closerFirst', 'Nearest t: none → {best}.', { best: bestText })];
          }
          return [first, t('caption.closer', 'Smaller root {near} < nearest t {before}. Nearest t becomes {near}.', {
            near: bestText,
            before: fixed(step.from.tHit, 2),
          })];
        }
        case 'farther': {
          if (entry.used === null) throw new Error('nearest-hit stage: 더 멀다인데 쓸 근이 없다');
          return [first, t('caption.farther', 'Smaller root {near} ≥ nearest t {best}. Nearest stays.', {
            near: fixed(entry.used, 2),
            best: bestText,
          })];
        }
        case 'behind':
          return [first, t('caption.behind', 'Both roots ≤ ε (behind the eye), dropped. Nearest t stays {best}.', { best: bestText })];
        case 'miss':
          return [first, t('caption.miss', 'Nearest t stays {best}.', { best: bestText })];
      }
    }

    function drawStatic(scene: NearestHitScene): Handles {
      svg.textContent = '';
      const layer = el(svg, 'g', {});
      const n = scene.objects.length;
      const pad = 16;
      const gap = 8;
      const chipW = Math.min(140, (PIECE_CANVAS_W - 2 * pad - gap * (n - 1)) / n);
      const chipsLeft = (PIECE_CANVAS_W - (chipW * n + gap * (n - 1))) / 2;
      const chipTop = 10;
      const chipH = 48;
      const sm = parseFloat(fontSizes.sm);
      const xs = parseFloat(fontSizes.xs);
      const md = parseFloat(fontSizes.md);

      const step = scene.step;
      const current = step.kind === 'test' ? step.index : -1;

      // 시험 목록 — 목록 차례가 곧 시험 차례
      scene.objects.forEach((o, i) => {
        const x = Math.round((chipsLeft + i * (chipW + gap)) * 10) / 10;
        const entry = scene.tested[i];
        const done = entry !== undefined;
        const chip = el(layer, 'g', {});
        el(chip, 'rect', {
          x, y: chipTop, width: Math.round(chipW * 10) / 10, height: chipH, rx: 6,
          fill: done ? colors.bgSubtle : colors.bg,
          stroke: i === current ? colors.text : colors.border,
          'stroke-width': i === current ? 2 : 1,
          'stroke-dasharray': done ? 'none' : '3 3',
        });
        // 색 점 안의 번호가 목록 차례 — 그림의 구에도 같은 번호가 있다
        el(chip, 'circle', {
          cx: x + 15, cy: chipTop + 15, r: 8, fill: paint(o.color), stroke: colors.border,
        });
        el(chip, 'text', {
          x: x + 15, y: chipTop + 19, 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': xs, fill: colors.stateInk,
        }, String(i + 1));
        const name = nameOf(o.id);
        // 칸 폭에 맞춰 줄인다 — 언어마다 이름 길이가 다르다
        const nameSize = Math.min(sm, (chipW - 32) / (name.length * 0.5));
        el(chip, 'text', {
          x: x + 27, y: chipTop + 19, 'font-family': fonts.body, 'font-size': round1(nameSize),
          fill: done ? colors.text : colors.textMuted,
        }, name);
        if (entry !== undefined) {
          const result = entry.roots === null
            ? t('label.miss', 'miss')
            : t('label.roots', '{a} · {b}', { a: fixed(entry.roots[0], 2), b: fixed(entry.roots[1], 2) });
          el(chip, 'text', {
            x: x + 8, y: chipTop + 38, 'font-family': fonts.mono, 'font-size': sm,
            fill: entry.used === null ? colors.textMuted : colors.text,
          }, result);
        }
      });

      const geo = layout(scene, SCENE_TOP, SCENE_BOTTOM);
      const eye = geo.at(0);
      const far = geo.at(geo.tFar);
      const back = geo.at(geo.tBack);

      // 구 — 목록 차례대로 칠한다
      scene.objects.forEach((o, i) => {
        const c = geo.point(o.center);
        el(layer, 'circle', {
          cx: c.x, cy: c.y, r: Math.round(o.radius * geo.scale * 10) / 10,
          fill: paint(o.color), 'fill-opacity': 0.85,
          stroke: i === current ? colors.text : paint(o.color), 'stroke-width': i === current ? 2 : 1,
        });
        el(layer, 'text', {
          // 번호는 광선과 겹치지 않게 중심 아래쪽 반에 둔다
          x: c.x, y: round1(c.y + o.radius * geo.scale * 0.5 + 4), 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': sm, fill: colors.stateInk,
        }, String(i + 1));
      });

      // 눈 뒤로 늘인 선 (t < 0) — 여기 걸린 근은 쓰지 않는다
      el(layer, 'line', {
        x1: back.x, y1: back.y, x2: eye.x, y2: eye.y,
        stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '4 4',
      });
      // 광선 전체
      el(layer, 'line', {
        x1: eye.x, y1: eye.y, x2: far.x, y2: far.y, stroke: colors.textMuted, 'stroke-width': 1.2,
      });
      el(layer, 'path', {
        d: `M ${far.x} ${far.y} l -9 -5 l 0 10 z`, fill: colors.textMuted,
      });
      // 지금까지 가장 가까운 t 까지의 몫
      const reachEnd = scene.best === null ? far : geo.at(scene.best.tHit);
      const reach = el(layer, 'line', {
        x1: eye.x, y1: eye.y, x2: reachEnd.x, y2: reachEnd.y,
        stroke: colors.text, 'stroke-width': 3.5, 'stroke-linecap': 'butt',
      });

      // 근 점 — 시험한 물체마다 둘. 쓴 근은 채우고 버린 근은 비운다
      let rootDots: SVGCircleElement[] = [];
      scene.tested.forEach((entry, i) => {
        if (entry.roots === null) return;
        const s = sphereOf(scene, entry.id);
        const dots = entry.roots.map((root) => {
          const p = geo.at(root);
          const used = entry.used !== null && root === entry.used;
          return el(layer, 'circle', {
            cx: p.x, cy: p.y, r: 4.5,
            fill: used ? paint(s.color) : colors.bg,
            stroke: used ? colors.text : paint(s.color), 'stroke-width': 1.6,
          });
        });
        if (i === current) rootDots = dots;
      });

      // 최근접 막대
      let marker: SVGGElement | null = null;
      if (scene.best !== null) {
        const m = geo.at(scene.best.tHit);
        marker = el(layer, 'g', {});
        el(marker, 'line', {
          x1: m.x, y1: m.y - 16, x2: m.x, y2: m.y + 16, stroke: colors.text, 'stroke-width': 2.5,
        });
        const label = t('label.nearest', 't {v}', { v: fixed(scene.best.tHit, 2) });
        const w = label.length * sm * 0.62 + 10;
        el(marker, 'rect', {
          x: Math.round((m.x - w / 2) * 10) / 10, y: m.y - 36, width: Math.round(w * 10) / 10, height: 17, rx: 3,
          fill: colors.bg, stroke: colors.text, 'stroke-width': 1,
        });
        el(marker, 'text', {
          x: m.x, y: m.y - 23.5, 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': sm, fill: colors.text,
        }, label);
      }

      // 눈과 픽셀
      el(layer, 'circle', { cx: eye.x, cy: eye.y, r: 4, fill: colors.text });
      el(layer, 'text', {
        x: eye.x, y: eye.y + 20, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': xs, fill: colors.textMuted,
      }, t('label.eye', 'eye'));
      const px = eye.x + 14;
      const winner = scene.pixel === null ? null : sphereOf(scene, scene.pixel);
      const pixelRect = el(layer, 'rect', {
        x: px - 8, y: eye.y - 8, width: 16, height: 16,
        fill: winner === null ? colors.bg : paint(winner.color),
        stroke: colors.text, 'stroke-width': 1.2,
        'stroke-dasharray': winner === null ? '3 2' : 'none',
      });
      el(layer, 'text', {
        x: px, y: eye.y - 14, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': xs, fill: colors.textMuted,
      }, t('label.pixel', 'pixel'));

      // 캡션 — 이번 걸음에 일어난 일 두 줄
      const [line1, line2] = captionLines(scene);
      const longest = Math.max(line1.length, line2.length);
      const size = Math.min(md, (PIECE_CANVAS_W - 32) / (longest * 0.56));
      el(layer, 'text', {
        x: PIECE_CANVAS_W / 2, y: H - 30, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': round1(size), fill: colors.text,
      }, line1);
      el(layer, 'text', {
        x: PIECE_CANVAS_W / 2, y: H - 10, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': round1(size), fill: colors.text,
      }, line2);

      return { rootDots, marker, reach, pixelRect, layer };
    }

    /** ms 동안 매 틀마다 draw(0..1) — 세대가 바뀌거나 거두면 곧바로 물러난다 */
    function tween(mine: number, ms: number, draw: (e: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let finish = (ok: boolean): void => {
          waiters.delete(wake);
          finish = () => undefined;
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const e = Math.min(1, (Date.now() - start) / ms);
          draw(ease(e));
          if (e >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function place(node: SVGElement, dx: number, dy: number): void {
      node.setAttribute('transform', `translate(${round1(dx)} ${round1(dy)})`);
    }

    async function animate(mine: number, next: NearestHitScene, h: Handles): Promise<void> {
      const step = next.step;
      const geo = layout(next, SCENE_TOP, SCENE_BOTTOM);
      const eye = geo.at(0);
      if (step.kind === 'test') {
        const entry = next.tested[step.index];
        if (entry === undefined) throw new Error(`nearest-hit stage: 자취에 ${step.index} 번 시험이 없다`);
        // 1) 근이 눈에서 광선을 따라 제자리로 나간다 · 빗나가면 탐침이 끝까지 지나간다
        if (entry.roots === null) {
          const far = geo.at(geo.tFar);
          const probe = el(h.layer, 'circle', { cx: eye.x, cy: eye.y, r: 4, fill: colors.textMuted });
          const ok = await tween(mine, MOVE_MS, (e) => place(probe, (far.x - eye.x) * e, (far.y - eye.y) * e));
          if (!ok) return;
        } else {
          const roots = entry.roots;
          if (h.rootDots.length !== 2) throw new Error('nearest-hit stage: 이번 시험의 근 점을 찾지 못했다');
          const targets = roots.map((r) => geo.at(r));
          const move = (e: number): void => {
            h.rootDots.forEach((dot, k) => {
              const p = targets[k];
              if (p === undefined) throw new Error('nearest-hit stage: 근 자리가 없다');
              place(dot, (eye.x - p.x) * (1 - e), (eye.y - p.y) * (1 - e));
            });
          };
          move(0);
          const ok = await tween(mine, MOVE_MS, move);
          if (!ok) return;
        }
        // 2) 더 가까우면 막대가 그 근으로 물러나고 굵은 선이 줄어든다
        if (step.verdict === 'closer') {
          const best = next.best;
          if (best === null || h.marker === null) throw new Error('nearest-hit stage: 더 가까운데 최근접 막대가 없다');
          const marker = h.marker;
          const to = geo.at(best.tHit);
          const from = step.from === null ? geo.at(geo.tFar) : geo.at(step.from.tHit);
          const move = (e: number): void => {
            const x = from.x + (to.x - from.x) * e;
            const y = from.y + (to.y - from.y) * e;
            place(marker, x - to.x, y - to.y);
            h.reach.setAttribute('x2', String(round1(x)));
            h.reach.setAttribute('y2', String(round1(y)));
          };
          move(0);
          await tween(mine, MOVE_MS, move);
        }
        return;
      }
      if (step.kind === 'pixel') {
        // 이긴 구의 색이 닿은 자리에서 광선을 거슬러 픽셀로 돌아온다
        const s = sphereOf(next, step.id);
        const best = next.best;
        if (best === null) throw new Error('nearest-hit stage: 픽셀 걸음인데 최근접이 없다');
        const from = geo.at(best.tHit);
        const to = { x: eye.x + 14, y: eye.y };
        const fill = h.pixelRect.getAttribute('fill');
        if (fill === null) throw new Error('nearest-hit stage: 픽셀 칸을 찾지 못했다');
        h.pixelRect.setAttribute('fill', colors.bg);
        const drop = el(h.layer, 'circle', {
          cx: from.x, cy: from.y, r: 6, fill: paint(s.color), stroke: colors.text, 'stroke-width': 1.2,
        });
        const ok = await tween(mine, MOVE_MS, (e) => place(drop, (to.x - from.x) * e, (to.y - from.y) * e));
        if (!ok) return;
        h.pixelRect.setAttribute('fill', fill);
      }
    }

    return {
      async render(next: NearestHitScene, prev: NearestHitScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await animate(mine, next, handles);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
