import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import {
  CaretDown,
  Sparkle,
  ArrowRight,
  Lock,
  Cpu,
  Code,
  Stack,
  Network,
  Database,
  Translate,
  Brain,
  Lightning,
  Buildings,
  ShieldCheck,
  PaintBrush,
  MathOperations,
  Atom,
  PuzzlePiece,
} from '@phosphor-icons/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import {
  catalog,
  countAllTopics,
  countImplementedTopics,
  countPieces,
  type Domain,
  type Subdomain,
  type Topic,
} from '../catalog.js';
import { PreferencesToolbar } from '../components/PreferencesToolbar.js';

const ICONS: Record<string, PhIcon> = {
  Cpu, Code, Stack, Network, Database, Translate, Brain, Lightning, Buildings, ShieldCheck, PaintBrush, MathOperations,
};

type AccentTokens = {
  ringSoft: string;
  text: string;
  textHover: string;
  dot: string;
  iconBg: string;
  iconRing: string;
  badge: string;
  glow: string;
};

function tok(c: string): AccentTokens {
  return {
    ringSoft: `ring-${c}-500/25 dark:ring-${c}-400/20`,
    text: `text-${c}-700 dark:text-${c}-300`,
    textHover: `group-hover/tile:text-${c}-700 dark:group-hover/tile:text-${c}-300`,
    dot: `bg-${c}-500 dark:bg-${c}-400`,
    iconBg: `bg-${c}-100 dark:bg-${c}-400/10`,
    iconRing: `ring-${c}-300 dark:ring-${c}-400/30`,
    badge: `bg-${c}-100 text-${c}-700 ring-${c}-300 dark:bg-${c}-400/15 dark:text-${c}-200 dark:ring-${c}-400/30`,
    glow: c,
  };
}

const ACCENTS: Record<string, AccentTokens> = {
  amber: tok('amber'),
  cyan: tok('cyan'),
  violet: tok('violet'),
  sky: tok('sky'),
  emerald: tok('emerald'),
  rose: tok('rose'),
  fuchsia: tok('fuchsia'),
  yellow: tok('yellow'),
  indigo: tok('indigo'),
  red: tok('red'),
  pink: tok('pink'),
  teal: tok('teal'),
};

// Tailwind v4 source scan — 동적으로 조합되는 색상 클래스 토큰을 노출.
export const SAFELIST: readonly string[] = (() => {
  const colors = ['amber','cyan','violet','sky','emerald','rose','fuchsia','yellow','indigo','red','pink','teal'];
  const out: string[] = [];
  for (const c of colors) {
    out.push(
      `ring-${c}-500/25`, `dark:ring-${c}-400/20`,
      `text-${c}-700`, `dark:text-${c}-300`,
      `group-hover/tile:text-${c}-700`, `dark:group-hover/tile:text-${c}-300`,
      `bg-${c}-500`, `dark:bg-${c}-400`,
      `bg-${c}-100`, `dark:bg-${c}-400/10`,
      `ring-${c}-300`, `dark:ring-${c}-400/30`,
      `text-${c}-700`, `dark:text-${c}-200`,
      `bg-${c}-400/15`,
    );
  }
  return out;
})();

/**
 * 아코디언 펼침 상태를 세션에 남긴다.
 *
 * 조각을 보러 갔다 뒤로 오면 이 페이지가 새로 마운트되어 접힌 채로 돌아온다.
 * 목록이 길어 매번 다시 펼쳐야 하므로, 열어 둔 것을 기억한다. 탭을 닫으면
 * 사라지는 세션 범위가 맞다 — 어제 무엇을 열어 뒀는지까지 기억할 일은 아니다.
 *
 * 첫 렌더에서 동기로 읽어 높이가 처음부터 맞는다. 그래야 브라우저의 스크롤
 * 복원도 제자리를 찾는다.
 */
