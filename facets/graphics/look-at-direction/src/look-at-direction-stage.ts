/**
 * look-at-direction 무대 — 비스듬히 내려다본 3D 공간에서 눈에 붙은 세 축이 하나씩 선다.
 *
 * 세상의 점(눈 · 바라보는 점)은 움직이지 않는다. 움직이는 것은 축이다.
 *   시선   눈에서 바라보는 점까지 뻗었다가 길이 1 로 줄어든다
 *   오른쪽 눈 높이의 수평판 위로 눕듯 뻗는다 (외적 길이까지 뻗고 1 로 늘어난다)
 *   참 위  주어진 위쪽 자리에서 출발해 앞으로(바라보는 쪽으로) 기울며 선다
 *   읽기   표지가 시선 축(−z)을 따라 바라보는 점까지 간다
 *
 * 관찰자 각(yaw · 올려봄)은 그림의 자리 셈일 뿐 자료가 아니다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { dot, narrowLookAtData, norm, type Vec3 } from './algorithm.js';
import type { LookAtDirectionScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 3D 구역과 축 표의 경계 */
const PANEL_W = 178;
const MARGIN = 14;
const CAPTION_TOP = 22;
const VIEW_TOP = 70;

/** 관찰자 — 비스듬히 내려다보는 자리 */
const YAW = (10 * Math.PI) / 180;
const ELEVATION = (25 * Math.PI) / 180;
/** 한 칸(1)의 화면 길이 상한 */
const MAX_UNIT_PX = 84;

const ARC_RADIUS = 0.55;
const LEVEL_RADIUS = 1.2;

/** 한 걸음 운동 길이 */
const MOTION_MS = 800;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 표시할 때만 반올림 — 절반은 0 에서 먼 쪽(toFixed), −0 은 0, 빼기표는 − */
function fmt(v: number, digits: number): string {
  let s = v.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  return s.replace('-', '−');
}

/** 자료로 준 좌표 — 정수는 정수로 */
function fmtGiven(v: number): string {
  return Number.isInteger(v) ? fmt(v, 0) : fmt(v, 2);
}

function vecText(v: Vec3, digits: number): string {
  return '(' + v.map((x) => fmt(x, digits)).join(', ') + ')';
}

