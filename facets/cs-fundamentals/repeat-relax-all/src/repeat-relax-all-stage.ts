/**
 * repeat-relax-all-stage — 되풀이가 한 칸씩 번져 나가는 것을 그리는 캔버스.
 *
 * 화면은 두 층이다.
 *
 *   위  사슬로 놓인 정점과 간선. 살핌창(probe)이 **간선을 보는 순서대로** 미끄러진다.
 *       그 순서가 거꾸로라 창은 오른쪽에서 왼쪽으로 가고, 값은 왼쪽에서 오른쪽으로
 *       한 칸 건너간다. 둘이 반대로 움직이는 것이 헛수고의 까닭이다.
 *   아래 바퀴 장부. 가로 칸은 위 간선과 같은 x 에 놓여 세로 안내선으로 이어진다.
 *       한 줄이 한 바퀴이고, 칸 하나가 살핌 한 번이다. **바퀴가 끝나도 앞 줄을
 *       지우지 않는다** — 다 끝난 화면에 장부가 통째로 남아야 "몇 바퀴 만에
 *       굳었나" 가 보인다. 채움들을 이으면 한 바퀴에 한 칸씩 내려가는 계단이
 *       남고, 그것이 바퀴 수가 정점 수만큼 드는 까닭이다.
 *
 * ## 채움과 테두리를 갈라 둔다
 *
 * 장부 칸은 두 가지를 한꺼번에 말해야 한다 — 이 간선을 **짚어 보았나**, 그래서
 * **값이 줄었나**. 한 칠에 둘을 실으면 서로를 지운다. 그래서 갈랐다.
 *
 * | 형편 | 테두리 (짚음의 표식) | 채움 (값의 형편) |
 * | --- | --- | --- |
 * | 아직 안 봄 | 점선, 옅게 | 없음 |
 * | 보았으나 꼬리를 모름 | 실선, 가늘게 | 없음 |
 * | 재 보았으나 안 줄음 | 실선, 굵게 + 짧은 줄표 | 없음 |
 * | 값이 줄었다 | 채움색 | 채움 + 새 거리 |
 *
 * 옛 화면은 앞의 셋 중 뒤의 둘을 같은 줄표로 그렸다. 그래서 마지막 바퀴가 통째로
 * 헛도는 것 — 재 보았는데 아무것도 안 줄어 이제 끝내도 된다는 것 — 이 꼬리를
 * 모르던 첫 바퀴와 구별되지 않았다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`scanSkip()` · `scanApply()` · `finishRound()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene).
 *
 * 운동은 `aim: 'before'` 로 한 번 세운 그림에서 출발한다 — 장부에서 마지막 살핌
 * 하나를 덜고 다시 셈하면 "아직 건너오지 않은" 그림이 그대로 나오므로 `prev` 를
 * 들출 일이 없다. 운동이 끝나면 **그 장면을 통째로 다시 세운다**. 속성을 하나씩
 * 거두는 것보다 안전하다.
 *
 * `isInstant` · `onScrubStart` 는 두지 않는다 — 러너는 장면 조각에서 그 둘을
 * 부르지 않는다 (S-scene). 실효 있는 빗장은 `opts.animate` 검사와 세대뿐이다.
 *
 * 세로는 고정이다. 정점 다섯 · 바퀴 넷이 이 조각의 데이터이고 장부 줄 수는 그
 * 안에서 정해지므로, 넘칠 일이 있으면 줄 간격을 줄여 담는다.
 *
 * 타이머: rAF 만 쓰고 스스로 다음 회차를 예약하는 루프는 없다. 각 마디는 유한하며
 * `destroy()` 가 걸린 rAF 를 전부 취소하고 **대기 중인 약속을 즉시 푼다** (풀지
 * 않으면 알고리즘의 `await emit` 이 영영 매달린다 — S-piece).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  probeAt,
  reckon,
  reckonRows,
  rowsBeforeLastScan,
  rowsOf,
  type RelaxScan,
  type RepeatRelaxAllReckoning,
  type RepeatRelaxAllScene,
  type RepeatRelaxAllStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 판 크기. 가로는 조각 공통 폭, 세로는 내용(정점 한 줄 + 장부 넉 줄 + 문장)이 정한다.
const W = PIECE_CANVAS_W;
const H = 300;

const NODE_R = 21;
const NODE_CY = 78;
const BADGE_CY = 34;
const BADGE_W = 46;
const BADGE_H = 22;
/** 정점 사이 간격의 상한. 실제 간격은 폭에서 역산한다. */
const NODE_GAP_MAX = 140;
const SIDE_MIN = 40;

