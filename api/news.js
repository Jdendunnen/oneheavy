export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const feeds = [
    'https://www.blabbermouth.net/feed/',
    'https://loudwire.com/feed/',
    'https://metalinjection.net/feed',
    'https://www.kerrang.com/feed',
    'https://heavymag.com.au/feed'
  ];

  try {
    const results = await Promise.all(
      feeds.map(async (url) => {
        const r = await fetch(
          `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=10`
        );
        return r.json();
      })
    );

    const items = results
      .flatMap(r => r.items || [])
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 30)
      .map(item => ({
        title:       item.title,
        description: item.description?.replace(/<[^>]+>/g, '').slice(0, 200),
        url:         item.link,
        image:       item.thumbnail || item.enclosure?.link || null,
        source:      new URL(item.link).hostname.replace('www.', ''),
        published:   item.pubDate
      }));

    res.status(200).json({ items });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
