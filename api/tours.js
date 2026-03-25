export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // INTERNATIONAL: Metal Injection tour-dates + Metal Insider touring + Blabbermouth + Loudwire
  const INTL_FEEDS = [
    { url: 'https://metalinjection.net/category/tour-dates/feed/', name: 'Metal Injection' },
    { url: 'https://metalinsider.net/category/touring/feed/',      name: 'Metal Insider' },
    { url: 'https://www.blabbermouth.net/feed/',                    name: 'Blabbermouth' },
    { url: 'https://loudwire.com/feed/',                            name: 'Loudwire' },
  ];

  // AUSTRALIAN: Heavy Mag AU + May The Rock Be With You + Hot Metal Mag
  const AUS_FEEDS = [
    { url: 'https://heavymag.com.au/feed',                                         name: 'Heavy Mag AU' },
    { url: 'https://maytherockbewithyou.com/mtrbwy/feed/',                         name: 'MTRBWY' },
    { url: 'https://hotmetalmag.com/feed/',                                         name: 'Hot Metal' },
  ];

  const TOUR_KEYWORDS = ['tour', 'dates', 'announce', 'touring', 'live', 'shows', 'concert', 'headline'];
  const AUS_KEYWORDS  = ['australia', 'australian', 'melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'down under', 'canberra', 'newcastle', 'hobart'];

  async function safeFetch(url, timeout = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OneHeavy/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml,*/*',
          'Cache-Control': 'no-cache',
        },
      });
      clearTimeout(timer);
      return r.ok ? await r.text() : null;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  function clean(s) {
    return (s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
      .replace(/&#038;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function parseRSS(xml, source, forceAus) {
    const items = [];
    const pattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i.exec(block);
      const linkMatch  = /<link>([^<]+)<\/link>/i.exec(block);
      const dateMatch  = /<pubDate>([^<]+)<\/pubDate>/i.exec(block);
      const descMatch  = /<description[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i.exec(block);

      const title = clean(titleMatch ? (titleMatch[1] || titleMatch[2]) : '');
      const link  = linkMatch ? linkMatch[1].trim() : '';
      const desc  = clean(descMatch ? (descMatch[1] || descMatch[2]) : '').slice(0, 220);
      const pub   = dateMatch ? dateMatch[1].trim() : '';

      if (!title || !link) continue;

      const combined = (title + ' ' + desc).toLowerCase();
      const hasTourKeyword = TOUR_KEYWORDS.some(k => combined.includes(k));
      const isAus = forceAus || AUS_KEYWORDS.some(k => combined.includes(k));

      if (hasTourKeyword) {
        items.push({ title, link, desc, pub, source, isAus, ms: new Date(pub).getTime() || 0 });
      }
      if (items.length >= 10) break;
    }
    return items;
  }

  // Fetch international feeds (filter for tour content but NOT forced-aus)
  const intlResults = await Promise.allSettled(
    INTL_FEEDS.map(async ({ url, name }) => {
      const xml = await safeFetch(url);
      return xml ? parseRSS(xml, name, false) : [];
    })
  );

  // Fetch Australian feeds (all items tagged isAus=true)
  const ausResults = await Promise.allSettled(
    AUS_FEEDS.map(async ({ url, name }) => {
      const xml = await safeFetch(url);
      return xml ? parseRSS(xml, name, true) : [];
    })
  );

  const intlNews = intlResults
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(t => !t.isAus)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 16);

  const ausNews = ausResults
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 16);

  // Merge — Australian items also appear in "all tours"
  const tourNews = [...ausNews, ...intlNews].sort((a, b) => b.ms - a.ms).slice(0, 24);

  return res.status(200).json({
    tourNews,
    intlNews,
    ausNews,
    generated: new Date().toISOString(),
  });
}
