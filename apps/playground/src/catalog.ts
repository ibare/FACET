import catalogJson from './catalog.json';

export type Topic = {
  id: string;
  name: string;
  facetId?: string;
  /**
   * 'piece' 면 조각 — "이 토픽을 배우려면 무엇을 봐야 하는가" 를 도출해 얻은 항목.
   * 조각은 개념 자체를 보여줄 뿐이고, 필요성·인과·순서는 글이 말한다.
   * 없으면 원래부터 있던 주제 토픽.
   */
  kind?: 'piece';
  /**
   * 한 줄 묘사. 조각은 name 이 개념의 이름이고 desc 가 그 개념이 하는 일이다
   * (FacetJson 의 title/description 과 같은 나눔). 이름만으로 충분한 조각에는
   * 없을 수 있다.
   */
  desc?: string;
  /**
   * 조각을 도출할 때 출발한 자리(토픽 또는 서브도메인 id).
   * 기록일 뿐이며 소속을 뜻하지 않는다 — 한 조각은 여러 주제에서 불릴 수 있다.
   *
   * **지금 없는 토픽을 가리킬 수 있다.** 조각을 만들고 나서 완제품 후보가 다시
   * 그려졌기 때문이다 — 덱 · 이진 트리 · 그래프는 조각이 그 자리를 대신해
   * 목록에서 내렸지만, 그 조각들이 거기서 출발했다는 사실은 그대로다. 되짚어
   * 고치면 기록이 거짓이 된다. 코드가 이 값을 읽어 무엇을 하지는 않는다.
   */
  origin?: string;
};

export type Subdomain = {
  id: string;
  name: string;
  topics: Topic[];
};

export type Domain = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  subdomains: Subdomain[];
};

type CatalogJson = {
  $schema?: string;
  domains: Domain[];
};

export const catalog: Domain[] = (catalogJson as CatalogJson).domains;

export type TopicLocation = {
  domain: Domain;
  subdomain: Subdomain;
  topic: Topic;
};

export function findTopicByFacetId(facetId: string): TopicLocation | null {
  for (const domain of catalog) {
    for (const subdomain of domain.subdomains) {
      for (const topic of subdomain.topics) {
        if (topic.facetId === facetId) return { domain, subdomain, topic };
      }
    }
  }
  return null;
}

export function countImplementedTopics(): number {
  let n = 0;
  for (const d of catalog) for (const s of d.subdomains) for (const t of s.topics) if (t.facetId) n++;
  return n;
}

export function countAllTopics(): number {
  let n = 0;
  for (const d of catalog) for (const s of d.subdomains) n += s.topics.length;
  return n;
}

export function countPieces(): number {
  let n = 0;
  for (const d of catalog) for (const s of d.subdomains) for (const t of s.topics) if (t.kind === 'piece') n++;
  return n;
}

/**
 * 구현된 조각 수.
 *
 * 조각 수는 구현/예정 분할과 **다른 축**이다. 화면에 셋을 나란히 두면
 * "구현 + 예정 + 조각" 으로 읽히는데, 조각은 그 둘에 이미 나뉘어 들어가 있다.
 * 조각 뱃지가 자기 안에서 닫히도록 이 값을 함께 보인다.
 */
export function countImplementedPieces(): number {
  let n = 0;
  for (const d of catalog)
    for (const s of d.subdomains) for (const t of s.topics) if (t.kind === 'piece' && t.facetId) n++;
  return n;
}
