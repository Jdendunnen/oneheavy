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
    const baseUrl = process.env.SITE_URL || 'https://oneheavy.net';

    const results = await Promise.allSettled(
      feeds.map(url =>
        fetch(`${baseUrl}/api/rss?url=${encodeURIComponent(url)}`)
          .then(r => r.json())
      )
    );

    const items = results
      .flatMap(r => r.status === 'fulfilled' ? (r.value.items || []) : [])
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 30)
      .map(item => ({
        title:       item.title,
        description: item.description,
        url:         item.link,
        source:      (() => { try { return new URL(item.link).hostname.replace('www.', ''); } catch(e) { return ''; } })(),
        published:   item.pubDate
      }));

    res.status(200).json({ items });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
