export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROMOTER_FEEDS = [
    {
      name: 'Hardline Entertainment',
      key: 'hardline',
      url: 'https://hardlineentertainment.com.au',
      ticketBase: 'https://hardlineentertainment.com.au',
      flag: '🇦🇺',
    },
    {
      name: 'Destroy All Lines',
      key: 'destroyalllines',
      url: 'https://www.destroyalllines.com',
      ticketBase: 'https://www.destroyalllines.com',
      flag: '🇦🇺',
    },
    {
      name: 'Frontier Touring',
      key: 'frontier',
      url: 'https://www.frontiertouring.com',
      ticketBase: 'https://www.frontiertouring.com',
      flag: '🇦🇺',
    },
    {
      name: 'Handsome Tours',
      key: 'handsome',
      url: 'https://www.handsometours.com',
      ticketBase: 'https://www.handsometours.com',
      flag: '🇦🇺',
    },
    {
      name: 'Metropolis Touring',
      key: 'metropolis',
      url: 'https://www.metropolistouring.com.au',
      ticketBase: 'https://www.metropolistouring.com.au',
      flag: '🇦🇺',
    },
  ];

  // Also pull touring news from our RSS feeds
  const RSS_FEEDS = [
    'https://www.blabbermouth.net/feed/',
    'https://loudwire.com/feed/',
    'https://feeds.feedburner.com/Metalsucks',
    'https://heavymag.com.au/feed',
  ];

  const TOUR_KEYWORDS = ['tour', 'dates', 'announces', 'touring', 'live', 'australia', 'australian', 'shows'];

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

  function parseRSS(xml, source) {
    const items = [];
    const pattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i.exec(block);
      const linkMatch = /<link>([^<]+)<\/link>/i.exec(block);
      const dateMatch = /<pubDate>([^<]+)<\/pubDate>/i.exec(block);
      const descMatch = /<description[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i.exec(block);

      const title = clean(titleMatch ? (titleMatch[1] || titleMatch[2]) : '');
      const link = linkMatch ? linkMatch[1].trim() : '';
      const desc = clean(descMatch ? (descMatch[1] || descMatch[2]) : '').slice(0, 200);
      const pub = dateMatch ? dateMatch[1].trim() : '';

      if (!title || !link) continue;

      const combined = (title + ' ' + desc).toLowerCase();
      const isTourNews = TOUR_KEYWORDS.filter(k => combined.includes(k)).length >= 2;
      const isAus = combined.includes('australia') || combined.includes('melbourne') ||
                    combined.includes('sydney') || combined.includes('brisbane') ||
                    combined.includes('perth') || combined.includes('adelaide');

      if (isTourNews) {
        items.push({
          title,
          link,
          desc,
          pub,
          source,
          isAus,
          ms: new Date(pub).getTime() || 0,
        });
      }
      if (items.length >= 8) break;
    }
    return items;
  }

  // Fetch RSS touring news
  const rssResults = await Promise.allSettled(
    RSS_FEEDS.map(async (url) => {
      const sourceName = url.includes('blabbermouth') ? 'Blabbermouth' :
                         url.includes('loudwire') ? 'Loudwire' :
                         url.includes('metalsucks') ? 'MetalSucks' : 'Heavy Mag AU';
      const xml = await safeFetch(url);
      return xml ? parseRSS(xml, sourceName) : [];
    })
  );

  const tourNews = rssResults
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 20);

  return res.status(200).json({
    tourNews,
    promoters: PROMOTER_FEEDS.map(p => ({ name: p.name, key: p.key, url: p.url, flag: p.flag })),
    generated: new Date().toISOString(),
  });
}
