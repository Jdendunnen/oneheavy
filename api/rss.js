// OneHeavy RSS Proxy — Vercel Serverless Function
// CommonJS format — required for Vercel Node.js functions
// Usage: /api/rss?url=https://www.blabbermouth.net/feed/

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneHeavy/1.0; RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Feed returned ${response.status}` });
    }

    const xml = await response.text();
    const items = parseRSS(xml);

    return res.status(200).json({ items });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function parseRSS(xml) {
  const items = [];
  const itemPattern = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1] || match[2];
    const title   = extract(block, 'title');
    const link    = extractLink(block);
    const desc    = extractDesc(block);
    const pubDate = extractDate(block);

    if (title && link) {
      items.push({
        title:       cleanText(title),
        link,
        description: cleanText(desc).slice(0, 280),
        pubDate:     pubDate || new Date().toISOString(),
      });
    }
    if (items.length >= 12) break;
  }
  return items;
}

function extract(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? (m[1] || m[2] || '') : '';
}

function extractLink(block) {
  let m = /<link>([^<]+)<\/link>/i.exec(block);
  if (m) return m[1].trim();
  m = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
  if (m) return m[1].trim();
  m = /<guid[^>]*>([^<]+)<\/guid>/i.exec(block);
  if (m && m[1].startsWith('http')) return m[1].trim();
  return '';
}

function extractDesc(block) {
  return extract(block, 'description') ||
         extract(block, 'summary')     ||
         extract(block, 'content')     || '';
}

function extractDate(block) {
  const raw = extract(block, 'pubDate')   ||
              extract(block, 'published') ||
              extract(block, 'updated')   || '';
  if (!raw) return '';
  try { return new Date(raw).toISOString(); } catch(e) { return ''; }
}

function cleanText(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g,  '&')
    .replace(/&nbsp;/g,  ' ')
    .replace(/\s+/g,     ' ')
    .trim();
}