function givenText(v: Vec3): string {
  return '(' + v.map(fmtGiven).join(', ') + ')';
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function unit(a: Vec3, what: string): Vec3 {
  const n = norm(a);
  if (n < 1e-12) throw new Error(`look-at-direction 무대: ${what} 의 길이가 0 이다`);
  return mul3(a, 1 / n);
}

/** 두 단위 벡터 사이를 구면으로 잇는다 (호 · 기우는 운동) */
function slerp(a: Vec3, b: Vec3, k: number): Vec3 {
  const c = Math.min(1, Math.max(-1, dot(a, b)));
  const ang = Math.acos(c);
  if (ang < 1e-9) return a;
  const s = Math.sin(ang);
  const wa = Math.sin((1 - k) * ang) / s;
  const wb = Math.sin(k * ang) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 관찰자 좌표 — 오른쪽 x, 위 y (화면 y 는 뒤집는다) */
function viewOf(v: Vec3): Pt {
  const x = v[0] * Math.cos(YAW) - v[2] * Math.sin(YAW);
  const z = v[0] * Math.sin(YAW) + v[2] * Math.cos(YAW);
  const y = v[1] * Math.cos(ELEVATION) - z * Math.sin(ELEVATION);
  return { x, y: -y };
}

type Frame = { unitPx: number; ox: number; oy: number };

type Motion =
  | { kind: 'sight'; p: number }
  | { kind: 'right'; p: number }
  | { kind: 'trueUp'; p: number }
  | { kind: 'readTarget'; p: number };

export const lookAtDirectionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const axisColors = categorical(3, 'vivid');
    const sightColor = axisColors[0];
    const rightColor = axisColors[1];
    const upColor = axisColors[2];
    if (sightColor === undefined || rightColor === undefined || upColor === undefined) {
      throw new Error('look-at-direction 무대: 축 색 셋을 얻지 못했다');
    }
    const smPx = parseFloat(fontSizes.sm);
    // 자료가 있으면 마운트에서 좁히고 틀을 세운다. 없으면(검사의 빈 마운트) 첫 장면에서 세운다
    const given = params.initialData === undefined ? null : narrowLookAtData(params.initialData);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 바탕에서 정해지는 틀 — 바닥 격자와 축척 */
    let frame: Frame | null = null;
    let grid: { x0: number; x1: number; z0: number; z1: number } | null = null;

    function fitFrame(eye: Vec3, target: Vec3): Frame {
      // 바닥 격자는 눈과 바라보는 점의 발밑을 덮는 만큼만
      const x0 = Math.floor(Math.min(eye[0], target[0]));
      const x1 = Math.ceil(Math.max(eye[0], target[0]));
      const z0 = Math.floor(Math.min(eye[2], target[2]));
      const z1 = Math.ceil(Math.max(eye[2], target[2]));
      grid = { x0, x1, z0, z1 };
      const pts: Vec3[] = [
        [x0, 0, z0],
        [x1, 0, z0],
        [x0, 0, z1],
        [x1, 0, z1],
        target,
        [target[0] - 0.6, target[1], target[2]],
      ];
      // 눈 둘레의 축(길이 1)과 수평판이 들어갈 자리
      for (const dx of [-LEVEL_RADIUS, LEVEL_RADIUS]) {
        for (const dy of [-1, 1.2]) {
          for (const dz of [-LEVEL_RADIUS, LEVEL_RADIUS]) pts.push([eye[0] + dx, eye[1] + dy, eye[2] + dz]);
        }
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        const v = viewOf(p);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      const regionW = PIECE_CANVAS_W - PANEL_W - MARGIN * 3;
      const regionH = H - VIEW_TOP - MARGIN * 2;
      const unitPx = Math.min(MAX_UNIT_PX, regionW / (maxX - minX), regionH / (maxY - minY));
      const ox = MARGIN * 2 + (regionW - (maxX - minX) * unitPx) / 2 - minX * unitPx;
      const oy = VIEW_TOP + MARGIN + (regionH - (maxY - minY) * unitPx) / 2 - minY * unitPx;
      return { unitPx, ox, oy };
    }

    if (given !== null) frame = fitFrame(given.eye, given.target);

    function screen(v: Vec3): Pt {
      if (frame === null) throw new Error('look-at-direction 무대: 틀이 서기 전에 좌표를 셈했다');
      const p = viewOf(v);
      return { x: round2(frame.ox + p.x * frame.unitPx), y: round2(frame.oy + p.y * frame.unitPx) };
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: round2(x),
          y: round2(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function arrow(parent: Element, from: Vec3, dir: Vec3, length: number, color: string, dashed: boolean): Pt {
      const a = screen(from);
      const b = screen(add3(from, mul3(dir, length)));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const line: Record<string, string | number> = {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: color,
        'stroke-width': dashed ? 1.5 : 2.5,
        'stroke-linecap': 'butt',
      };
      if (dashed) line['stroke-dasharray'] = '5 4';
      el('line', line, parent);
      if (len > 1) {
        const ux = dx / len;
        const uy = dy / len;
        const head = Math.min(10, len * 0.6);
        const w = head * 0.45;
        const bx = b.x - ux * head;
        const by = b.y - uy * head;
        el(
          'polygon',
          {
            points: [
              `${round2(b.x)},${round2(b.y)}`,
              `${round2(bx - uy * w)},${round2(by + ux * w)}`,
              `${round2(bx + uy * w)},${round2(by - ux * w)}`,
            ].join(' '),
            fill: color,
          },
          parent,
        );
      }
      return b;
    }

    /** 화살 끝에서 화살 방향으로 조금 더 나간 자리 */
    function beyond(from: Vec3, dir: Vec3, length: number, px: number): Pt {
      const a = screen(from);
      const b = screen(add3(from, mul3(dir, length)));
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) return b;
      return { x: b.x + ((b.x - a.x) / len) * px, y: b.y + ((b.y - a.y) / len) * px };
    }

    function arc(parent: Element, center: Vec3, a: Vec3, b: Vec3, k: number, color: string): Pt {
      const pts: string[] = [];
      const n = 24;
      for (let i = 0; i <= n; i += 1) {
        const d = slerp(a, b, (i / n) * k);
        const p = screen(add3(center, mul3(d, ARC_RADIUS)));
        pts.push(`${p.x},${p.y}`);
      }
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 1.5 }, parent);
      const mid = slerp(a, b, k / 2);
      return screen(add3(center, mul3(mid, ARC_RADIUS)));
    }

    function drawCaption(scene: LookAtDirectionScene): void {
      const g = el('g', {}, canvas);
      const lines: string[] = [];
      switch (scene.step) {
        case 'start':
          lines.push(t('caption.start', 'Given: eye, look-at point, rough up.'));
          break;
        case 'sight': {
          const s = scene.sight;
          if (s === null) throw new Error('look-at-direction 무대: sight 걸음에 시선이 없다');
          lines.push(
            t('caption.sight', 'Sight = look-at point − eye = {d} · length {len}', {
              d: vecText(s.d, 3),
              len: fmt(s.length, 2),
            }),
          );
          lines.push(t('caption.sightUnit', 'Shrunk to length 1: f = {f}', { f: vecText(s.f, 3) }));
          break;
        }
        case 'right': {
          const r = scene.right;
          if (r === null) throw new Error('look-at-direction 무대: right 걸음에 오른쪽이 없다');
          lines.push(
            t('caption.right', 'f × up = {c} · length {len}', { c: vecText(r.cross, 3), len: fmt(r.length, 3) }),
          );
          lines.push(
            t('caption.rightUnit', 'Right r = {r} · y component {ry}', { r: vecText(r.r, 3), ry: fmt(r.r[1], 3) }),
          );
          break;
        }
        case 'trueUp': {
          const u = scene.trueUp;
          if (u === null) throw new Error('look-at-direction 무대: trueUp 걸음에 참 위가 없다');
          lines.push(t('caption.trueUp', 'True up u = r × f = {u}', { u: vecText(u.u, 3) }));
          lines.push(
            t('caption.tilt', 'Angle from given up: {tilt}° · sight below level: {pitch}°', {
              tilt: fmt(u.tiltDeg, 1),
              pitch: fmt(u.pitchDeg, 1),
            }),
          );
          break;
        }
        case 'readTarget': {
          const c = scene.camera;
          const s = scene.sight;
          if (c === null || s === null) throw new Error('look-at-direction 무대: 읽기 걸음에 카메라 좌표가 없다');
          lines.push(t('caption.read', 'Look-at point in camera axes (r, u, −f) = {p}', { p: vecText(c, 2) }));
          lines.push(t('caption.readLength', 'Sight length: {len}', { len: fmt(s.length, 2) }));
          break;
        }
      }
      lines.forEach((line, i) => {
        text(g, MARGIN, CAPTION_TOP + i * 20, line, {
          size: i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
          weight: i === 0 ? '600' : 'normal',
        });
      });
    }

    function drawPanel(scene: LookAtDirectionScene): void {
      const g = el('g', {}, canvas);
      const x = PIECE_CANVAS_W - PANEL_W - MARGIN;
      let y = VIEW_TOP + 10;
      el(
        'rect',
        { x, y: y - 6, width: PANEL_W, height: 196, rx: 6, fill: colors.bgSubtle, stroke: colors.border },
        g,
      );
      text(g, x + 12, y + 14, t('label.axes', 'Camera axes'), { weight: '600', fill: colors.textMuted });
      y += 38;
      const rows: { name: string; sym: string; axis: string; color: string; value: Vec3 | null }[] = [
        {
          name: t('label.sight', 'Sight'),
          sym: 'f',
          axis: '−z',
          color: sightColor,
          value: scene.sight === null ? null : scene.sight.f,
        },
        {
          name: t('label.right', 'Right'),
          sym: 'r',
          axis: 'x',
          color: rightColor,
          value: scene.right === null ? null : scene.right.r,
        },
        {
          name: t('label.trueUp', 'True up'),
          sym: 'u',
          axis: 'y',
          color: upColor,
          value: scene.trueUp === null ? null : scene.trueUp.u,
        },
      ];
      for (const row of rows) {
        const stood = row.value !== null;
        el(
          'rect',
          {
            x: x + 12,
            y: y - 9,
            width: 10,
            height: 10,
            rx: 2,
            fill: stood ? row.color : 'none',
            stroke: row.color,
          },
          g,
        );
        text(g, x + 28, y, row.sym, { mono: true, weight: '600', fill: row.color });
        text(g, x + 42, y, row.name, { fill: stood ? colors.text : colors.textMuted });
        if (scene.camera !== null) {
          text(g, x + PANEL_W - 12, y, row.axis, { anchor: 'end', mono: true, fill: row.color, weight: '600' });
        }
        if (row.value !== null) {
          text(g, x + 12, y + smPx + 8, vecText(row.value, 3), { mono: true, size: fontSizes.xs });
        }
        y += 50;
      }
    }

    function drawWorld(scene: LookAtDirectionScene, motion: Motion | null): void {
      if (grid === null) throw new Error('look-at-direction 무대: 바닥 격자가 서지 않았다');
      const { eye, target, up } = scene.base;
      const g = el('g', {}, canvas);

      // 바닥 (y = 0)
      for (let x = grid.x0; x <= grid.x1; x += 1) {
        const a = screen([x, 0, grid.z0]);
        const b = screen([x, 0, grid.z1]);
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.border, 'stroke-width': 1 }, g);
      }
      for (let z = grid.z0; z <= grid.z1; z += 1) {
        const a = screen([grid.x0, 0, z]);
        const b = screen([grid.x1, 0, z]);
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.border, 'stroke-width': 1 }, g);
      }

      // 눈과 바라보는 점에서 바닥으로 내린 기둥
      for (const p of [eye, target]) {
        const a = screen(p);
        const b = screen([p[0], 0, p[2]]);
        el(
          'line',
          { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3' },
          g,
        );
        el('circle', { cx: b.x, cy: b.y, r: 2, fill: colors.textMuted }, g);
      }

      const upHat = unit(up, '주어진 위쪽');

      // 눈 높이의 수평판 — 오른쪽 축이 설 때부터
      if (scene.right !== null) {
        const pts: string[] = [];
        for (let i = 0; i < 48; i += 1) {
          const a = (i / 48) * Math.PI * 2;
          const p = screen([eye[0] + Math.cos(a) * LEVEL_RADIUS, eye[1], eye[2] + Math.sin(a) * LEVEL_RADIUS]);
          pts.push(`${p.x},${p.y}`);
        }
        el(
          'polygon',
          { points: pts.join(' '), fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1, 'fill-opacity': 0.7 },
          g,
        );
        const lp = screen([eye[0], eye[1], eye[2] + LEVEL_RADIUS]);
        text(g, lp.x, lp.y + 14, t('label.level', 'Level at eye height'), {
          anchor: 'middle',
          fill: colors.textMuted,
          size: fontSizes.xs,
        });
      }

      // 시선 — 눈에서 바라보는 점까지의 줄과 길이 1 의 f
      const sight = scene.sight;
      if (sight !== null) {
        const dHat = sight.f;
        let lineLen = sight.length;
        let arrowLen = 1;
        if (motion !== null && motion.kind === 'sight') {
          const p = motion.p;
          if (p < 0.6) {
            lineLen = sight.length * ease(p / 0.6);
            arrowLen = lineLen;
          } else {
            arrowLen = sight.length + (1 - sight.length) * ease((p - 0.6) / 0.4);
          }
        }
        const a = screen(eye);
        const b = screen(add3(eye, mul3(dHat, lineLen)));
        el(
          'line',
          {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: sightColor,
            'stroke-width': 1.2,
            'stroke-dasharray': '6 4',
            'stroke-opacity': 0.8,
          },
          g,
        );
        if (lineLen === sight.length) {
          const mid = screen(add3(eye, mul3(dHat, sight.length * 0.62)));
          text(g, mid.x, mid.y - 8, fmt(sight.length, 2), { anchor: 'middle', mono: true, fill: sightColor });
        }

        // 읽기 — 시선 축(−z)에 눈금을 새기고 표지가 바라보는 점까지 간다
        if (scene.camera !== null) {
          const far = sight.length + 0.6;
          const reach = motion !== null && motion.kind === 'readTarget' ? sight.length * ease(motion.p) : sight.length;
          for (let k = 1; k < far; k += 1) {
            if (k > reach) break;
            const c = screen(add3(eye, mul3(dHat, k)));
            el('circle', { cx: c.x, cy: c.y, r: 2.5, fill: 'none', stroke: sightColor, 'stroke-width': 1.2 }, g);
          }
          const end = screen(add3(eye, mul3(dHat, far)));
          text(g, end.x - 6, end.y + 4, '−z', { anchor: 'end', mono: true, fill: sightColor, weight: '600' });
          const marker = screen(add3(eye, mul3(dHat, reach)));
          el('circle', { cx: marker.x, cy: marker.y, r: 7, fill: 'none', stroke: sightColor, 'stroke-width': 2 }, g);
        }

        arrow(g, eye, dHat, arrowLen, sightColor, false);
        const lf = beyond(eye, dHat, arrowLen, 12);
        text(g, lf.x, lf.y + 4, 'f', { anchor: 'middle', mono: true, fill: sightColor, weight: '600' });
      }

      // 주어진 위쪽 (점선)
      arrow(g, eye, upHat, 1, colors.textMuted, true);
      const lu = beyond(eye, upHat, 1, 10);
      text(g, lu.x + 6, lu.y + 2, t('label.givenUp', 'Given up'), { fill: colors.textMuted, size: fontSizes.xs });

      // 오른쪽 — f × 위쪽 의 길이까지 뻗고 1 로
      const right = scene.right;
      if (right !== null) {
        let len = 1;
        if (motion !== null && motion.kind === 'right') {
          const p = motion.p;
          len = p < 0.6 ? right.length * ease(p / 0.6) : right.length + (1 - right.length) * ease((p - 0.6) / 0.4);
        }
        arrow(g, eye, right.r, len, rightColor, false);
        const lr = beyond(eye, right.r, len, 12);
        text(g, lr.x, lr.y + 4, 'r', { anchor: 'middle', mono: true, fill: rightColor, weight: '600' });
      }

      // 참 위 — 주어진 위쪽 자리에서 앞으로(바라보는 쪽으로) 기울며
      const trueUp = scene.trueUp;
      if (trueUp !== null && sight !== null) {
        const k = motion !== null && motion.kind === 'trueUp' ? ease(motion.p) : 1;
        const dir = slerp(upHat, trueUp.u, k);
        const tiltLabel = arc(g, eye, upHat, trueUp.u, k, upColor);
        // 시선이 수평 아래로 내려간 각 — 시선을 수평판에 누인 방향과 f 사이
        const flat = unit(add3(sight.f, mul3(upHat, -dot(sight.f, upHat))), '수평으로 누인 시선');
        const fa = screen(eye);
        const fb = screen(add3(eye, mul3(flat, 1)));
        el(
          'line',
          {
            x1: fa.x,
            y1: fa.y,
            x2: fb.x,
            y2: fb.y,
            stroke: sightColor,
            'stroke-width': 1.2,
            'stroke-dasharray': '2 3',
          },
          g,
        );
        const pitchLabel = arc(g, eye, flat, sight.f, k, sightColor);
        arrow(g, eye, dir, 1, upColor, false);
        const lu2 = beyond(eye, dir, 1, 12);
        text(g, lu2.x, lu2.y + 4, 'u', { anchor: 'middle', mono: true, fill: upColor, weight: '600' });
        if (k === 1) {
          text(g, tiltLabel.x - 14, tiltLabel.y + 4, t('value.deg', '{v}°', { v: fmt(trueUp.tiltDeg, 1) }), {
            anchor: 'end',
            mono: true,
            fill: upColor,
            size: fontSizes.xs,
          });
          text(g, pitchLabel.x - 12, pitchLabel.y - 6, t('value.deg', '{v}°', { v: fmt(trueUp.pitchDeg, 1) }), {
            anchor: 'end',
            mono: true,
            fill: sightColor,
            size: fontSizes.xs,
          });
        }
      }

      // 바라보는 점
      const tp = screen(target);
      el('circle', { cx: tp.x, cy: tp.y, r: 5, fill: colors.primary }, g);
      const tx0 = tp.x - 10;
      text(g, tx0, tp.y + 20, t('label.target', 'Look-at point'), { size: fontSizes.xs });
      text(g, tx0, tp.y + 20 + smPx + 2, givenText(target), {
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      if (scene.camera !== null && (motion === null || motion.kind !== 'readTarget')) {
        text(
          g,
          tx0,
          tp.y + 20 + (smPx + 2) * 2,
          t('label.cameraAt', 'Camera {p}', { p: vecText(scene.camera, 2) }),
          { mono: true, size: fontSizes.xs, fill: sightColor, weight: '600' },
        );
      }

      // 눈
      const ep = screen(eye);
      el('circle', { cx: ep.x, cy: ep.y, r: 5, fill: colors.text }, g);
      text(g, ep.x + 10, ep.y + 14, t('label.eye', 'Eye'), { size: fontSizes.xs });
      text(g, ep.x + 10, ep.y + 14 + smPx + 2, givenText(eye), {
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
    }

    function drawStatic(scene: LookAtDirectionScene, motion: Motion | null): void {
      canvas.textContent = '';
      drawCaption(scene);
      drawWorld(scene, motion);
      drawPanel(scene);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          timers.delete(id);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function play(scene: LookAtDirectionScene, kind: Motion['kind'], mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        drawStatic(scene, { kind, p });
        if (p >= 1) return;
        await wait(16);
      }
    }

    return {
      async render(next: LookAtDirectionScene, prev: LookAtDirectionScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (frame === null) frame = fitFrame(next.base.eye, next.base.target);
        drawStatic(next, null);
        if (!opts.animate || prev === null || next.step === prev.step || next.step === 'start') return;
        await play(next, next.step, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
