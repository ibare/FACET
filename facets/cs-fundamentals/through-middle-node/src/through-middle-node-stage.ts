/**
 * through-middle-node-stage — 곧은 길이 꺾인 길에게 자리를 내주는 화면.
 *
 * 정점은 원둘레에 놓되, 주어진 간선이 원둘레의 변이 되도록 이웃 순서를 찾는다
 * (`ringOrder`). 그러면 아직 없는 길만 대각선으로 남아, "가운데를 거치는 길" 이
 * 도형을 가로지르는 모양이 된다.
 *
 * 아는 거리는 모두 **곧은 줄** 하나로 그린다. 그 줄이 짧아지는 순간에만 줄이
 * 가운데 정점 쪽으로 휘어 그 점을 지나갔다가, 새 수를 달고 다시 곧게 펴진다.
 * 이 조각에서 위치가 움직이는 것은 그 대목과 물음이 길을 짚어 가는 점뿐이다.
 *
 * 오른쪽 장부는 물음이 몇 번이나 되풀이되는지를 남긴다. 가운데 후보 하나가
 * 한 칸(열)이고, 그 아래 칸 하나가 물음 하나다. 재생이 끝난 뒤에도 그림이
 * 스스로 "이만큼 물어 이만큼만 그렇다" 라고 말하게 하는 자리다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`openRoads()` · `setMiddle()` · `ask()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 *
 * 운동이 끝나면 **그 장면을 통째로 다시 세운다**. 속성을 하나씩 거두는 것보다
 * 안전하다 — 흐르며 선 화면과 곧바로 세운 화면이 `opacity="1"` 같은 속성의
 * 유무만큼 달라 되짚기 판정에서 어긋나는 일이 없다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  ThroughMiddleNodeAsk,
  ThroughMiddleNodeCaption,
  ThroughMiddleNodeLink,
  ThroughMiddleNodeScene,
  ThroughMiddleNodeVerdict,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 312;

/** 정점을 얹는 타원. 오른쪽 장부 자리를 빼고 왼쪽 폭을 채운다. */
const CENTER_X = 200;
const CENTER_Y = 138;
const RING_RX = 150;
const RING_RY = 94;
const NODE_R = 19;

/** 가운데로 선 정점이 일어서는 몫과 그 둘레에 도는 테. */
const MIDDLE_SCALE = 1.14;
const MIDDLE_HALO = 7;
const MIDDLE_HALO_ALPHA = 0.45;

const LEDGER_LEFT = 408;
const LEDGER_RIGHT = 592;
const LEDGER_COL_MAX = 46;
const LEDGER_TOP = 58;
const LEDGER_BOTTOM = 214;
const LEDGER_ROW_MAX = 23;

const FORMULA_Y = 272;
const CAPTION_Y = 298;

/** 배지는 줄 위 이 자리에 얹힌다. 0.5 로 두면 휠 때 가운데 정점 위에 겹친다. */
const BADGE_T = 0.32;
const BADGE_OFFSET = 13;

const INFINITY_MARK = '∞';
const YES_MARK = '✓';
const NO_MARK = '✗';

// ── 걸음의 길이. 하나하나가 읽을 시간을 가르므로 이름을 달아 둔다.
const LEDGER_MS = 260;
const MIDDLE_MS = 220;
const PROBE_BLOCKED_MS = 100;
const PROBE_HALF_MS = 130;
const PROBE_FULL_MS = 220;
const RECOIL_MS = 70;
const REFUSE_HOLD_MS = 70;
const REFUSE_BACK_MS = 200;
/** 짚던 길이 사그라드는 시간. 줄이 휘는 동안 겹쳐 돈다. */
const PROBE_FADE_MS = 200;
const PULSE_MS = 140;
const OPEN_MS = 180;
const BEND_MS = 260;
const STRAIGHTEN_MS = 280;
const FIX_PULSE_MS = 120;
const FADE_MS = 90;
const FINISH_PULSE_MS = 110;
const FINISH_GAP_MS = 60;

type Pt = { x: number; y: number };

/**
 * 장부 한 칸의 칠. `asking` 은 물음이 도는 동안만이라 장면에 없다 — 그 칸이
 * 누구인지는 `scene.ask` 가 말한다.
 */
type SlotState = 'idle' | 'asking' | ThroughMiddleNodeVerdict;

/** 줄 하나를 그리는 데 필요한 DOM 과 그 순간의 모습. `drawStatic` 이 세운다. */
type Chord = {
  from: string;
  to: string;
  /** 배지에 새기는 글자. 아직 없는 길이면 ∞ 다. */
  label: string;
  kind: 'road' | 'ghost';
  improved: boolean;
  /** 지금 물음의 대상인가. */
  hot: boolean;
  /** 0 이면 곧은 줄, 1 이면 가운데 정점을 지나는 줄. */
  bend: number;
  rest: Pt;
  pierce: Pt | null;
  badgeScale: number;
  group: SVGGElement;
  path: SVGPathElement;
  head: SVGPolygonElement;
  badge: SVGGElement;
  badgeBox: SVGRectElement;
  badgeText: SVGTextElement;
};