const LEDGER_TOP = 116;
const LEDGER_ROW_MAX = 30;
const CELL_R = 11;
const ROW_LABEL_X = 22;
const TALLY_X = 604;

const CAPTION_Y = 264;
const CAPTION_LINE = 20;
const CAPTION_MAX_W = W - 48;

const PROBE_MS = 150;
const PROBE_FADE_MS = 130;
const TOKEN_MS = 320;
const STAIR_MS = 420;
/** 바퀴가 닫히는 마디. 흐를 것이 없던 걸음에 같은 동사의 운동을 얹는다. */
const ROUND_MS = 240;

/** 굳는 정점을 조여 드는 테. 바깥에서 시작해 정점 둘레로 내려앉는다. */
const HALO_REACH = 10;

const INFINITY_GLYPH = '∞';

/**
 * 그림에서 무엇을 세울 것인가.
 *
 * `before` 는 방금 밟은 걸음이 **아직 일어나지 않은** 그림이다. 운동이 거기서
 * 출발한다. 앞 장면을 들추지 않고 지금 장면에서 셈으로 되세운다 (S-scene).
 */
type Aim = 'before' | 'after';

/** 자리를 한 번에 셈해 둔다. 그리면서 재면 순회 순서가 숨은 상태가 된다. */
type Layout = {
  nodeX: number[];
  edgeMidX: number[];
  rowY: number[];
  rowH: number;
  ledgerBottom: number;
  probeSpan: number;
};

function add<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
  parent.appendChild(node);
  return node;
}

function inscribe(
  parent: SVGElement,
  x: number,
  y: number,
  content: string,
  size: string,
  fill: string,
  weight: '400' | '600',
  anchor: 'start' | 'middle' | 'end' = 'middle',
): SVGTextElement {
  const node = add(parent, 'text', {
    x,
    y,
    'text-anchor': anchor,
    'dominant-baseline': 'central',
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    fill,
  });
  node.textContent = content;
  return node;
}

function px(token: string): number {
  return Number.parseInt(token, 10);
}

/** 한글은 폭이 라틴의 두 배쯤이므로 글자마다 나눠 잰다. 정밀할 필요는 없다. */
function measure(text: string, size: number): number {
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0) > 0x2000 ? size : size * 0.55;
  return sum;
}

/**
 * 문장이 한 줄에 안 들어가면 두 줄로 나눈다. 앞줄을 꽉 채우는 대신 **두 줄의
 * 길이가 비슷해지는 자리**를 고른다 — 그리 하지 않으면 뒷줄에 낱말 하나만
 * 남아 문장이 잘린 것처럼 보인다.
 */
