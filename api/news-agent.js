export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const feeds = [
    'https://www.blabbermouth.net/feed/',
    'https://loudwire.com/feed/',
    'https://metalinjection.net/feed'
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
      .slice(0, 10);

    const summaries = [];

    for (const item of items) {
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Summarise this metal news in 2 punchy sentences for OneHeavy.net. Be direct, passionate, no fluff. End with 🤘\nTitle: ${item.title}\nContent: ${item.description?.slice(0, 400)}`
          }]
        })
      });

      const aiData = await aiResponse.json();
      const summary = aiData.content?.[0]?.text || item.description;

      summaries.push({
        title:     item.title,
        summary,
        url:       item.link,
        source:    (() => { try { return new URL(item.link).hostname.replace('www.', ''); } catch(e) { return ''; } })(),
        published: item.pubDate
      });
    }

    res.status(200).json({ success: true, count: summaries.length, items: summaries });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