type NodeShape = {
  group: SVGGElement;
  disc: SVGCircleElement;
  /** 가운데로 선 정점에만 달리는 테. 그 밖에는 아예 만들지 않는다. */
  halo: SVGCircleElement | null;
  text: SVGTextElement;
};

/** 물음이 짚어 가는 점과 그 길. 걸음이 도는 동안만 산다. */
type Probe = {
  barrier: SVGLineElement;
  /** 0 이면 출발, 1 이면 가운데, 2 면 도착. */
  moveDot(u: number): void;
  at(u: number): Pt;
  legOut: Pt;
  legIn: Pt;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function lerpPt(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  return {
    x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x),
    y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y),
  };
}

/**
 * 줄 바깥쪽을 가리키는 법선. 배지를 도형 밖으로 밀어내 줄과 겹치지 않게 한다.
 * 도형 한가운데를 지나는 대각선은 안팎이 정해지지 않으므로 위쪽(없으면 오른쪽)을
 * 택한다 — 두 대각선이 서로 다른 쪽으로 비켜 앉는다.
 */
function outwardNormal(at: Pt, tangent: Pt): Pt {
  const len = Math.hypot(tangent.x, tangent.y) || 1;
  let nx = -tangent.y / len;
  let ny = tangent.x / len;
  const side = nx * (at.x - CENTER_X) + ny * (at.y - CENTER_Y);
  if (side < -1e-6) return { x: -nx, y: -ny };
  if (side <= 1e-6 && (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0))) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/**
 * 원둘레에 놓을 차례. 주어진 간선이 변이 되도록 이어지는 고리를 찾는다.
 * 고리가 없으면 선언 순서 그대로 놓는다 — 그림이 덜 곱더라도 틀리지는 않는다.
 */