function foldCaption(text: string, size: number): string[] {
  if (measure(text, size) <= CAPTION_MAX_W) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];

  let bestAt = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let at = 1; at < words.length; at += 1) {
    const head = words.slice(0, at).join(' ');
    const rest = words.slice(at).join(' ');
    const headW = measure(head, size);
    if (headW > CAPTION_MAX_W) break;
    const gap = Math.abs(headW - measure(rest, size));
    if (gap < bestGap) {
      bestGap = gap;
      bestAt = at;
    }
  }
  return [words.slice(0, bestAt).join(' '), words.slice(bestAt).join(' ')];
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function mount(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance {
  const tr: Translate = params.t ?? makeTranslator(params.locale);
  const palette: Palette = getColors(params.theme);
  const canvas = params.canvas;

  // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 비우면
  // 그림이 통째로 떨어져 나간다 (S-view).
  const root = add(canvas, 'g', {});

  let destroyed = false;
  const frames = new Set<number>();

  /**
   * 기다리다 만 것들을 깨우는 자리.
   *
   * 프레임을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지 않으므로
   * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다.
   */
  const waiters = new Set<() => void>();

  /**
   * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
   *
   * 정적 그리기가 매번 요소를 새로 짓지만 **손잡이 변수는 새로 짓지 않는다** —
   * `probeG` · `transient` 는 다시 할당될 뿐이라, 깨어난 옛 마디가 그 변수를 타고
   * 살아 있는 화면에 쓴다. 마디마다 자기 세대를 확인하고 아니면 물러난다.
   */
  let gen = 0;
  const alive = (my: number): boolean => !destroyed && my === gen;

  // ── 운동이 잡는 손잡이. `drawStatic` 이 매번 다시 건다.
  let probeG: SVGGElement | null = null;
  let probeWindowEl: SVGRectElement | null = null;
  /** 운동만 쓰는 임시 요소가 사는 층. 다음 정적 그리기가 통째로 걷어 간다. */
  let transient: SVGGElement | null = null;

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
   * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 그림을 세워 두었으므로,
   * 출발 자리로 물리는 것을 다음 프레임에 미루면 한 번 번쩍인다.
   */
  function animate(durationMs: number, my: number, draw: (e: number) => void): Promise<void> {
    const paint = (e: number): void => {
      if (alive(my)) draw(e);
    };
    return new Promise<void>((resolve) => {
      if (destroyed || durationMs <= 0) {
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

  // ── 자리 셈 ───────────────────────────────────────────────────────────────

  function layoutOf(scene: RepeatRelaxAllScene): Layout {
    const count = Math.max(1, scene.nodes.length);
    const gap =
      count > 1 ? Math.min(NODE_GAP_MAX, Math.floor((W - SIDE_MIN * 2) / (count - 1))) : 0;
    const originX = Math.round((W - gap * (count - 1)) / 2);
    const nodeX = scene.nodes.map((_, i) => originX + gap * i);
    const edgeMidX = scene.edges.map((edge) => {
      const a = nodeX[scene.nodes.indexOf(edge.from)] ?? originX;
      const b = nodeX[scene.nodes.indexOf(edge.to)] ?? originX;
      return (a + b) / 2;
    });

    const rounds = Math.max(1, scene.rounds);
    // 줄이 많아지면 간격을 줄여 담는다. 판 높이는 늘리지 않는다 (S-view).
    const rowH = Math.min(LEDGER_ROW_MAX, Math.floor((H - LEDGER_TOP - 62) / rounds));
    const rowY: number[] = [];
    for (let i = 0; i < rounds; i += 1) rowY.push(LEDGER_TOP + 4 + rowH / 2 + i * rowH);

    return {
      nodeX,
      edgeMidX,
      rowY,
      rowH,
      ledgerBottom: LEDGER_TOP + 4 + rounds * rowH,
      probeSpan: Math.max(40, gap - NODE_R * 2 - 8),
    };
  }

  // ── 문안. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10) ──────────

  function edgeName(scene: RepeatRelaxAllScene, at: number): string {
    const edge = scene.edges[at];
    return edge ? `${edge.from}→${edge.to}` : '';
  }

  /**
   * 캡션 한 줄.
   *
   * 셈은 **지금 장면 그대로의 `reckon`** 에서 가져온다 — 운동 중에 `before` 그림을
   * 세우고 있어도 문장은 이 걸음이 하는 말이라야 한다.
   */
  function captionOf(scene: RepeatRelaxAllScene): string {
    const rk = reckon(scene);
    const caption = scene.caption;
    switch (caption.kind) {
      case 'start':
        return tr('caption.start', 'Only {source} has a distance. Every other node is unknown.', {
          source: scene.source,
        });
      case 'skip':
        return caption.reason === 'unknown'
          ? tr('caption.skipUnknown', '{edge}: {from} is still unknown, so nothing happens.', {
              edge: edgeName(scene, caption.at),
              from: scene.edges[caption.at]?.from ?? '',
            })
          : tr('caption.skipNoGain', '{edge}: no shorter route, so nothing happens.', {
              edge: edgeName(scene, caption.at),
            });
      case 'apply':
        return tr('caption.apply', '{edge}: {to} becomes {dist}. The front moved one node.', {
          edge: edgeName(scene, caption.at),
          to: scene.edges[caption.at]?.to ?? '',
          dist: caption.dist,
        });
      case 'roundEnd': {
        // 몇 바퀴째인가는 닫힌 줄 수가 말하고, 셈은 그 줄에서 나온다.
        const round = rk.tallies.length;
        const tally = rk.tallies[round - 1] ?? { applied: 0, scans: 0 };
        return tr('caption.roundEnd', 'Round {round}: {applied} of {scans} scans did something.', {
          round,
          applied: tally.applied,
          scans: tally.scans,
        });
      }
      case 'done':
        return tr(
          'caption.done',
          '{rounds} rounds for {nodes} nodes: the front moves one node per round, so only {applied} of {scans} scans mattered.',
          {
            rounds: scene.rounds,
            nodes: scene.nodes.length,
            scans: rk.scans,
            applied: rk.applied,
          },
        );
    }
  }

  // ── 정적 그리기 ───────────────────────────────────────────────────────────

  function drawNode(
    layer: SVGGElement,
    scene: RepeatRelaxAllScene,
    layout: Layout,
    index: number,
    rk: RepeatRelaxAllReckoning,
  ): void {
    const x = layout.nodeX[index] ?? 0;
    const known = rk.dist[index];
    const badgeStroke = known === null ? palette.ghostOutline : palette.border;
    add(layer, 'rect', {
      x: x - BADGE_W / 2,
      y: BADGE_CY - BADGE_H / 2,
      width: BADGE_W,
      height: BADGE_H,
      rx: 6,
      fill: known === null ? 'none' : palette.bgSubtle,
      stroke: badgeStroke,
      'stroke-width': 1,
      ...(known === null ? { 'stroke-dasharray': '4 3' } : {}),
    });
    inscribe(
      layer,
      x,
      BADGE_CY,
      known === null ? INFINITY_GLYPH : String(known),
      fontSizes.md,
      known === null ? palette.ghostOutline : palette.text,
      '600',
    );

    const state = rk.state[index];
    const circle: Record<string, string | number> = {
      cx: x,
      cy: NODE_CY,
      r: NODE_R,
      'stroke-width': 1.5,
    };
    if (state === 'settled') {
      circle.fill = palette.itemSorted;
      circle.stroke = palette.itemSorted;
    } else if (state === 'active') {
      circle.fill = palette.itemActive;
      circle.stroke = palette.itemActive;
    } else {
      circle.fill = palette.bg;
      circle.stroke = palette.ghostOutline;
      circle['stroke-dasharray'] = '4 3';
    }
    add(layer, 'circle', circle);
    inscribe(
      layer,
      x,
      NODE_CY,
      scene.nodes[index] ?? '',
      fontSizes.md,
      state === 'settled' ? palette.textInverse : state === 'active' ? palette.stateInk : palette.textMuted,
      '600',
    );
  }

  /**
   * 장부 칸 하나.
   *
   * 테두리가 **짚음의 표식**이고 채움이 **값의 형편**이다 (파일 머리의 표).
   */
  function drawCell(layer: SVGGElement, cx: number, cy: number, scan: RelaxScan | undefined): void {
    if (scan === undefined) {
      add(layer, 'circle', {
        cx,
        cy,
        r: CELL_R,
        fill: 'none',
        stroke: palette.border,
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
      });
      return;
    }
    if (scan.verdict === 'applied' && scan.dist !== null) {
      add(layer, 'circle', {
        cx,
        cy,
        r: CELL_R,
        fill: palette.accent,
        stroke: palette.accent,
        'stroke-width': 1,
      });
      inscribe(layer, cx, cy, String(scan.dist), fontSizes.sm, palette.stateInk, '600');
      return;
    }
    // 짚어는 보았다. 재 보기까지 한 쪽(noGain)은 테가 굵고 안에 줄표가 남는다.
    const weighed = scan.verdict === 'noGain';
    add(layer, 'circle', {
      cx,
      cy,
      r: CELL_R,
      fill: 'none',
      stroke: weighed ? palette.textMuted : palette.border,
      'stroke-width': weighed ? 1.6 : 1,
    });
    if (weighed) {
      add(layer, 'line', {
        x1: cx - 5,
        y1: cy,
        x2: cx + 5,
        y2: cy,
        stroke: palette.textMuted,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
    }
  }

  /**
   * 그 장면의 화면을 통째로 세운다.
   *
   * 앞 화면과 견주어 달라진 것만 고치지 않는다 — 어느 걸음에서 오든 결과가 같아야
   * 한다 (S-scene).
   */
  function drawStatic(scene: RepeatRelaxAllScene, aim: Aim): void {
    root.textContent = '';
    probeG = null;
    probeWindowEl = null;
    transient = null;

    const layout = layoutOf(scene);
    const step = scene.step;
    const before = aim === 'before' && step !== null;

    // 무엇을 세울지 고른다. `before` 면 방금 밟은 걸음을 덜어 낸다.
    let rows = rowsOf(scene);
    let closed = scene.ledger.length;
    let finished = scene.finished;
    let probe = probeAt(scene);
    if (before && step !== null) {
      if (step.kind === 'scan') {
        rows = rowsBeforeLastScan(rows);
        // 창은 이미 갈 자리에 세우고, 출발 자리로 물리는 것은 운동이 한다.
        probe = step.at;
      } else if (step.kind === 'roundEnd') {
        closed = Math.max(0, closed - 1);
      } else {
        finished = false;
        probe = step.from;
      }
    }
    const rk = reckonRows(scene, rows, closed);

    // 띠가 얹힌 줄은 늘 지금 장면 기준이다 — 살핌창이 새 줄로 넘어갈 때 줄과
    // 창이 따로 놀지 않는다.
    const walked = rowsOf(scene);
    const activeRow =
      walked.length > 0 ? Math.min(walked.length - 1, Math.max(0, scene.rounds - 1)) : null;

    // 1. 세로 안내선 — 위의 간선과 아래의 장부 칸을 같은 x 로 묶는다.
    const guides = add(root, 'g', {});
    for (const midX of layout.edgeMidX) {
      add(guides, 'line', {
        x1: midX,
        y1: NODE_CY + 26,
        x2: midX,
        y2: layout.ledgerBottom,
        stroke: palette.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      });
    }

    // 2. 바퀴 줄 띠
    const bands = add(root, 'g', {});
    for (let r = 0; r < scene.rounds; r += 1) {
      add(bands, 'rect', {
        x: 8,
        y: (layout.rowY[r] ?? 0) - layout.rowH / 2 + 2,
        width: W - 16,
        height: layout.rowH - 4,
        rx: 7,
        fill: r === activeRow ? palette.bgSubtle : 'none',
      });
    }

    // 3. 계단. 다 끝난 화면에만 선다 — 이 조각의 결론이다.
    if (finished && rk.stair.length >= 2) {
      add(root, 'polyline', {
        points: rk.stair
          .map((hit) => `${layout.edgeMidX[hit.at] ?? 0},${layout.rowY[hit.row] ?? 0}`)
          .join(' '),
        fill: 'none',
        stroke: palette.accent,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: 0.6,
      });
    }

    // 4. 장부 칸 · 줄 번호 · 셈
    const ledger = add(root, 'g', {});
    inscribe(
      ledger,
      ROW_LABEL_X,
      LEDGER_TOP - 4,
      tr('label.rounds', 'rounds'),
      fontSizes.xs,
      palette.textMuted,
      '400',
    );
    for (let r = 0; r < scene.rounds; r += 1) {
      const cy = layout.rowY[r] ?? 0;
      inscribe(ledger, ROW_LABEL_X, cy, String(r + 1), fontSizes.sm, palette.textMuted, '600');
      for (let e = 0; e < scene.edges.length; e += 1) {
        drawCell(ledger, layout.edgeMidX[e] ?? 0, cy, rows[r]?.[e]);
      }
      const tally = rk.tallies[r];
      if (tally) {
        inscribe(
          ledger,
          TALLY_X,
          cy,
          `${tally.applied} / ${tally.scans}`,
          fontSizes.sm,
          tally.applied > 0 ? palette.text : palette.textMuted,
          '400',
          'end',
        );
      }
    }

    // 5. 간선. 값이 타고 건너간 적 있는 간선은 굵고 짙게 남는다.
    const edgeLayer = add(root, 'g', {});
    for (let e = 0; e < scene.edges.length; e += 1) {
      const edge = scene.edges[e];
      const ax = layout.nodeX[scene.nodes.indexOf(edge.from)] ?? 0;
      const bx = layout.nodeX[scene.nodes.indexOf(edge.to)] ?? 0;
      const dir = bx >= ax ? 1 : -1;
      const x1 = ax + dir * (NODE_R + 3);
      const x2 = bx - dir * (NODE_R + 9);
      const ink = rk.used[e] ? palette.text : palette.border;
      add(edgeLayer, 'path', {
        d: `M ${x1} ${NODE_CY} L ${x2} ${NODE_CY}`,
        stroke: ink,
        'stroke-width': rk.used[e] ? 2.2 : 1.6,
        fill: 'none',
      });
      add(edgeLayer, 'path', {
        d: `M ${x2} ${NODE_CY - 5} L ${x2 + dir * 9} ${NODE_CY} L ${x2} ${NODE_CY + 5} Z`,
        fill: ink,
        stroke: 'none',
      });
    }

    // 6. 살핌창 — 0 을 중심으로 그리고 translate 로 옮긴다. 볼 것이 없으면
    //    숨기지 않고 **짓지 않는다.**
    if (probe !== null) {
      const g = add(root, 'g', { transform: `translate(${layout.edgeMidX[probe] ?? 0} 0)` });
      probeWindowEl = add(g, 'rect', {
        x: -layout.probeSpan / 2,
        y: NODE_CY - 23,
        width: layout.probeSpan,
        height: 46,
        rx: 9,
        fill: 'none',
        stroke: palette.auxCursor,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });
      add(g, 'line', {
        x1: 0,
        y1: NODE_CY + 23,
        x2: 0,
        y2: LEDGER_TOP - 12,
        stroke: palette.auxCursor,
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      });
      probeG = g;
    }

    // 7. 정점 · 거리 배지
    const nodeLayer = add(root, 'g', {});
    for (let i = 0; i < scene.nodes.length; i += 1) drawNode(nodeLayer, scene, layout, i, rk);

    // 8. 운동만 쓰는 임시 층 + 문장
    transient = add(root, 'g', {});
    const captionLayer = add(root, 'g', {});
    const size = px(fontSizes.md);
    const lines = foldCaption(captionOf(scene), size);
    for (let i = 0; i < lines.length; i += 1) {
      inscribe(
        captionLayer,
        W / 2,
        CAPTION_Y + i * CAPTION_LINE,
        lines[i],
        fontSizes.md,
        palette.text,
        '400',
      );
    }
  }

  // ── 걸음마다의 운동 ───────────────────────────────────────────────────────

  /**
   * 살핌창이 간선으로 옮겨 가고, 일이 됐으면 값이 간선을 타고 건너간다.
   *
   * 값이 **실제로 건너가는** 것이 이 조각의 동사다. 색만 바뀌어서는 안 된다.
   */
  async function runScan(
    scene: RepeatRelaxAllScene,
    step: Extract<RepeatRelaxAllStep, { kind: 'scan' }>,
    my: number,
  ): Promise<void> {
    const layout = layoutOf(scene);
    const g = probeG;

    if (g !== null) {
      if (step.from === null) {
        await animate(PROBE_FADE_MS, my, (e) => g.setAttribute('opacity', String(e)));
        if (alive(my)) g.removeAttribute('opacity');
      } else if (step.from !== step.at) {
        const a = layout.edgeMidX[step.from] ?? 0;
        const b = layout.edgeMidX[step.at] ?? 0;
        await animate(PROBE_MS, my, (e) =>
          g.setAttribute('transform', `translate(${a + (b - a) * e} 0)`),
        );
      }
    }
    if (!alive(my)) return;
    if (step.verdict !== 'applied' || step.dist === null) return;

    const edge = scene.edges[step.at];
    const layer = transient;
    if (!edge || layer === null) return;
    probeWindowEl?.setAttribute('stroke', palette.accent);

    const ax = layout.nodeX[scene.nodes.indexOf(edge.from)] ?? 0;
    const bx = layout.nodeX[scene.nodes.indexOf(edge.to)] ?? 0;
    const token = add(layer, 'g', { transform: `translate(${ax} ${NODE_CY})` });
    add(token, 'circle', {
      cx: 0,
      cy: 0,
      r: 13,
      fill: palette.accent,
      stroke: palette.accent,
      'stroke-width': 1,
    });
    inscribe(token, 0, 0, String(step.dist), fontSizes.sm, palette.stateInk, '600');

    await animate(TOKEN_MS, my, (e) => {
      token.setAttribute('transform', `translate(${ax + (bx - ax) * e} ${NODE_CY})`);
    });
  }

  /**
   * 바퀴가 닫힌다.
   *
   * 흐를 것이 없어 벽시계가 `stepMs` 그대로이던 걸음이다. 이 걸음이 하는 말과
   * **같은 동사**로 얇은 마디를 얹는다 — 이 바퀴에 얻은 거리가 *굳고*(테가 조여
   * 든다) 그 바퀴의 셈이 *앉는다*. 한 뜻이므로 **한 시계**로 흘린다.
   */
  async function closeRound(scene: RepeatRelaxAllScene, my: number): Promise<void> {
    const layer = transient;
    const closed = scene.ledger.length;
    if (layer === null || closed === 0) return;

    const layout = layoutOf(scene);
    const after = reckon(scene);
    const opened = reckonRows(scene, rowsOf(scene), closed - 1);

    const halos: SVGCircleElement[] = [];
    for (let i = 0; i < scene.nodes.length; i += 1) {
      if (opened.state[i] !== 'active' || after.state[i] !== 'settled') continue;
      halos.push(
        add(layer, 'circle', {
          cx: layout.nodeX[i] ?? 0,
          cy: NODE_CY,
          r: NODE_R + HALO_REACH,
          fill: 'none',
          stroke: palette.itemSorted,
          'stroke-width': 2,
        }),
      );
    }

    const tally = after.tallies[closed - 1];
    const cy = layout.rowY[closed - 1] ?? 0;
    const label =
      tally === undefined
        ? null
        : inscribe(
            layer,
            TALLY_X,
            cy,
            `${tally.applied} / ${tally.scans}`,
            fontSizes.sm,
            tally.applied > 0 ? palette.text : palette.textMuted,
            '400',
            'end',
          );

    if (halos.length === 0 && label === null) return;

    await animate(ROUND_MS, my, (e) => {
      for (const halo of halos) {
        halo.setAttribute('r', String(NODE_R + HALO_REACH * (1 - e)));
        halo.setAttribute('opacity', String(0.8 * (1 - e)));
      }
      if (label !== null) {
        label.setAttribute('y', String(cy - 7 * (1 - e)));
        label.setAttribute('opacity', String(e));
      }
    });
  }

  /**
   * 다 굴렸다. 살핌창이 물러나고, 일이 된 자리를 이은 계단이 위에서 아래로
   * 그어 내린다 — 한 바퀴에 한 칸씩.
   */
  async function runFinish(
    scene: RepeatRelaxAllScene,
    step: Extract<RepeatRelaxAllStep, { kind: 'finish' }>,
    my: number,
  ): Promise<void> {
    const g = probeG;
    if (g !== null && step.from !== null) {
      await animate(PROBE_FADE_MS, my, (e) => g.setAttribute('opacity', String(1 - e)));
    }
    if (!alive(my)) return;

    const layer = transient;
    const rk = reckon(scene);
    if (layer === null || rk.stair.length < 2) return;

    const layout = layoutOf(scene);
    const pts = rk.stair.map((hit) => ({
      x: layout.edgeMidX[hit.at] ?? 0,
      y: layout.rowY[hit.row] ?? 0,
    }));
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) {
      length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const line = add(layer, 'polyline', {
      points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      fill: 'none',
      stroke: palette.accent,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0.6,
      'stroke-dasharray': String(length),
    });
    await animate(STAIR_MS, my, (e) => {
      line.setAttribute('stroke-dashoffset', String(length * (1 - e)));
    });
  }

  async function render(
    next: RepeatRelaxAllScene,
    /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
    _prev: RepeatRelaxAllScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    const my = (gen += 1);

    drawStatic(next, opts.animate ? 'before' : 'after');
    if (!opts.animate) return;

    const step = next.step;
    if (step !== null) {
      switch (step.kind) {
        case 'scan':
          await runScan(next, step, my);
          break;
        case 'roundEnd':
          await closeRound(next, my);
          break;
        case 'finish':
          await runFinish(next, step, my);
          break;
      }
    }

    if (!alive(my)) return;
    // 운동이 남긴 임시 요소·속성·보간 끝자리를 통째로 지우고 그 장면을 다시
    // 세운다. 그 사이에 타이머도 프레임도 없어 페인트가 끼지 않는다.
    drawStatic(next, 'after');
  }

  return {
    render,
    destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) dropFrame(id);
      frames.clear();
      // 매달린 약속을 푼다. 두면 알고리즘의 await emit 이 끝나지 않는다.
      for (const wake of [...waiters]) wake();
      waiters.clear();
      root.remove();
    },
  };
}

export const repeatRelaxAllStageView: CanvasView = {
  canvas: { height: H },
  mount,
};
