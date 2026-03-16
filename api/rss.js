export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Reduced to 1 minute cache so stories refresh much more frequently
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneHeavy/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cache-Control': 'no-cache',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return res.status(502).json({ error: `Feed returned ${response.status}` });
    }

    const xml = await response.text();
    const items = parseRSS(xml);
    return res.status(200).json({ items });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseRSS(xml) {
  const items = [];
  const pattern = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const block = match[1] || match[2];
    const title   = extract(block, 'title');
    const link    = extractLink(block);
    const desc    = extractDesc(block);
    const pubDate = extractDate(block);
    if (title && link) {
      items.push({
        title:       clean(title),
        link,
        description: clean(desc).slice(0, 300),
        pubDate:     pubDate || new Date().toISOString(),
      });
    }
    if (items.length >= 12) break;
  }
  return items;
}

function extract(block, tag) {
  const re = new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/' + tag + '>', 'i');
  const m = re.exec(block);
  return m ? (m[1] || m[2] || '') : '';
}

function extractLink(block) {
  let m = /<link>([^<]+)<\/link>/i.exec(block);
  if (m) return m[1].trim();
  m = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
  if (m) return m[1].trim();
  m = /<guid[^>]*>([^<]+)<\/guid>/i.exec(block);
  if (m && m[1].trim().startsWith('http')) return m[1].trim();
  return '';
}

function extractDesc(block) {
  return extract(block, 'description') || extract(block, 'summary') || extract(block, 'content') || '';
}

function extractDate(block) {
  const raw = extract(block, 'pubDate') || extract(block, 'published') || extract(block, 'updated') || '';
  if (!raw) return '';
  try { return new Date(raw.trim()).toISOString(); } catch(e) { return ''; }
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
