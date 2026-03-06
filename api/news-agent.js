export default async function handler(req, res) {
  // Security check - only allow Vercel cron calls
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const feeds = [
    'https://www.blabbermouth.net/feed/',
    'https://loudwire.com/feed/',
    'https://metalinjection.net/feed'
  ];

  try {
    const results = await Promise.all(
      feeds.map(async (url) => {
        const r = await fetch(
          `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=5`
        );
        return r.json();
      })
    );

    const items = results
      .flatMap(r => r.items || [])
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
            content: `Summarise this metal news in 2 punchy sentences for OneHeavy.net.
Be direct, passionate, no fluff. End with 🤘
Title: ${item.title}
Content: ${item.description?.replace(/<[^>]+>/g, '').slice(0, 400)}`
          }]
        })
      });

      const aiData = await aiResponse.json();
      const summary = aiData.content?.[0]?.text || item.description;

      summaries.push({
        title:     item.title,
        summary,
        url:       item.link,
        source:    new URL(item.link).hostname.replace('www.', ''),
        published: item.pubDate
      });
    }

    res.status(200).json({ success: true, count: summaries.length, items: summaries });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
