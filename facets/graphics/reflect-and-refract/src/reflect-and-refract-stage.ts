/**
 * 반사와 굴절 stage — 경계에 닿은 광선이 그 점에서 갈라진다.
 *
 * 동사는 "갈라진다". 닿는 걸음에는 광선 머리가 경계까지 달려오고, 반사 걸음에는 닿은 점에서
 * 새 광선이 법선 건너편으로 뻗는다. 굴절 걸음에는 새 광선이 먼저 곧은 길로 나오다가 법선 쪽으로
 * 휘어 꺾인 방향에 선다 — 곧은 길은 점선으로 남아 꺾인 만큼이 보인다. 꺾이지 못하는 걸음에는
 * 곧은 길로 나오던 광선이 법선에서 멀어지는 쪽으로 눕다가 경계에 닿아 스러진다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ReflectAndRefractScene, TraceState } from './scene.js';
import type { Extent, Vec2 } from './algorithm.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캡션 두 줄의 기준선 */
const CAPTION_Y1 = 26;
const CAPTION_Y2 = 48;
/** 그림 자리의 위 · 아래 · 왼 · 오른 여백 (px) — 광선 이름과 역할 이름이 들어갈 자리 */
const PAD_TOP = 66 + 22;
const PAD_BOTTOM = 26;
const PAD_LEFT = 40;
const PAD_RIGHT = 84;
/** 월드 1 단위의 px 상한 */
const MAX_UNIT_PX = 110;

const HIT_MS = 700;
const REFLECT_MS = 600;
const REFRACT_MS = 900;
const NO_REFRACT_MS = 1150;

type Handles = {
  incidentLine: SVGLineElement;
  incidentHead: SVGElement;
  incidentDecor: SVGGElement;
  reflectLine: SVGLineElement | null;
  reflectRest: SVGGElement | null;
  refractLine: SVGLineElement | null;
  refractRest: SVGGElement | null;
  noneMark: SVGGElement | null;
};

const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};

/** 표시용 자릿수. -0 은 0 으로, 음수 부호는 설명 글과 같은 − (U+2212) 로 */
function fixed(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

function narrowStageData(raw: Record<string, unknown> | undefined): { stepMs: number } | null {
  if (raw === undefined) return null;
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('reflect-and-refract stage: initialData.stepMs 는 양수여야 한다');
  }
  return { stepMs };
}

