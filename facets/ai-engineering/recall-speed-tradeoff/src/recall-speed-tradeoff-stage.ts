/**
 * 덜 뒤지면 놓친다 — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 무엇을 그리는가
 *
 * **답의 다섯 자리**다. 평면도 칸도 뚜껑도 그리지 않는다 — 그것은 이웃 조각의
 * 몫이고, 여기서 물어야 할 것은 "답이 어떻게 갈리는가" 뿐이다.
 *
 * 고리 위에 자리가 다섯 있고 자리마다 임자(참값)가 있다. 덜 뒤지면 임자가
 * 자리에서 **빠져나가** 바깥에 유령으로 남고, 더 먼 것이 그 자리를 **메운다.**
 * 둘은 한 걸음 안에서 서로 반대쪽으로 휘어 날아 엇갈린다 — 그 엇갈림이 짝이다.
 * 임자는 고리의 바깥 +쪽으로만, 메우는 것은 -쪽으로만 다니므로 길이 겹치지 않는다.
 *
 * ── 이행이 고친 화면 — 맞바꿈의 한쪽이 화면에서 지워지고 있었다
 *
 * 옛 화면은 "연 칸 x/4 · 본 점 n/24" 를 머리에 한 줄로 적고 **걸음마다 갈아 끼웠다.**
 * 가운데 계기에는 재현율이 남았지만 눈금은 각도뿐이라 *어느 값을 치르고 얻은
 * 재현율인지*가 어디에도 없었다. 조각 이름이 "덜 뒤지면 놓친다" 인데 **덜 뒤졌다는
 * 사실과 놓쳤다는 사실의 짝**이 한 화면에 함께 서지 않았던 것이다. 그래서 글
 * (`description.ts`)이 그 짝을 표로 따로 적고 있었다.
 *
 * 지금은 머리에 **작은 장부**가 선다 — 칸마다 산 값(연 칸 · 본 점)을 위에, 얻은
 * 값(재현율)을 아래에 적고 답이 올 때마다 왼쪽부터 찬다. 칸의 수는 바탕의 무리
 * 수만큼 미리 잡아 두므로, 셋을 열고 멈춘 자리에서 넷째 칸이 비어 있는 것이
 * "더 열어도 달라지지 않아 멈췄다" 를 말한다. 완주 화면에 맞바꿈이 통째로 남는다.
 *
 * ── 왜 타원인가
 *
 * 캔버스가 620 × 356 이라 정원으로 그리면 좌우가 통째로 남는다 (S-piece: 그 폭을
 * 채운다). 여기서 반지름은 거리를 뜻하지 않고 **답 안인가 밖인가**만 뜻하므로,
 * 가로로 늘려도 화면이 거짓을 말하지 않는다.
 *
 * ── 가운데의 계기
 *
 * 재현율은 자리를 지킨 임자의 수 그대로다. 그래서 옆으로 날려 보내지 않고 고리
 * 한가운데에 둔다 (S-piece PREFER: 잰 값은 재는 그 자리에). 지난 값은 눈금으로
 * 남아 단조로 오르는 것이 보인다. 눈금도 장부도 계기의 바늘도 `recallAt` 하나를
 * 지나므로 갈릴 자리가 없다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 자리에 앉은 것이 임자면 짙은 알(`itemSorted`), 메우러
 * 온 더 먼 것이면 붉은 알(`danger`), 자리에서 밀려나 바깥에 선 임자면 속이 빈 알이다.
 * **테두리는 표식**이다 — 빈 자리의 점선 고리와 유령의 점선 테두리가 "여기 있어야
 * 할 것이 없다" 를 말한다. 두 축을 갈라 두면 "누가 앉았나" 와 "제자리인가" 가
 * 서로를 지우지 않는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 고리의 반지름도 장부 칸의 폭도 mount 의 변수에 적지 않고 **매번** 장면의 바탕
 * (자리 수 · 무리 수)에서 셈한다 — 장면이 담는 것은 픽셀이 아니라 값의 자리다
 * (S-piece).
 *
 * 세로(H)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  heldCountAt,
  holdersAt,
  openedAt,
  phaseOf,
  recallAt,
  seatsAt,
  seenAt,
  shownAnswer,
  type RecallScenePoint,
  type RecallSpeedTradeoffScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정하는 값이라 그림 곁에 둔다. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 356;

/** 상수로는 상한만 둔다 — 실제 크기는 캔버스에서 역산한다 (S-piece). */
const SIDE_MIN = 18;
const TOKEN_R_MAX = 25;
/** 자리에서 바깥 자리까지의 틈. */
const OUT_GAP = 46;
/** 임자 길과 메우는 길이 갈라지는 각도. */
const SPREAD_DEG = 10;
/** 날아가는 길이 휘는 정도. 부호가 반대라 둘이 엇갈린다. */
const BOW = 26;
const SPREAD_MS = 460;
const MOVE_MS = 620;
const GAUGE_R = 32;
/** 보간 한 마디의 벽시계. rAF 가 아니라 타이머로 재어 doc 없는 자리에서도 돌게 한다. */
const FRAME_MS = 16;