function ringOrder(nodes: string[], edges: ThroughMiddleNodeLink[]): string[] {
  if (nodes.length < 3) return [...nodes];
  const near = new Map<string, Set<string>>();
  for (const id of nodes) near.set(id, new Set<string>());
  for (const edge of edges) {
    near.get(edge.from)?.add(edge.to);
    near.get(edge.to)?.add(edge.from);
  }
  const first = nodes[0] as string;
  const path = [first];
  const used = new Set([first]);
  let visits = 0;
  const walk = (): boolean => {
    visits += 1;
    if (visits > 4000) return false;
    const last = path[path.length - 1] as string;
    if (path.length === nodes.length) return near.get(last)?.has(first) === true;
    for (const id of nodes) {
      if (used.has(id) || near.get(last)?.has(id) !== true) continue;
      used.add(id);
      path.push(id);
      if (walk()) return true;
      path.pop();
      used.delete(id);
    }
    return false;
  };
  return walk() ? [...path] : [...nodes];
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

/** 바탕이 달라졌나 가리는 열쇠. 같으면 자리 셈을 다시 하지 않는다. */
function layoutKeyOf(scene: ThroughMiddleNodeScene): string {
  return `${scene.nodes.join(',')}|${scene.edges.map((e) => `${e.from}>${e.to}:${e.weight}`).join(',')}`;
}

export const throughMiddleNodeStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 러너가 붙여 준 캔버스를 떼지 않는다. 비울 것은 캔버스 안쪽뿐이다 (S-view).
    svg.textContent = '';

    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임·타이머를 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지
     * 않으므로 `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면
     * `await ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG
     * 트리가 통째로 붙들린다 (S-view).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 이 조각의 운동은 `wait` 와 여러 `animate` 로 **이어 달린다** — 물음 하나가
     * 짚고 · 재고 · 휘고 · 펴는 넷을 잇고, 끝에서는 고쳐진 줄을 하나씩 짚는다.
     * 되짚기가 화면을 새로 세운 뒤에 앞 세대의 뒷마디가 깨어나면 새 줄에 옛 값을
     * 덮어쓴다. 깨어난 운동은 자기 세대를 확인하고 아니면 화면에 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     * 세대 빗장의 보조다 — 혼자서는 이어 달리는 운동을 막지 못한다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양, 화면은 그대로).
    params.onScrubStart?.(() => {
      for (const id of frames) dropFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function nextFrame(cb: () => void): number {
      return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    }

    function dropFrame(id: number): void {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(durationMs: number, draw: (e: number) => void): Promise<void> {
      const my = gen;
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant() || durationMs <= 0) {
          paint(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          paint(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ────────────────────
    const root = el('g');
    const chordLayer = el('g');
    const probeLayer = el('g');
    const nodeLayer = el('g');
    const ledgerLayer = el('g');
    root.appendChild(chordLayer);
    root.appendChild(probeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(ledgerLayer);

    const formulaText = el('text', {
      x: W / 2,
      y: FORMULA_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    formulaText.setAttribute('xml:space', 'preserve');
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
    });
    root.appendChild(formulaText);
    root.appendChild(captionText);
    svg.appendChild(root);

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ─────
    let layoutKey: string | null = null;
    const spot = new Map<string, Pt>();
    /** 선언에 적힌 길. 반대 방향 짝이 있는지 보아 줄을 비켜 앉히는 데 쓴다. */
    let given: ThroughMiddleNodeLink[] = [];
    const nodeOf = new Map<string, NodeShape>();
    const chordOf = new Map<string, Chord>();
    let slotRects: SVGRectElement[][] = [];
    let headTexts: SVGTextElement[] = [];

    // ── 정점 ────────────────────────────────────────────────────────────────
    function ensureLayout(scene: ThroughMiddleNodeScene): void {
      given = scene.edges;
      const key = layoutKeyOf(scene);
      if (key === layoutKey) return;
      layoutKey = key;
      spot.clear();
      const ring = ringOrder(scene.nodes, scene.edges);
      const count = Math.max(1, ring.length);
      ring.forEach((id, i) => {
        const angle = Math.PI + (i * 2 * Math.PI) / count;
        spot.set(id, {
          x: CENTER_X + RING_RX * Math.cos(angle),
          y: CENTER_Y + RING_RY * Math.sin(angle),
        });
      });
    }

    function placeNode(id: string, scale: number): void {
      const shape = nodeOf.get(id);
      const at = spot.get(id);
      if (!shape || !at) return;
      shape.group.setAttribute('transform', `translate(${at.x} ${at.y}) scale(${scale})`);
    }

    /**
     * 정점을 다 세운다. 가운데로 선 하나만 일어서고 테를 두른다.
     *
     * 옮기기 전에는 `setMiddle` 이 "앞서 서 있던 것을 찾아 도로 앉히는" 명령을
     * 달고 있었다. 장면이 `middle` 하나를 말하므로 그 코드가 통째로 없어졌다.
     */
    function drawNodes(scene: ThroughMiddleNodeScene): void {
      nodeLayer.textContent = '';
      nodeOf.clear();
      const middle = scene.middle?.id ?? null;
      for (const id of scene.nodes) {
        const at = spot.get(id);
        if (!at) continue;
        const standing = id === middle;
        const group = el('g', {
          transform: `translate(${at.x} ${at.y}) scale(${standing ? MIDDLE_SCALE : 1})`,
        });
        const halo = standing
          ? el('circle', {
              r: NODE_R + MIDDLE_HALO,
              fill: 'none',
              stroke: colors.itemActive,
              'stroke-width': 2,
              opacity: MIDDLE_HALO_ALPHA,
            })
          : null;
        const disc = el('circle', {
          r: NODE_R,
          fill: standing ? colors.itemActive : colors.itemDefault,
          stroke: standing ? colors.itemActive : colors.border,
          'stroke-width': 2,
        });
        const text = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: standing ? colors.stateInk : colors.text,
        });
        text.textContent = id;
        if (halo) group.appendChild(halo);
        group.appendChild(disc);
        group.appendChild(text);
        nodeLayer.appendChild(group);
        nodeOf.set(id, { group, disc, halo, text });
      }
    }

    // ── 길 ──────────────────────────────────────────────────────────────────
    function restCtrl(from: string, to: string): Pt {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return { x: CENTER_X, y: CENTER_Y };
      const mid = lerpPt(a, b, 0.5);
      // 반대 방향 길이 함께 있으면 둘이 겹친다. 진행 방향의 왼쪽으로 비켜
      // 앉히면 반대편 길은 저절로 반대쪽으로 간다.
      const opposed = given.some((e) => e.from === to && e.to === from);
      if (!opposed) return mid;
      const dir = unit(a, b);
      return { x: mid.x - dir.y * 11, y: mid.y + dir.x * 11 };
    }

    /** t=0.5 에서 가운데 정점을 지나는 제어점. */
    function pierceCtrl(from: string, to: string, through: Pt): Pt {
      const a = spot.get(from);
      const b = spot.get(to);
      if (!a || !b) return through;
      return { x: 2 * through.x - (a.x + b.x) / 2, y: 2 * through.y - (a.y + b.y) / 2 };
    }

    function renderChord(chord: Chord): void {
      const a = spot.get(chord.from);
      const b = spot.get(chord.to);
      if (!a || !b) return;
      const ctrl = chord.pierce ? lerpPt(chord.rest, chord.pierce, chord.bend) : chord.rest;
      const out = unit(a, ctrl);
      const into = unit(ctrl, b);
      const start = { x: a.x + out.x * (NODE_R + 2), y: a.y + out.y * (NODE_R + 2) };
      const end = { x: b.x - into.x * (NODE_R + 7), y: b.y - into.y * (NODE_R + 7) };

      chord.path.setAttribute('d', `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`);
      const angle = (Math.atan2(into.y, into.x) * 180) / Math.PI;
      chord.head.setAttribute('transform', `translate(${end.x} ${end.y}) rotate(${angle})`);

      const at = quadAt(start, ctrl, end, BADGE_T);
      const normal = outwardNormal(at, quadTangent(start, ctrl, end, BADGE_T));
      const bx = at.x + normal.x * BADGE_OFFSET;
      const by = at.y + normal.y * BADGE_OFFSET;
      chord.badge.setAttribute('transform', `translate(${bx} ${by}) scale(${chord.badgeScale})`);

      const width = 13 + chord.label.length * 7.5;
      chord.badgeBox.setAttribute('x', String(-width / 2));
      chord.badgeBox.setAttribute('width', String(width));
      chord.badgeText.textContent = chord.label;
    }

    function styleChord(chord: Chord): void {
      const ghost = chord.kind === 'ghost';
      const stroke = chord.hot
        ? colors.itemComparing
        : ghost
          ? colors.ghostOutline
          : chord.improved
            ? colors.text
            : colors.textMuted;
      const width = chord.hot ? 2.8 : ghost ? 1.6 : chord.improved ? 2.4 : 1.6;
      chord.path.setAttribute('stroke', stroke);
      chord.path.setAttribute('stroke-width', String(width));
      chord.path.setAttribute('stroke-dasharray', ghost ? '6 6' : 'none');
      chord.head.setAttribute('fill', stroke);
      chord.head.setAttribute('opacity', ghost ? '0.7' : '1');

      const filled = chord.improved && !ghost;
      chord.badgeBox.setAttribute('fill', filled ? colors.accent : colors.bg);
      chord.badgeBox.setAttribute('stroke', chord.hot ? colors.itemComparing : filled ? colors.accent : colors.border);
      chord.badgeText.setAttribute('fill', filled ? colors.stateInk : ghost ? colors.textMuted : colors.text);
    }

    function createChord(
      from: string,
      to: string,
      label: string,
      kind: 'road' | 'ghost',
      improved: boolean,
    ): Chord {
      const group = el('g', { opacity: 1 });
      const path = el('path', { fill: 'none', 'stroke-linecap': 'round' });
      const head = el('polygon', { points: '0,0 -9,-4.6 -9,4.6' });
      const badge = el('g');
      const badgeBox = el('rect', { y: -9, height: 18, rx: 5, 'stroke-width': 1.4 });
      const badgeText = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      badge.appendChild(badgeBox);
      badge.appendChild(badgeText);
      group.appendChild(path);
      group.appendChild(head);
      group.appendChild(badge);
      chordLayer.appendChild(group);

      const chord: Chord = {
        from,
        to,
        label,
        kind,
        improved,
        hot: false,
        bend: 0,
        rest: restCtrl(from, to),
        pierce: null,
        badgeScale: 1,
        group,
        path,
        head,
        badge,
        badgeBox,
        badgeText,
      };
      chordOf.set(pairKey(from, to), chord);
      styleChord(chord);
      renderChord(chord);
      return chord;
    }

    function dropChord(chord: Chord): void {
      chord.group.remove();
      const key = pairKey(chord.from, chord.to);
      if (chordOf.get(key) === chord) chordOf.delete(key);
    }

    /** 아는 거리를 모두 곧은 줄로 세운다. 거리표가 곧 이 그림이다. */
    function drawChords(scene: ThroughMiddleNodeScene): void {
      chordLayer.textContent = '';
      chordOf.clear();
      for (const road of scene.roads) {
        createChord(road.from, road.to, String(road.weight), 'road', road.improved);
      }
    }

    // ── 장부 ────────────────────────────────────────────────────────────────
    function slotFill(state: SlotState): { fill: string; stroke: string } {
      if (state === 'asking') return { fill: colors.itemComparing, stroke: colors.itemComparing };
      if (state === 'yes') return { fill: colors.accent, stroke: colors.accent };
      // 재 보고 물러난 자리는 짙은 회색 — 길이 끊겨 지나간 옅은 회색과 구별된다.
      if (state === 'weighed') return { fill: colors.textMuted, stroke: colors.textMuted };
      // 물었으나 아니었던 자리도 **찬 칸**이어야 한다. 비어 보이면 재생 도중에
      // 어디까지 물었는지 알 수 없고, 그러면 장부가 "많다" 를 말하지 못한다.
      if (state === 'no') return { fill: colors.border, stroke: colors.border };
      return { fill: 'none', stroke: colors.border };
    }

    function paintSlot(rect: SVGRectElement, state: SlotState): void {
      const tone = slotFill(state);
      rect.setAttribute('fill', tone.fill);
      rect.setAttribute('stroke', tone.stroke);
    }

    function markSlot(column: number, row: number, state: SlotState): void {
      const rect = slotRects[column]?.[row];
      if (rect) paintSlot(rect, state);
    }

    function paintHeads(active: number): void {
      headTexts.forEach((head, i) => {
        head.setAttribute('fill', i === active ? colors.text : colors.textMuted);
        head.setAttribute('font-weight', i === active ? '700' : '400');
      });
    }

    /**
     * 물음 장부를 그 장면 그대로 세운다.
     *
     * 옮기기 전에는 칸의 칠이 rect 의 속성에만 있어 되짚으면 지워졌다. 이제
     * `scene.marks` 가 물은 자리를 말하므로 어느 걸음에서든 같은 장부가 선다.
     */
    function drawLedger(scene: ThroughMiddleNodeScene): void {
      ledgerLayer.textContent = '';
      ledgerLayer.setAttribute('opacity', '1');
      ledgerLayer.setAttribute('transform', 'translate(0 0)');
      slotRects = [];
      headTexts = [];
      const ledger = scene.ledger;
      if (!ledger) return;

      const columns = Math.max(1, ledger.middles.length);
      const rows = Math.max(1, ledger.rows);
      const colPitch = Math.min(LEDGER_COL_MAX, (LEDGER_RIGHT - LEDGER_LEFT) / columns);
      const rowPitch = Math.min(LEDGER_ROW_MAX, (LEDGER_BOTTOM - LEDGER_TOP) / rows);
      const slotW = Math.max(10, colPitch - 20);
      const slotH = Math.max(6, rowPitch - 6);

      const label = el('text', {
        x: LEDGER_LEFT,
        y: 26,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = tr('label.ledger', 'questions asked');
      ledgerLayer.appendChild(label);

      ledger.middles.forEach((id, c) => {
        const cx = LEDGER_LEFT + colPitch * (c + 0.5);
        const head = el('text', {
          x: cx,
          y: 46,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        head.textContent = id;
        ledgerLayer.appendChild(head);
        headTexts.push(head);

        const column: SVGRectElement[] = [];
        for (let r = 0; r < rows; r += 1) {
          const rect = el('rect', {
            x: cx - slotW / 2,
            y: LEDGER_TOP + rowPitch * r,
            width: slotW,
            height: slotH,
            rx: 2,
            'stroke-width': 1.2,
          });
          paintSlot(rect, 'idle');
          ledgerLayer.appendChild(rect);
          column.push(rect);
        }
        slotRects.push(column);
      });

      for (const mark of scene.marks) markSlot(mark.column, mark.row, mark.verdict);
      paintHeads(scene.middle?.index ?? -1);
    }

    // ── 글 ──────────────────────────────────────────────────────────────────
    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function show(value: number | null): string {
      return value === null ? INFINITY_MARK : String(value);
    }

    function formulaOf(ask: ThroughMiddleNodeAsk): string {
      return `${show(ask.legA)} + ${show(ask.legB)} = ${show(ask.sum)}   <   ${show(ask.current)}`;
    }

    function setFormula(text: string, tone: 'ask' | 'yes' | 'no'): void {
      formulaText.textContent = text;
      formulaText.setAttribute('fill', tone === 'no' ? colors.textMuted : colors.text);
      formulaText.setAttribute('font-weight', tone === 'yes' ? '700' : '400');
    }

    /** 장면이 말하려는 것을 문자로 만든다. 문안은 선언에 있고 여기엔 키만 있다 (C10). */
    function captionTextOf(caption: ThroughMiddleNodeCaption | null): string {
      if (!caption) return '';
      switch (caption.kind) {
        case 'roads':
          return tr('caption.roads', '{count} one-way roads to begin with.', {
            count: caption.count,
          });
        case 'middle':
          return tr('caption.middle', 'Now {middle} stands in the middle.', {
            middle: caption.middle,
          });
        case 'opened':
          return tr('caption.opened', 'A road appears. {from}→{to} = {sum}.', {
            from: caption.from,
            to: caption.to,
            sum: caption.sum,
          });
        case 'shorter':
          return tr('caption.shorter', 'Shorter. {from}→{to} drops from {current} to {sum}.', {
            from: caption.from,
            to: caption.to,
            current: caption.current,
            sum: caption.sum,
          });
        case 'noWayIn':
          return tr('caption.noWayIn', 'No road from {from} to {middle}.', {
            from: caption.from,
            middle: caption.middle,
          });
        case 'noWayOut':
          return tr('caption.noWayOut', 'No road from {middle} to {to}.', {
            middle: caption.middle,
            to: caption.to,
          });
        case 'notShorter':
          return tr(
            'caption.notShorter',
            'The detour is {sum} — longer than the {current} already known. Leave it.',
            { sum: caption.sum, current: caption.current },
          );
        case 'done':
          return tr('caption.done', '{asked} questions asked. Only {improved} said yes.', {
            asked: caption.asked,
            improved: caption.improved,
          });
      }
    }

    // ── 정적 그리기. 그 장면의 화면을 빠짐없이 통째로 세운다 ────────────────
    function drawStatic(scene: ThroughMiddleNodeScene): void {
      ensureLayout(scene);
      drawChords(scene);
      drawNodes(scene);
      drawLedger(scene);
      // 짚어 가는 점은 걸음이 도는 동안만 산다. 정적 화면에는 남기지 않는다 —
      // 남기면 되짚은 화면에 옛 걸음의 자취가 속성으로 묻어 있게 된다. 사그라들던
      // 도중에 되짚으면 흐려진 opacity 가 남으므로 그것도 함께 되돌린다.
      probeLayer.textContent = '';
      probeLayer.setAttribute('opacity', '1');
      const ask = scene.ask;
      setCaption(captionTextOf(scene.caption));
      if (!ask) {
        setFormula('', 'ask');
        return;
      }
      setFormula(`${formulaOf(ask)}   ${ask.shorter ? YES_MARK : NO_MARK}`, ask.shorter ? 'yes' : 'no');
    }

    // ── 물음이 길을 짚는다 ──────────────────────────────────────────────────
    function legEnds(a: Pt, b: Pt): { s: Pt; e: Pt } {
      const dir = unit(a, b);
      return {
        s: { x: a.x + dir.x * (NODE_R + 2), y: a.y + dir.y * (NODE_R + 2) },
        e: { x: b.x - dir.x * (NODE_R + 2), y: b.y - dir.y * (NODE_R + 2) },
      };
    }

    /** 짚어 갈 길과 점을 세운다. 정적 그리기가 비워 둔 자리에 이때 만든다. */
    function buildProbe(ask: ThroughMiddleNodeAsk): Probe | null {
      const a = spot.get(ask.from);
      const m = spot.get(ask.middle);
      const b = spot.get(ask.to);
      if (!a || !m || !b) return null;

      const first = legEnds(a, m);
      const second = legEnds(m, b);
      const hasA = ask.legA !== null;
      const hasB = ask.legB !== null;

      probeLayer.textContent = '';
      probeLayer.setAttribute('opacity', '1');

      const legOne = el('path', {
        fill: 'none',
        'stroke-linecap': 'round',
        d: `M ${first.s.x} ${first.s.y} L ${first.e.x} ${first.e.y}`,
        stroke: hasA ? colors.itemComparing : colors.ghostOutline,
        'stroke-width': hasA ? 3.2 : 2,
        'stroke-dasharray': hasA ? 'none' : '6 6',
        opacity: 1,
      });
      const legTwo = el('path', {
        fill: 'none',
        'stroke-linecap': 'round',
        d: `M ${second.s.x} ${second.s.y} L ${second.e.x} ${second.e.y}`,
        stroke: hasB ? colors.itemComparing : colors.ghostOutline,
        'stroke-width': hasB ? 3.2 : 2,
        'stroke-dasharray': hasB ? 'none' : '6 6',
        opacity: hasA ? 1 : 0,
      });
      const barrier = el('line', {
        stroke: colors.ghostOutline,
        'stroke-width': 3,
        'stroke-linecap': 'round',
        opacity: 0,
      });
      const dot = el('circle', { r: 5.5, fill: colors.itemComparing, cx: first.s.x, cy: first.s.y });

      probeLayer.appendChild(legOne);
      probeLayer.appendChild(legTwo);
      probeLayer.appendChild(barrier);
      probeLayer.appendChild(dot);

      const at = (u: number): Pt =>
        u <= 1 ? lerpPt(first.s, first.e, u) : lerpPt(second.s, second.e, u - 1);
      const moveDot = (u: number): void => {
        const p = at(u);
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
      };

      return { barrier, moveDot, at, legOut: unit(a, m), legIn: unit(m, b) };
    }

    function putBarrier(probe: Probe, at: Pt, along: Pt): void {
      probe.barrier.setAttribute('x1', String(at.x - along.y * 9));
      probe.barrier.setAttribute('y1', String(at.y + along.x * 9));
      probe.barrier.setAttribute('x2', String(at.x + along.y * 9));
      probe.barrier.setAttribute('y2', String(at.y - along.x * 9));
      probe.barrier.setAttribute('opacity', '1');
    }

    async function walkProbe(ask: ThroughMiddleNodeAsk, probe: Probe): Promise<void> {
      if (ask.legA === null) {
        // 첫 걸음부터 길이 없다. 나서자마자 막힌다.
        await animate(PROBE_BLOCKED_MS, (e) => probe.moveDot(0.28 * e));
        putBarrier(probe, probe.at(0.28), probe.legOut);
        await animate(RECOIL_MS, (e) => probe.moveDot(0.28 - 0.14 * e));
        return;
      }
      if (ask.legB === null) {
        // 가운데까지는 가지만 거기서 나가는 길이 없다.
        await animate(PROBE_HALF_MS, (e) => probe.moveDot(e));
        putBarrier(probe, probe.at(1), probe.legIn);
        await animate(RECOIL_MS, (e) => probe.moveDot(1 - 0.12 * e));
        return;
      }
      await animate(PROBE_FULL_MS, (e) => probe.moveDot(2 * e));
    }

    /**
     * 짚던 길이 사그라들고 걷힌다.
     *
     * 걷어내기 전에 세대를 본다 — 되짚기가 이미 새 화면을 세웠다면 그 화면이
     * 막 세운 점을 이 뒷마디가 지워 버린다.
     */
    async function fadeProbe(ms: number): Promise<void> {
      const my = gen;
      await animate(ms, (e) => probeLayer.setAttribute('opacity', String(1 - e)));
      if (!alive(my)) return;
      probeLayer.textContent = '';
      probeLayer.setAttribute('opacity', '1');
    }

    // ── 재 보고 물러난다 ───────────────────────────────────────────────────
    /**
     * 길은 다 있었는데 더 멀어 그냥 두는 경우.
     *
     * 빗장에 막혀 튕기는 그림을 여기 쓰면 거짓이 된다 — 이쪽은 끝까지 갈 수
     * **있었고**, 가 보고 재 본 끝에 물러나는 것이다. 그래서 점이 도착점까지
     * 갔다가 가운데로 되돌아 나오고, 자리를 지킨 곧은 줄이 한 번 도드라진다.
     */
    async function refuse(chord: Chord, probe: Probe, my: number): Promise<void> {
      await wait(REFUSE_HOLD_MS);
      if (!alive(my)) return;
      await Promise.all([
        animate(REFUSE_BACK_MS, (e) => probe.moveDot(2 - e)),
        animate(REFUSE_BACK_MS, (e) => probeLayer.setAttribute('opacity', String(1 - e))),
      ]);
      if (!alive(my)) return;
      probeLayer.textContent = '';
      await animate(PULSE_MS, (e) => {
        chord.badgeScale = 1 + 0.3 * Math.sin(e * Math.PI);
        renderChord(chord);
      });
    }

    // ── 곧은 길이 자리를 내준다 ────────────────────────────────────────────
    async function pierce(ask: ThroughMiddleNodeAsk, chord: Chord, my: number): Promise<void> {
      const through = spot.get(ask.middle);
      if (!through || ask.sum === null) return;
      chord.pierce = pierceCtrl(chord.from, chord.to, through);

      if (chord.kind === 'ghost') {
        // 없던 길이다. 꺾인 채로 나타나 자리를 차지한다.
        chord.kind = 'road';
        chord.improved = true;
        chord.label = String(ask.sum);
        chord.bend = 1;
        chord.group.setAttribute('opacity', '0');
        styleChord(chord);
        renderChord(chord);
        await Promise.all([
          animate(OPEN_MS, (e) => chord.group.setAttribute('opacity', String(e))),
          fadeProbe(OPEN_MS),
        ]);
      } else {
        // 곧던 줄이 가운데 한 점을 향해 휜다.
        await Promise.all([
          animate(BEND_MS, (e) => {
            chord.bend = e;
            renderChord(chord);
          }),
          fadeProbe(PROBE_FADE_MS),
        ]);
        if (!alive(my)) return;
        chord.improved = true;
        chord.label = String(ask.sum);
        styleChord(chord);
        renderChord(chord);
      }
      if (!alive(my)) return;

      await animate(FIX_PULSE_MS, (e) => {
        chord.badgeScale = 1 + 0.4 * Math.sin(e * Math.PI);
        renderChord(chord);
      });
      if (!alive(my)) return;
      // 새 수를 달고 다시 곧아진다 — 이제 이 줄이 가운데를 거치는 길이다.
      await animate(STRAIGHTEN_MS, (e) => {
        chord.bend = 1 - e;
        renderChord(chord);
      });
    }

    // ── 걸음마다의 운동 ────────────────────────────────────────────────────
    /** 장부가 오른쪽에서 미끄러져 들어온다. */
    function openLedger(): Promise<void> {
      return animate(LEDGER_MS, (e) => {
        ledgerLayer.setAttribute('opacity', String(e));
        ledgerLayer.setAttribute('transform', `translate(${(1 - e) * 14} 0)`);
      });
    }

    /**
     * 가운데로 세운다 — 그 점만 한 뼘 일어서고, 앞서 서 있던 점은 도로 앉는다.
     *
     * 정적 그리기가 이미 끝 자리에 세워 두었으므로 여기서는 **아직 못 온 만큼을
     * 뒤로 물린다**. 도로 앉을 점이 누구인지는 `prev` 가 아니라 걸음이 싣고 온다.
     */
    function raiseMiddle(scene: ThroughMiddleNodeScene, leaving: string | null): Promise<void> {
      const entering = scene.middle;
      const halo = entering ? (nodeOf.get(entering.id)?.halo ?? null) : null;
      return animate(MIDDLE_MS, (e) => {
        if (leaving !== null) placeNode(leaving, MIDDLE_SCALE - (MIDDLE_SCALE - 1) * e);
        if (entering) placeNode(entering.id, 1 + (MIDDLE_SCALE - 1) * e);
        if (halo) {
          halo.setAttribute('r', String(NODE_R + MIDDLE_HALO * e));
          halo.setAttribute('opacity', String(MIDDLE_HALO_ALPHA * e));
        }
      });
    }

    /**
     * 물음 하나를 흐르게 한다.
     *
     * 정적 그리기는 이미 **답이 난 뒤**의 화면을 세워 두었으므로, 여기서는 먼저
     * 그 짝을 물음 직전의 모습으로 되돌린다. 출발 그림은 `before` 가 싣고 온다 —
     * `prev` 를 들추지 않는다 (S-scene).
     */
    async function runAsk(
      scene: ThroughMiddleNodeScene,
      ask: ThroughMiddleNodeAsk,
      before: { weight: number; improved: boolean } | null,
      my: number,
    ): Promise<void> {
      const key = pairKey(ask.from, ask.to);
      const drawn = chordOf.get(key);
      if (drawn) dropChord(drawn);
      const target =
        before === null
          ? createChord(ask.from, ask.to, INFINITY_MARK, 'ghost', false)
          : createChord(ask.from, ask.to, String(before.weight), 'road', before.improved);
      target.hot = true;
      styleChord(target);

      markSlot(ask.middleIndex, ask.pairIndex, 'asking');
      setCaption(
        tr('caption.question', '{from}→{to}: shorter through {middle}?', {
          from: ask.from,
          to: ask.to,
          middle: ask.middle,
        }),
      );
      setFormula(`${formulaOf(ask)}   ?`, 'ask');

      const probe = buildProbe(ask);
      if (!probe) return;
      await walkProbe(ask, probe);
      if (!alive(my)) return;

      // 답은 세 갈래다 — 짧아진다 · 재 보니 더 멀다 · 길이 끊겼다.
      const weighed = ask.legA !== null && ask.legB !== null;
      setCaption(captionTextOf(scene.caption));
      setFormula(
        `${formulaOf(ask)}   ${ask.shorter ? YES_MARK : NO_MARK}`,
        ask.shorter ? 'yes' : 'no',
      );
      if (ask.shorter) {
        await pierce(ask, target, my);
      } else if (weighed) {
        await refuse(target, probe, my);
      } else {
        await fadeProbe(FADE_MS);
        if (!alive(my)) return;
        if (target.kind === 'ghost') dropChord(target);
      }
    }

    /** 고쳐진 줄만 한 번씩 짚어 준다. 이어 달리는 운동이라 세대를 자주 본다. */
    async function celebrate(scene: ThroughMiddleNodeScene, my: number): Promise<void> {
      for (const road of scene.roads) {
        if (!road.improved) continue;
        const chord = chordOf.get(pairKey(road.from, road.to));
        if (!chord) continue;
        await animate(FINISH_PULSE_MS, (e) => {
          chord.badgeScale = 1 + 0.35 * Math.sin(e * Math.PI);
          renderChord(chord);
        });
        if (!alive(my)) return;
        chord.badgeScale = 1;
        renderChord(chord);
        await wait(FINISH_GAP_MS);
        if (!alive(my)) return;
      }
    }

    async function render(
      next: ThroughMiddleNodeScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: ThroughMiddleNodeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'roads':
          await openLedger();
          break;
        case 'middle':
          await raiseMiddle(next, step.leaving);
          break;
        case 'ask':
          if (next.ask) await runAsk(next, next.ask, step.before, my);
          break;
        case 'finish':
          await celebrate(next, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 자취를 거두고 그 장면을 통째로 다시 세운다. 속성을 하나씩
      // 되돌리는 것보다 안전하고, 보간값의 끝자리가 문자열을 가르지도 않는다.
      // 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) dropFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