export const reflectAndRefractStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const roles = categorical(3, 'vivid');
    const reflectColor = roles[0]!;
    const refractColor = roles[1]!;
    narrowStageData(params.initialData);

    const W = PIECE_CANVAS_W;
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ---------- 이름 (리터럴 키 표) ----------

    function mediumName(id: string): string {
      switch (id) {
        case 'air':
          return t('label.air', 'Air');
        case 'glass':
          return t('label.glass', 'Glass');
        default:
          throw new Error(`reflect-and-refract stage: 이름이 없는 매질 '${id}'`);
      }
    }

    function rayName(id: string): string {
      switch (id) {
        case 'from-air':
          return t('label.fromAir', 'Ray from air');
        case 'from-glass':
          return t('label.fromGlass', 'Ray from glass');
        default:
          throw new Error(`reflect-and-refract stage: 이름이 없는 광선 '${id}'`);
      }
    }

    const vecText = (v: Vec2): string => t('value.vec', '({x}, {y})', { x: fixed(v[0], 3), y: fixed(v[1], 3) });
    const pointText = (v: Vec2): string => t('value.vec', '({x}, {y})', { x: fixed(v[0], 2), y: fixed(v[1], 2) });
    const degText = (a: number): string => t('value.deg', '{a}°', { a: fixed(a, 1) });

    // ---------- SVG ----------

    function put<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function words(s: string, x: number, y: number, parent: Element, opts: { size?: string; fill?: string; anchor?: string; weight?: number } = {}): SVGTextElement {
      const node = put(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          ...(opts.weight !== undefined ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    // ---------- 월드 → 화면 ----------

    type Frame = { sx: (x: number) => number; sy: (y: number) => number; unit: number };

    function frameOf(extent: Extent): Frame {
      const xs = extent.maxX - extent.minX;
      const ys = extent.maxY - extent.minY;
      const unit = Math.min(MAX_UNIT_PX, (W - PAD_LEFT - PAD_RIGHT) / xs, (H - PAD_TOP - PAD_BOTTOM) / ys);
      const left = PAD_LEFT + ((W - PAD_LEFT - PAD_RIGHT) - xs * unit) / 2;
      const top = PAD_TOP + ((H - PAD_TOP - PAD_BOTTOM) - ys * unit) / 2;
      return {
        sx: (x) => left + (x - extent.minX) * unit,
        sy: (y) => top + (extent.maxY - y) * unit, // y 가 위 → 화면에서는 뒤집는다
        unit,
      };
    }

    /** 월드 방향의 화면 각 (y 를 뒤집은 atan2) */
    const screenAngle = (v: Vec2): number => Math.atan2(-v[1], v[0]);

    function chevron(x: number, y: number, ang: number, color: string, parent: Element): SVGPolygonElement {
      const s = 7;
      const pts: Array<[number, number]> = [
        [x + s * Math.cos(ang), y + s * Math.sin(ang)],
        [x + s * Math.cos(ang + 2.5), y + s * Math.sin(ang + 2.5)],
        [x + s * Math.cos(ang - 2.5), y + s * Math.sin(ang - 2.5)],
      ];
      return put('polygon', { points: pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' '), fill: color }, parent);
    }

    /** 점 c 에서 방향 a 와 b 사이의 호와 각 글자 */
    function angleArc(cx: number, cy: number, a: Vec2, b: Vec2, deg: number, color: string, radius: number, parent: Element): void {
      const angA = screenAngle(a);
      let d = screenAngle(b) - angA;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d <= -Math.PI) d += 2 * Math.PI;
      const angB = angA + d;
      put(
        'path',
        {
          d: `M ${r2(cx + radius * Math.cos(angA))} ${r2(cy + radius * Math.sin(angA))} A ${radius} ${radius} 0 0 ${d > 0 ? 1 : 0} ${r2(cx + radius * Math.cos(angB))} ${r2(cy + radius * Math.sin(angB))}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 1.5,
        },
        parent,
      );
      const mid = angA + d / 2;
      const lr = radius + 18;
      words(degText(deg), cx + lr * Math.cos(mid), cy + lr * Math.sin(mid) + 4, parent, {
        size: fontSizes.xs,
        anchor: 'middle',
        fill: colors.text,
      });
    }

    // ---------- 캡션 ----------

    function captionLines(scene: ReflectAndRefractScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') return [t('caption.start', 'Two rays head for the boundary between air and glass.'), ''];
      const trace = scene.traces.find((one) => one.id === step.ray);
      if (trace === undefined || trace.hit === null) {
        throw new Error(`reflect-and-refract stage: 걸음이 가리키는 광선 '${step.ray}' 의 자취가 없다`);
      }
      const hit = trace.hit;
      switch (step.kind) {
        case 'hit':
          return [
            t('caption.hit', '{ray} — reaches the boundary at {p}', { ray: rayName(trace.id), p: pointText(hit.point) }),
            t('caption.hitSub', 't {t} · direction {d} · angle of incidence {a}', {
              t: fixed(hit.tHit, 2),
              d: vecText(hit.dir),
              a: degText(hit.incidence),
            }),
          ];
        case 'reflect': {
          if (trace.reflect === null) throw new Error('reflect-and-refract stage: reflect 걸음인데 반사가 없다');
          return [
            t('caption.reflect', 'Reflect: R = D − 2(D·N)N = {v}', { v: vecText(trace.reflect.dir) }),
            t('caption.reflectSub', 'Angle of reflection {a}', { a: degText(trace.reflect.angle) }),
          ];
        }
        case 'refract': {
          const rf = trace.refraction;
          if (rf === null || rf.kind !== 'refract') throw new Error('reflect-and-refract stage: refract 걸음인데 굴절이 없다');
          return [
            t('caption.refract', 'Refract: T = {v} · angle of refraction {a} (sin θ₂ {s})', {
              v: vecText(rf.dir),
              a: degText(rf.angle),
              s: fixed(rf.sin, 3),
            }),
            t('caption.refractSub', 'Bent toward the normal by {d}', { d: degText(rf.bend) }),
          ];
        }
        case 'no-refract': {
          const rf = trace.refraction;
          if (rf === null || rf.kind !== 'none') throw new Error('reflect-and-refract stage: no-refract 걸음인데 굴절 없음이 아니다');
          return [
            t('caption.noRefract', 'No refraction: sin θ₂ = {n1} · sin {a} / {n2} = {s} > 1', {
              n1: fixed(rf.n1, 1),
              a: degText(rf.incidence),
              n2: fixed(rf.n2, 1),
              s: fixed(rf.sin, 3),
            }),
            '',
          ];
        }
      }
    }

    // ---------- 정적 그리기 (정본) ----------

    function drawStatic(scene: ReflectAndRefractScene): { frame: Frame; handles: Map<string, Handles> } | null {
      svg.textContent = '';
      const handles = new Map<string, Handles>();
      const extent = scene.base.extent;
      if (extent === null) return null;
      const f = frameOf(extent);
      const by = f.sy(scene.base.boundaryY);

      // 매질 — 아래(유리)를 옅게 칠하고 경계선을 긋는다
      put('rect', { x: 0, y: r2(by), width: W, height: r2(H - by), fill: colors.bgSubtle }, svg);
      put('line', { x1: 0, y1: r2(by), x2: W, y2: r2(by), stroke: colors.border, 'stroke-width': 2 }, svg);
      words(
        t('label.medium', '{name} · n {n}', { name: mediumName(scene.base.above.id), n: fixed(scene.base.above.n, 1) }),
        W - 12,
        by - 10,
        svg,
        { fill: colors.textMuted, anchor: 'end' },
      );
      words(
        t('label.medium', '{name} · n {n}', { name: mediumName(scene.base.below.id), n: fixed(scene.base.below.n, 1) }),
        W - 12,
        by + 20,
        svg,
        { fill: colors.textMuted, anchor: 'end' },
      );

      // 캡션
      const [c1, c2] = captionLines(scene);
      words(c1, W / 2, CAPTION_Y1, svg, { size: fontSizes.md, anchor: 'middle', weight: 600 });
      if (c2 !== '') words(c2, W / 2, CAPTION_Y2, svg, { size: fontSizes.sm, anchor: 'middle', fill: colors.textMuted });

      for (const trace of scene.traces) handles.set(trace.id, drawTrace(trace, f, scene.base.boundaryY));
      return { frame: f, handles };
    }

    function drawTrace(trace: TraceState, f: Frame, boundaryY: number): Handles {
      const layer = put('g', {}, svg);
      const ox = f.sx(trace.origin[0]);
      const oy = f.sy(trace.origin[1]);
      const above = trace.origin[1] > boundaryY;

      const incidentLine = put('line', { x1: r2(ox), y1: r2(oy), x2: r2(ox), y2: r2(oy), stroke: colors.text, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, layer);
      let incidentHead: SVGElement = put('g', {}, layer);
      const incidentDecor = put('g', {}, layer);
      const handles: Handles = {
        incidentLine,
        incidentHead,
        incidentDecor,
        reflectLine: null,
        reflectRest: null,
        refractLine: null,
        refractRest: null,
        noneMark: null,
      };

      put('circle', { cx: r2(ox), cy: r2(oy), r: 4.5, fill: colors.text }, layer);
      // 경계 위의 출발 자리는 그 위에, 아래의 것은 왼쪽 옆에 — 아래쪽은 건너온 굴절 광선이 지나갈 수 있다
      if (above) words(rayName(trace.id), ox, oy - 12, layer, { anchor: 'middle', fill: colors.text });
      else words(rayName(trace.id), ox - 10, oy + 4, layer, { anchor: 'end', fill: colors.text });

      const hit = trace.hit;
      if (hit === null) return handles;
      const hx = f.sx(hit.point[0]);
      const hy = f.sy(hit.point[1]);
      incidentLine.setAttribute('x2', String(r2(hx)));
      incidentLine.setAttribute('y2', String(r2(hy)));
      const dAng = screenAngle(hit.dir);
      incidentHead = chevron((ox + hx) / 2, (oy + hy) / 2, dAng, colors.text, layer);
      handles.incidentHead = incidentHead;

      // 법선 — 닿은 점을 지나는 점선. 이름은 광선이 온 쪽 끝에
      const nLen = Math.min(f.unit * 1.1, 90);
      const nx = hit.normal[0];
      const ny = -hit.normal[1];
      put(
        'line',
        {
          x1: r2(hx - nx * nLen),
          y1: r2(hy - ny * nLen),
          x2: r2(hx + nx * nLen),
          y2: r2(hy + ny * nLen),
          stroke: colors.textMuted,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 4',
        },
        incidentDecor,
      );
      words(t('label.normal', 'Normal'), hx + nx * (nLen + 6), hy + ny * (nLen + 6) + (ny < 0 ? 0 : 10), incidentDecor, {
        size: fontSizes.xs,
        anchor: 'middle',
        fill: colors.textMuted,
      });
      const back: Vec2 = [-hit.dir[0], -hit.dir[1]];
      const arcR = Math.min(34, f.unit * 0.45);
      angleArc(hx, hy, hit.normal, back, hit.incidence, colors.text, arcR, incidentDecor);
      put('circle', { cx: r2(hx), cy: r2(hy), r: 3.5, fill: colors.text }, incidentDecor);

      const len = hit.tHit * f.unit;

      if (trace.reflect !== null) {
        const rd = trace.reflect.dir;
        const ex = hx + rd[0] * len;
        const ey = hy - rd[1] * len;
        handles.reflectLine = put('line', { x1: r2(hx), y1: r2(hy), x2: r2(ex), y2: r2(ey), stroke: reflectColor, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, layer);
        const rest = put('g', {}, layer);
        chevron((hx + ex) / 2, (hy + ey) / 2, screenAngle(rd), reflectColor, rest);
        words(t('label.reflect', 'Reflection'), rd[0] >= 0 ? ex + 8 : ex - 8, ey + 4, rest, {
          anchor: rd[0] >= 0 ? 'start' : 'end',
          fill: colors.text,
        });
        angleArc(hx, hy, hit.normal, rd, trace.reflect.angle, reflectColor, arcR + 16, rest);
        handles.reflectRest = rest;
      }

      const rf = trace.refraction;
      if (rf !== null && rf.kind === 'refract') {
        const rest = put('g', {}, layer);
        // 곧은 길 — 꺾이지 않았다면 갔을 자리. 꺾인 만큼이 이것과의 틈이다
        put(
          'line',
          {
            x1: r2(hx),
            y1: r2(hy),
            x2: r2(hx + hit.dir[0] * len * 0.8),
            y2: r2(hy - hit.dir[1] * len * 0.8),
            stroke: colors.textMuted,
            'stroke-width': 1.2,
            'stroke-dasharray': '2 4',
          },
          layer,
        );
        const td = rf.dir;
        const ex = hx + td[0] * len;
        const ey = hy - td[1] * len;
        handles.refractLine = put('line', { x1: r2(hx), y1: r2(hy), x2: r2(ex), y2: r2(ey), stroke: refractColor, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, layer);
        chevron((hx + ex) / 2, (hy + ey) / 2, screenAngle(td), refractColor, rest);
        words(t('label.refract', 'Refraction'), td[0] >= 0 ? ex + 8 : ex - 8, ey + 4, rest, {
          anchor: td[0] >= 0 ? 'start' : 'end',
          fill: colors.text,
        });
        const inward: Vec2 = [-hit.normal[0], -hit.normal[1]];
        angleArc(hx, hy, inward, td, rf.angle, refractColor, arcR + 16, rest);
        handles.refractRest = rest;
      } else if (rf !== null) {
        // 굴절 없음 — 건너편에 광선이 없다. 닿은 점의 건너편에 그 사실만 적는다
        const mark = put('g', {}, layer);
        const side = -hit.normal[1] >= 0 ? 1 : -1; // 건너편: 온 쪽 법선의 반대. +1 이면 화면 위
        words(t('label.noRefract', 'No refraction'), hx + 10, hy - side * 14, mark, {
          fill: colors.textMuted,
          anchor: 'start',
        });
        handles.noneMark = mark;
      }
      return handles;
    }

    // ---------- 운동 ----------

    function tween(ms: number, mine: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const u = Math.min(1, (Date.now() - start) / ms);
          draw(u);
          if (u >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`reflect-and-refract stage: 운동할 ${what} 가 화면에 없다`);
      return v;
    }

    const hide = (node: Element): void => node.setAttribute('visibility', 'hidden');

    async function animateStep(scene: ReflectAndRefractScene, frame: Frame, handles: Map<string, Handles>, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind === 'start') return;
      const trace = scene.traces.find((one) => one.id === step.ray);
      const h = handles.get(step.ray);
      if (trace === undefined || h === undefined || trace.hit === null) {
        throw new Error(`reflect-and-refract stage: 걸음이 가리키는 광선 '${step.ray}' 가 화면에 없다`);
      }
      const hit = trace.hit;
      const ox = frame.sx(trace.origin[0]);
      const oy = frame.sy(trace.origin[1]);
      const hx = frame.sx(hit.point[0]);
      const hy = frame.sy(hit.point[1]);
      const len = hit.tHit * frame.unit;
      const motion = put('g', {}, svg);

      const setEnd = (line: SVGLineElement, x: number, y: number): void => {
        line.setAttribute('x2', String(r2(x)));
        line.setAttribute('y2', String(r2(y)));
      };

      switch (step.kind) {
        case 'hit': {
          // 광선 머리가 출발 자리에서 경계까지 달려온다
          hide(h.incidentDecor);
          hide(h.incidentHead);
          const head = put('circle', { cx: r2(ox), cy: r2(oy), r: 5, fill: colors.text }, motion);
          const line = h.incidentLine;
          const place = (u: number): void => {
            const k = ease(u);
            const x = ox + (hx - ox) * k;
            const y = oy + (hy - oy) * k;
            setEnd(line, x, y);
            head.setAttribute('cx', String(r2(x)));
            head.setAttribute('cy', String(r2(y)));
          };
          place(0);
          await tween(HIT_MS, mine, place);
          return;
        }
        case 'reflect': {
          // 닿은 점에서 튕긴 광선이 뻗어 나간다
          const line = need(h.reflectLine, '반사 광선');
          hide(need(h.reflectRest, '반사 표시'));
          const rd = need(trace.reflect, '반사').dir;
          const place = (u: number): void => {
            const k = ease(u) * len;
            setEnd(line, hx + rd[0] * k, hy - rd[1] * k);
          };
          place(0);
          await tween(REFLECT_MS, mine, place);
          return;
        }
        case 'refract': {
          // 곧은 길로 나오다가 법선 쪽으로 휘어 꺾인 방향에 선다
          const line = need(h.refractLine, '굴절 광선');
          hide(need(h.refractRest, '굴절 표시'));
          const rf = trace.refraction;
          if (rf === null || rf.kind !== 'refract') throw new Error('reflect-and-refract stage: refract 걸음인데 굴절이 없다');
          const a0 = Math.atan2(-hit.dir[1], hit.dir[0]);
          let dA = Math.atan2(-rf.dir[1], rf.dir[0]) - a0;
          while (dA > Math.PI) dA -= 2 * Math.PI;
          while (dA <= -Math.PI) dA += 2 * Math.PI;
          const SPLIT = 0.4;
          const place = (u: number): void => {
            let ang = a0;
            let k: number;
            if (u < SPLIT) {
              k = ease(u / SPLIT) * 0.5;
            } else {
              const v = ease((u - SPLIT) / (1 - SPLIT));
              ang = a0 + dA * v;
              k = 0.5 + 0.5 * v;
            }
            setEnd(line, hx + Math.cos(ang) * k * len, hy + Math.sin(ang) * k * len);
          };
          place(0);
          await tween(REFRACT_MS, mine, place);
          return;
        }
        case 'no-refract': {
          // 곧은 길로 나오던 광선이 법선에서 멀어지며 경계에 눕고, 갈 자리가 없어 스러진다
          hide(need(h.noneMark, '굴절 없음 표시'));
          const a0 = Math.atan2(-hit.dir[1], hit.dir[0]);
          const aFlat = hit.dir[0] >= 0 ? 0 : Math.PI;
          let dA = aFlat - a0;
          while (dA > Math.PI) dA -= 2 * Math.PI;
          while (dA <= -Math.PI) dA += 2 * Math.PI;
          const ghost = put(
            'line',
            { x1: r2(hx), y1: r2(hy), x2: r2(hx), y2: r2(hy), stroke: refractColor, 'stroke-width': 2.5, 'stroke-linecap': 'round' },
            motion,
          );
          const P1 = 0.3;
          const P2 = 0.72;
          const place = (u: number): void => {
            let ang = a0;
            let k: number;
            if (u < P1) {
              k = ease(u / P1) * 0.5;
            } else if (u < P2) {
              ang = a0 + dA * ease((u - P1) / (P2 - P1));
              k = 0.5;
            } else {
              ang = aFlat;
              k = 0.5 * (1 - ease((u - P2) / (1 - P2)));
            }
            setEnd(ghost, hx + Math.cos(ang) * k * len, hy + Math.sin(ang) * k * len);
          };
          place(0);
          await tween(NO_REFRACT_MS, mine, place);
          return;
        }
      }
    }

    return {
      async render(next: ReflectAndRefractScene, _prev: ReflectAndRefractScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || drawn === null) return;
        await animateStep(next, drawn.frame, drawn.handles, mine);
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