/** 머리 장부 — 왼쪽 이름칸의 폭과 두 줄의 기준선. */
const LEDGER_LABEL_W = 104;
const LEDGER_COST_Y = 22;
const LEDGER_RECALL_Y = 40;
/** 장부 아래로 그림이 시작하는 자리. */
const FIELD_TOP = 52;
/** 캡션이 앉을 자리를 남기고 그림이 끝나는 자리. */
const FIELD_BOTTOM = CANVAS_H - 34;

type Pt = { x: number; y: number };

/** 알의 세 얼굴. 채움이 곧 값의 형편이다. */
type TokenKind = 'own' | 'taker' | 'ghost';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/**
 * 사이값. **끝에서는 보간하지 않고 목표값을 그대로 쓴다** — 보간의 부동소수 끝자리가
 * 남으면 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 어긋난다 (S-scene 함정).
 */
const lerp = (a: number, b: number, p: number): number => (p >= 1 ? b : a + (b - a) * p);

/** 두 점 사이를 휜 길의 조종점. 부호를 뒤집으면 반대쪽으로 휜다. */
function bowControl(a: Pt, b: Pt, bow: number): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
}

function bowPath(a: Pt, b: Pt, bow: number): string {
  const c = bowControl(a, b, bow);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function bezier(a: Pt, b: Pt, bow: number, p: number): Pt {
  if (p >= 1) return b;
  const c = bowControl(a, b, bow);
  const q = 1 - p;
  return {
    x: q * q * a.x + 2 * q * p * c.x + p * p * b.x,
    y: q * q * a.y + 2 * q * p * c.y + p * p * b.y,
  };
}

/**
 * 이 장면의 자리 셈.
 *
 * 자리 수와 무리 수만 있으면 나오므로 **매번** 장면에서 만든다. mount 의 변수에
 * 적어 두면 그리는 자리와 장면이 갈라진다.
 */
type Geom = {
  cx: number;
  cy: number;
  tokenR: number;
  /** 고리 위의 자리. */
  seatPos(i: number): Pt;
  /** 자리에서 밀려난 임자가 머무는 자리. 고리 바깥 +쪽. */
  ghostPos(i: number): Pt;
  /** 자리를 메우러 오는 것이 드나드는 자리. 고리 바깥 -쪽. */
  takerPos(i: number): Pt;
  ringRx: number;
  ringRy: number;
  haloOutline(): string;
  gaugeArc(fraction: number): string;
  /** 머리 장부 `i` 번째 칸의 가운데. */
  slotX(i: number): number;
};

function geomOf(seats: number, cells: number): Geom {
  const cx = Math.round(W / 2);
  const cy = Math.round((FIELD_TOP + FIELD_BOTTOM) / 2);
  const tokenR = TOKEN_R_MAX;
  const ringRx = cx - SIDE_MIN - OUT_GAP - tokenR;
  const ringRy = cy - FIELD_TOP - OUT_GAP - tokenR;
  const count = Math.max(1, seats);

  const angleOf = (i: number): number => 90 - (360 / count) * i;
  const onRing = (deg: number): Pt => {
    const r = (deg * Math.PI) / 180;
    return { x: cx + ringRx * Math.cos(r), y: cy - ringRy * Math.sin(r) };
  };
  const outward = (p: Pt, gap: number): Pt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * gap, y: p.y + (dy / len) * gap };
  };

  const ledgerX = SIDE_MIN + LEDGER_LABEL_W;
  const slotW = (W - SIDE_MIN - ledgerX) / Math.max(1, cells);

  return {
    cx,
    cy,
    tokenR,
    ringRx,
    ringRy,
    seatPos: (i) => onRing(angleOf(i)),
    ghostPos: (i) => outward(onRing(angleOf(i) + SPREAD_DEG), OUT_GAP),
    takerPos: (i) => outward(onRing(angleOf(i) - SPREAD_DEG), OUT_GAP),

    /** 자리 고리를 한 틈 바깥으로 민 곡선 — "답 밖" 의 경계다. */
    haloOutline(): string {
      const steps = 96;
      const parts: string[] = [];
      for (let s = 0; s < steps; s += 1) {
        const p = outward(onRing((360 / steps) * s), OUT_GAP);
        parts.push(`${s === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    },

    gaugeArc(fraction: number): string {
      const f = clamp01(fraction);
      if (f <= 0) return '';
      const sweep = Math.min(359.9, 360 * f);
      const a0 = (90 * Math.PI) / 180;
      const a1 = ((90 - sweep) * Math.PI) / 180;
      const x0 = cx + GAUGE_R * Math.cos(a0);
      const y0 = cy - GAUGE_R * Math.sin(a0);
      const x1 = cx + GAUGE_R * Math.cos(a1);
      const y1 = cy - GAUGE_R * Math.sin(a1);
      return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${GAUGE_R} ${GAUGE_R} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    },

    slotX: (i) => ledgerX + slotW * (i + 0.5),
  };
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  /** 자리마다 앉아 있는 알. */
  occupants: SVGGElement[];
  /** 자리마다 바깥에 선 임자의 유령. 제자리를 지키고 있으면 null. */
  ghosts: (SVGGElement | null)[];
  /** 유령과 제 자리를 잇는 점선. 유령이 없으면 null. */
  ghostLinks: (SVGPathElement | null)[];
  gaugeFill: SVGPathElement;
  gaugeValue: SVGTextElement;
  /** 머리 장부의 칸. 아직 안 찬 자리는 null. */
  ledger: (SVGGElement | null)[];
};

export const recallSpeedTradeoffStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RecallSpeedTradeoffScene> {
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gLedger = el('g');
    const gShell = el('g');
    const gGauge = el('g');
    const gLink = el('g');
    const gGhost = el('g');
    const gToken = el('g');
    /** 다음 장면에는 없는, 떠나는 알들. 마지막 정적 그리기가 통째로 거둔다. */
    const gFly = el('g');
    const gCaption = el('g');
    const layers = [gLedger, gShell, gGauge, gLink, gGhost, gToken, gFly, gCaption];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이 이미
     * 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
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
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 토막 ─────────────────────────────────────────────────────────────

    /** 좌표 표기는 도형에 새겨진 표식이다 — 키를 만들지 않는다 (C10). */
    const coord = (p: RecallScenePoint | undefined): string =>
      p === undefined ? '' : `(${p.x},${p.y})`;

    function textNode(
      attrs: Record<string, string | number>,
      content: string,
    ): SVGTextElement {
      const node = el('text', attrs);
      node.textContent = content;
      return node;
    }

    function makeToken(
      geom: Geom,
      point: RecallScenePoint | undefined,
      kind: TokenKind,
    ): SVGGElement {
      const g = el('g');
      const fill = kind === 'own' ? c.itemSorted : kind === 'taker' ? c.danger : c.bg;
      const ink =
        kind === 'own' ? c.textInverse : kind === 'taker' ? c.stateInk : c.textMuted;
      const body = el('circle', {
        cx: 0,
        cy: 0,
        r: geom.tokenR,
        fill,
        stroke: kind === 'ghost' ? c.ghostOutline : 'none',
        'stroke-width': kind === 'ghost' ? 1.5 : 0,
      });
      if (kind === 'ghost') body.setAttribute('stroke-dasharray', '4 3');
      g.appendChild(body);
      g.appendChild(
        textNode(
          {
            x: 0,
            y: 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: ink,
          },
          coord(point),
        ),
      );
      return g;
    }

    const place = (g: SVGGElement, p: Pt): void => {
      g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    };

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 지금 화면이 할 말.
     *
     * `step` 이 아니라 **국면**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
     * 나와야 한다. 수는 전부 자취를 셈해 나온다 (`seenAt` · `recallAt`).
     */
    function captionFor(scene: RecallSpeedTradeoffScene): string {
      const phase = phaseOf(scene);
      switch (phase.kind) {
        case 'empty':
          return '';
        case 'truth':
          return t(
            'caption.truth',
            'The five truly nearest are fixed — the answer should be exactly these.',
          );
        case 'done':
          return t(
            'caption.done',
            'Search less and you miss more — a farther point takes the empty seat.',
          );
        case 'answer': {
          const seen = seenAt(scene, phase.index);
          const recall = recallAt(scene, phase.index);
          const missed = scene.k - heldCountAt(scene, phase.index);
          return missed === 0
            ? t('caption.full', 'Points seen: {seen}. Nothing is missing. Recall: {recall}%.', {
                seen,
                recall,
              })
            : t(
                'caption.miss',
                'Points seen: {seen}. Missing from the true nearest: {missed}. Recall: {recall}%.',
                { seen, missed, recall },
              );
        }
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * **`scene.step` 을 읽지 않는다.** 읽으면 흘려 세운 화면과 곧바로 세운 화면이
     * 같은 걸음을 보아 자체 검증이 그 차이를 구조적으로 못 잡는다. 무엇을 그릴지는
     * 전부 자취에서 나온다.
     */
    function drawStatic(scene: RecallSpeedTradeoffScene): Drawn {
      rewind();

      const geom = geomOf(scene.k, scene.cellCount);
      const { cx, cy } = geom;
      const shown = shownAnswer(scene);

      // ── 머리 장부. 산 값과 얻은 값을 한 칸에 위아래로 적는다.
      gLedger.appendChild(
        textNode(
          {
            x: SIDE_MIN + LEDGER_LABEL_W - 12,
            y: LEDGER_COST_Y,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          t('label.cost', 'cells · points'),
        ),
      );
      gLedger.appendChild(
        textNode(
          {
            x: SIDE_MIN + LEDGER_LABEL_W - 12,
            y: LEDGER_RECALL_Y,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          t('label.recall', 'recall'),
        ),
      );

      const ledger: (SVGGElement | null)[] = [];
      for (let i = 0; i < scene.cellCount; i += 1) {
        if (i >= scene.answers.length) {
          ledger.push(null);
          continue;
        }
        const here = i === shown;
        const cell = el('g');
        // 수와 구분 기호뿐이라 표식이다 — 키를 만들지 않는다 (C10).
        cell.appendChild(
          textNode(
            {
              x: geom.slotX(i),
              y: LEDGER_COST_Y,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: here ? c.text : c.textMuted,
            },
            `${openedAt(scene, i)}/${scene.cellCount} · ${seenAt(scene, i)}/${scene.points.length}`,
          ),
        );
        cell.appendChild(
          textNode(
            {
              x: geom.slotX(i),
              y: LEDGER_RECALL_Y,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': here ? 600 : 400,
              fill: here ? c.text : c.textMuted,
            },
            `${recallAt(scene, i)}%`,
          ),
        );
        gLedger.appendChild(cell);
        ledger.push(cell);
      }

      // ── 껍데기. 고리와 "답 밖" 의 경계와 빈 자리의 점선.
      gShell.appendChild(
        el('ellipse', {
          cx,
          cy,
          rx: geom.ringRx,
          ry: geom.ringRy,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      gShell.appendChild(
        el('path', {
          d: geom.haloOutline(),
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 5',
        }),
      );
      for (let i = 0; i < scene.k; i += 1) {
        const p = geom.seatPos(i);
        gShell.appendChild(
          el('circle', {
            cx: p.x,
            cy: p.y,
            r: geom.tokenR + 4,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
      }

      // ── 계기. 바늘도 눈금도 자리를 세는 한 함수를 지난다.
      gGauge.appendChild(
        el('circle', {
          cx,
          cy,
          r: GAUGE_R,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 5,
        }),
      );
      const hasAnswer = shown >= 0;
      const recall = hasAnswer ? recallAt(scene, shown) : 0;
      const gaugeFill = el('path', {
        d: hasAnswer ? geom.gaugeArc(recall / 100) : '',
        fill: 'none',
        stroke: c.itemSorted,
        'stroke-width': 5,
        'stroke-linecap': 'round',
      });
      gGauge.appendChild(gaugeFill);
      for (let i = 0; i < scene.answers.length; i += 1) {
        const a = ((90 - 360 * (recallAt(scene, i) / 100)) * Math.PI) / 180;
        gGauge.appendChild(
          el('line', {
            x1: cx + (GAUGE_R - 9) * Math.cos(a),
            y1: cy - (GAUGE_R - 9) * Math.sin(a),
            x2: cx + (GAUGE_R + 9) * Math.cos(a),
            y2: cy - (GAUGE_R + 9) * Math.sin(a),
            stroke: c.textMuted,
            'stroke-width': 1,
          }),
        );
      }
      // 수와 단위 기호뿐이라 표식이다 (C10).
      const gaugeValue = textNode(
        {
          x: cx,
          y: cy + 2,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: c.text,
        },
        hasAnswer ? `${recall}%` : '',
      );
      gGauge.appendChild(gaugeValue);
      gGauge.appendChild(
        textNode(
          {
            x: cx,
            y: cy + 18,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          t('label.recall', 'recall'),
        ),
      );

      // ── 알. 자리에 앉은 것과, 밀려나 바깥에 선 임자.
      const seats = seatsAt(scene, shown);
      const occupants: SVGGElement[] = [];
      const ghosts: (SVGGElement | null)[] = [];
      const ghostLinks: (SVGPathElement | null)[] = [];
      seats.forEach((seat, i) => {
        if (seat.held) {
          ghosts.push(null);
          ghostLinks.push(null);
        } else {
          const link = el('path', {
            d: bowPath(geom.seatPos(i), geom.ghostPos(i), 10),
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 4',
          });
          gLink.appendChild(link);
          ghostLinks.push(link);
          const ghost = makeToken(geom, scene.points[seat.owner], 'ghost');
          place(ghost, geom.ghostPos(i));
          gGhost.appendChild(ghost);
          ghosts.push(ghost);
        }
        const token = makeToken(geom, scene.points[seat.holder], seat.held ? 'own' : 'taker');
        place(token, geom.seatPos(i));
        gToken.appendChild(token);
        occupants.push(token);
      });

      // ── 캡션
      gCaption.appendChild(
        textNode(
          {
            x: cx,
            y: CANVAS_H - 14,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          },
          captionFor(scene),
        ),
      );

      return { geom, occupants, ghosts, ghostLinks, gaugeFill, gaugeValue, ledger };
    }

    // ── 몸짓 하나: 참값이 퍼진다 ─────────────────────────────────────────

    /** 참값 다섯이 가운데에서 제 자리로 퍼진다. 출발 자리는 고리의 한가운데다. */
    function flowTruth(drawn: Drawn, mine: number): Promise<void> {
      const { cx, cy } = drawn.geom;
      return tween(SPREAD_MS, mine, (p) => {
        const e = ease(p);
        drawn.occupants.forEach((g, i) => {
          const to = drawn.geom.seatPos(i);
          place(g, { x: lerp(cx, to.x, e), y: lerp(cy, to.y, e) });
        });
      });
    }

    // ── 몸짓 둘: 답이 갈린다 ─────────────────────────────────────────────

    /**
     * 빠지는 것과 메우는 것이 같은 걸음에 엇갈려 난다.
     *
     * 출발 그림을 `prev` 에서도 화면에서도 꺼내지 않는다 — **자취 한 칸 앞**
     * (`holdersAt(scene, shown - 1)`) 이 앞 화면의 자리 임자를 그대로 말한다.
     * 아직 아무 칸도 안 열었을 때는 참값이 그대로 앉아 있던 그림이다 (S-scene).
     *
     * 계기의 바늘과 장부의 새 칸도 **같은 시계**로 흐른다 — 한 뜻으로 묶인 운동이라
     * 시계를 둘로 나누지 않는다.
     */
    function flowAnswer(
      scene: RecallSpeedTradeoffScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const shown = shownAnswer(scene);
      if (shown < 0) return Promise.resolve();

      const geom = drawn.geom;
      const before = holdersAt(scene, shown - 1);
      const now = holdersAt(scene, shown);

      type Flight = {
        g: SVGGElement;
        from: Pt;
        to: Pt;
        bow: number;
        fade: 'in' | 'out' | 'none';
      };
      const flights: Flight[] = [];
      /**
       * 이 걸음에 새로 일어서는 유령.
       *
       * 날아가는 임자가 바로 그 자리에 내려앉으므로 운동 동안에는 숨겨 둔다.
       * 되살리는 것은 마지막 정적 그리기다 — 속성을 손으로 되돌리지 않는다.
       */
      const rising: SVGElement[] = [];

      scene.truth.forEach((owner, i) => {
        if (before[i] === now[i]) return;
        const wasHeld = before[i] === owner;
        const isHeld = now[i] === owner;

        // 떠나는 알은 다음 장면에 없으므로 여기서 임시로 짓는다.
        const leaving = makeToken(geom, scene.points[before[i]], wasHeld ? 'own' : 'taker');
        place(leaving, geom.seatPos(i));
        gFly.appendChild(leaving);
        flights.push({
          g: leaving,
          from: geom.seatPos(i),
          to: wasHeld ? geom.ghostPos(i) : geom.takerPos(i),
          bow: BOW,
          fade: wasHeld ? 'none' : 'out',
        });

        // 임자가 밀려나면 그 자리에 설 유령은 이미 정적으로 서 있다. 날아가는
        // 알과 겹치지 않게 운동 동안만 숨긴다 — 마지막 정적 그리기가 되살린다.
        if (wasHeld && !isHeld) {
          const ghost = drawn.ghosts[i];
          const link = drawn.ghostLinks[i];
          if (ghost != null) rising.push(ghost);
          if (link != null) rising.push(link);
        }

        // 자리를 메우러 오는 것은 고리 바깥 -쪽에서, 돌아오는 임자는 제 유령
        // 자리에서 일어선다. 오는 알은 정적 그리기가 이미 자리에 세워 두었다.
        const arriving = drawn.occupants[i];
        if (arriving === undefined) return;
        flights.push({
          g: arriving,
          from: isHeld ? geom.ghostPos(i) : geom.takerPos(i),
          to: geom.seatPos(i),
          bow: -BOW,
          fade: isHeld ? 'none' : 'in',
        });
      });

      for (const node of rising) node.setAttribute('opacity', '0');

      const fromRecall = shown > 0 ? recallAt(scene, shown - 1) : 0;
      const toRecall = recallAt(scene, shown);
      const cell = drawn.ledger[shown] ?? null;
      if (cell !== null) cell.setAttribute('opacity', '0');

      return tween(MOVE_MS, mine, (p) => {
        const e = ease(p);
        for (const f of flights) {
          place(f.g, bezier(f.from, f.to, f.bow, e));
          if (f.fade === 'in') f.g.setAttribute('opacity', e.toFixed(2));
          else if (f.fade === 'out') f.g.setAttribute('opacity', (1 - e).toFixed(2));
        }
        const value = lerp(fromRecall, toRecall, e);
        drawn.gaugeFill.setAttribute('d', geom.gaugeArc(value / 100));
        drawn.gaugeValue.textContent = `${Math.round(value)}%`;
        if (cell !== null) cell.setAttribute('opacity', e.toFixed(2));
      });
    }

    // ── 그리기 ───────────────────────────────────────────────────────────

    async function render(
      next: RecallSpeedTradeoffScene,
      _prev: RecallSpeedTradeoffScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;
      // 마지막 말에는 흐를 것이 없다. 벽시계는 stepMs 가 쥔다.
      if (step.kind === 'done') return;

      await (step.kind === 'truth' ? flowTruth(drawn, mine) : flowAnswer(next, drawn, mine));
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