function usePersistedAccordion(key: string, fallback: string[]): [string[], (next: string[]) => void] {
  const [value, setValue] = useState<string[]>(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed;
      return fallback;
    } catch {
      // 사생활 보호 모드 등에서 sessionStorage 접근 자체가 던진다.
      return fallback;
    }
  });

  const set = useCallback(
    (next: string[]) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 저장하지 못해도 이번 세션의 화면은 그대로 돈다.
      }
    },
    [key],
  );

  return [value, set];
}

function accentOf(name: string): AccentTokens {
  return ACCENTS[name] ?? ACCENTS.cyan;
}

function countDomainImplemented(d: Domain): number {
  let n = 0;
  for (const s of d.subdomains) for (const t of s.topics) if (t.facetId) n++;
  return n;
}
function countDomainTopics(d: Domain): number {
  let n = 0;
  for (const s of d.subdomains) n += s.topics.length;
  return n;
}
function countSubdomainImplemented(s: Subdomain): number {
  return s.topics.filter((t) => t.facetId).length;
}

export function IndexPage() {
  const total = countAllTopics();
  const ready = countImplementedTopics();
  const pieces = countPieces();
  const [openDomains, setOpenDomains] = usePersistedAccordion('facet:catalog:domains', ['cs-fundamentals']);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-fg-subtle">
            <Atom weight="duotone" className="h-4 w-4" />
            FACET · Visualization Catalog
          </div>
          <PreferencesToolbar />
        </div>

        <header className="mb-12">
          <h1 className="text-4xl font-semibold leading-tight text-fg sm:text-5xl">
            컴퓨터 세상의 개념을
            <br />
            <span className="bg-gradient-to-r from-sky-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent dark:from-sky-300 dark:via-violet-300 dark:to-fuchsia-300">
              살아 움직이는 형태
            </span>
            로.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">
            12개 분야, {total}개 시각화 목록. 알고리즘이 표준 이벤트를 발신하면 Projector 가 등록된 View 를 갱신한다 — 동일한 한 흐름에서 그래픽·코드·메트릭이 동기화된다.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/30">
              <Sparkle weight="fill" className="h-3.5 w-3.5" />
              <span className="font-medium">{ready}</span>
              <span className="opacity-70">개 구현 완료</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 text-fg-muted ring-1 ring-border">
              <Lock weight="duotone" className="h-3.5 w-3.5" />
              <span className="font-medium">{total - ready}</span>
              <span className="text-fg-subtle">개 예정</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 text-fg-muted ring-1 ring-border">
              <PuzzlePiece weight="duotone" className="h-3.5 w-3.5" />
              <span className="font-medium">{pieces}</span>
              <span className="text-fg-subtle">개 조각</span>
            </div>
          </div>
        </header>

        <Accordion.Root
          type="multiple"
          className="space-y-4"
          value={openDomains}
          onValueChange={setOpenDomains}
        >
          {catalog.map((domain) => (
            <DomainCard key={domain.id} domain={domain} />
          ))}
        </Accordion.Root>
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: Domain }) {
  const accent = accentOf(domain.accent);
  const Icon = ICONS[domain.icon] ?? Cpu;
  const implemented = countDomainImplemented(domain);
  const total = countDomainTopics(domain);
  const [openSubs, setOpenSubs] = usePersistedAccordion(`facet:catalog:subs:${domain.id}`, []);

  return (
    <Accordion.Item
      value={domain.id}
      className={`group relative overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border backdrop-blur-sm transition hover:ring-border-strong ${accent.ringSoft}`}
    >
      <div className={`pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full ${accent.iconBg} opacity-50 blur-3xl`} />
      <Accordion.Header>
        <Accordion.Trigger className="group/trigger flex w-full items-center gap-4 px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-fg/20">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.iconBg} ring-1 ${accent.iconRing}`}>
            <Icon weight="duotone" className={`h-6 w-6 ${accent.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-fg">{domain.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${accent.badge}`}>
                {implemented}/{total}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-fg-muted">{domain.tagline}</p>
          </div>
          <CaretDown
            weight="bold"
            className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden">
        <div className="px-5 pb-5 pt-1">
          <Accordion.Root type="multiple" className="space-y-2" value={openSubs} onValueChange={setOpenSubs}>
            {domain.subdomains.map((sub) => (
              <SubdomainItem key={sub.id} subdomain={sub} accent={accent} />
            ))}
          </Accordion.Root>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

function SubdomainItem({ subdomain, accent }: { subdomain: Subdomain; accent: AccentTokens }) {
  const implemented = countSubdomainImplemented(subdomain);

  return (
    <Accordion.Item value={subdomain.id} className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
      <Accordion.Header>
        <Accordion.Trigger className="group/sub flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-fg/20">
          <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${implemented > 0 ? accent.dot : 'bg-fg-subtle/40'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-fg">{subdomain.name}</h3>
              {implemented > 0 && (
                <span className={`shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium ring-1 ${accent.badge}`}>
                  {implemented}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-fg-subtle">{subdomain.topics.length}</span>
            </div>
          </div>
          <CaretDown
            weight="bold"
            className="h-3 w-3 shrink-0 text-fg-subtle transition-transform duration-200 group-data-[state=open]/sub:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden">
        <div className="grid grid-cols-1 gap-1.5 px-3 pb-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
          {subdomain.topics.map((topic) => (
            <TopicTile key={topic.id} topic={topic} accent={accent} />
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

function TopicTile({ topic, accent }: { topic: Topic; accent: AccentTokens }) {
  // 조각은 주제 토픽과 한 목록에 섞여 있다. 아이콘으로 갈라 둔다 —
  // 주제는 그 자체가 배울 대상이고, 조각은 그것을 배우다 마주치는 개념이다.
  const isPiece = topic.kind === 'piece';
  const Mark = isPiece ? PuzzlePiece : Sparkle;
  const here = useLocation();

  if (topic.facetId) {
    return (
      <Link
        to={`/facet/${encodeURIComponent(topic.facetId)}`}
        // 지금 자리를 실어 보내면 App 이 이 목록을 배경으로 깔고 모달을 얹는다.
        // 새 탭·주소 직접 입력으로 들어오면 state 가 없어 독자 페이지가 뜬다.
        state={{ background: here }}
        title={topic.desc}
        className={`group/tile relative flex items-center justify-between gap-2 overflow-hidden rounded-lg bg-surface-raised px-3 py-2.5 ring-1 ring-border transition hover:bg-surface-raised-hover hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 ${accent.ringSoft}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <Mark weight={isPiece ? 'duotone' : 'fill'} className={`mt-1 h-3 w-3 shrink-0 ${accent.text}`} />
          <div className="min-w-0">
            <div className="truncate text-sm leading-snug text-fg">{topic.name}</div>
            <div className="truncate font-mono text-[10px] leading-tight text-fg-subtle">{topic.id}</div>
          </div>
        </div>
        <ArrowRight
          weight="bold"
          className={`mt-1 h-3.5 w-3.5 shrink-0 text-fg-subtle transition group-hover/tile:translate-x-0.5 ${accent.textHover}`}
        />
      </Link>
    );
  }

  return (
    <div
      title={topic.desc}
      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-border opacity-70"
    >
      <div className="flex min-w-0 items-start gap-2">
        {isPiece ? (
          <PuzzlePiece weight="duotone" className="mt-1 h-3 w-3 shrink-0 text-fg-subtle" />
        ) : (
          <Lock weight="duotone" className="mt-1 h-3 w-3 shrink-0 text-fg-subtle" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm leading-snug text-fg-muted">{topic.name}</div>
          <div className="truncate font-mono text-[10px] leading-tight text-fg-subtle">{topic.id}</div>
        </div>
      </div>
      <span className="mt-1 shrink-0 text-[10px] uppercase tracking-wider text-fg-subtle">
        {isPiece ? 'piece' : 'soon'}
      </span>
    </div>
  );
}
