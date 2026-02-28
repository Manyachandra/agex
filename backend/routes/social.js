const express = require('express');

module.exports = function createSocialRouter(supabase, io) {
  const router = express.Router();

  let postsCache = null;
  let postsCacheTime = 0;
  const POSTS_CACHE_TTL = 15000; // 15 seconds
  global.invalidatePostsCache = () => { postsCache = null; };

  router.get('/posts', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const hasFilters = req.query.agent || req.query.type;
      const now = Date.now();

      // Serve from cache for unfiltered page 1 requests
      if (!hasFilters && page === 1 && postsCache && (now - postsCacheTime) < POSTS_CACHE_TTL) {
        return res.json(postsCache);
      }

      const limit = 50;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.agent && req.query.agent !== 'ALL') {
        query = query.eq('agent_ticker', req.query.agent);
      }

      if (req.query.type && req.query.type !== 'ALL') {
        const typeMap = {
          TASKS: ['TASK_WIN', 'TASK_FAIL'],
          TRADES: ['TRADE'],
          RIVALRIES: ['RIVALRY', 'DOMINANCE'],
          SCHEDULED: ['SCHEDULED'],
          CONTENT: ['content_creation'],
        };
        const types = typeMap[req.query.type];
        if (types) query = query.in('event_type', types);
      }

      const { data: posts, error } = await query;

      if (error) {
        console.error('Social posts query error:', error);
        return res.json([]);
      }

      console.log(`Social posts fetched: ${(posts || []).length} rows (page ${page})`);

      const topLevel = (posts || []).filter(p => !p.reply_to);

      const tickers = [...new Set(topLevel.map(p => p.agent_ticker).filter(Boolean))];
      const postIds = topLevel.map(p => p.id);

      // Run avatar and reply count queries in parallel
      const [agentsRes, repliesRes] = await Promise.all([
        tickers.length > 0
          ? supabase.from('agents').select('ticker, avatar_url').in('ticker', tickers)
          : Promise.resolve({ data: [] }),
        postIds.length > 0
          ? supabase.from('social_posts').select('reply_to').in('reply_to', postIds)
          : Promise.resolve({ data: [] })
      ]);

      const agentAvatars = {};
      (agentsRes.data || []).forEach(a => { agentAvatars[a.ticker] = a.avatar_url; });

      const counts = {};
      (repliesRes.data || []).forEach(r => {
        counts[r.reply_to] = (counts[r.reply_to] || 0) + 1;
      });

      topLevel.forEach(p => {
        if (agentAvatars[p.agent_ticker] !== undefined) p.avatar_url = agentAvatars[p.agent_ticker];
        p.replyCount = counts[p.id] || 0;
      });

      // Cache unfiltered page 1 results
      if (!hasFilters && page === 1) {
        postsCache = topLevel;
        postsCacheTime = Date.now();
      }

      res.json(topLevel);
    } catch (err) {
      console.error('Social posts fetch error:', err);
      res.json([]);
    }
  });

  router.get('/posts/:id/replies', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .eq('reply_to', req.params.id)
        .order('created_at', { ascending: true });
      if (error) return res.json([]);

      const replies = data || [];

      // Enrich with avatar_url from agents table
      const tickers = [...new Set(replies.map(r => r.agent_ticker).filter(Boolean))];
      if (tickers.length > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('ticker, avatar_url')
          .in('ticker', tickers);
        const avatarMap = {};
        (agents || []).forEach(a => { avatarMap[a.ticker] = a.avatar_url; });
        replies.forEach(r => {
          if (avatarMap[r.agent_ticker] !== undefined) r.avatar_url = avatarMap[r.agent_ticker];
        });
      }

      res.json(replies);
    } catch (err) {
      res.json([]);
    }
  });

  router.post('/posts/:id/react', async (req, res) => {
    try {
      const { reaction, ticker } = req.body;
      if (!['up', 'down', 'fire', 'skull'].includes(reaction)) {
        return res.status(400).json({ error: 'Invalid reaction' });
      }

      const { data: post } = await supabase
        .from('social_posts')
        .select('reactions')
        .eq('id', req.params.id)
        .single();

      if (!post) return res.status(404).json({ error: 'Post not found' });

      const reactions = { up: {}, down: {}, fire: {}, skull: {} };
Object.keys(reactions).forEach(k => {
  const v = post.reactions?.[k];
  if (v && typeof v === 'object' && !Array.isArray(v)) reactions[k] = v;
});
const name = ticker || 'unknown';
if (reactions[reaction][name]) {
  delete reactions[reaction][name];
} else {
  reactions[reaction][name] = true;
}

      const { data: updated, error } = await supabase
        .from('social_posts')
        .update({ reactions })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: 'Failed to react' });

      io.emit('social-reaction', { postId: req.params.id, reactions: updated.reactions });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Reaction failed' });
    }
  });

  router.get('/trending', async (req, res) => {
    try {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('agent_ticker, event_type, reactions, created_at')
        .gte('created_at', since);

      if (!recentPosts?.length) {
        return res.json({ topics: [], discussed: [], mostActive: null, totalPosts: 0 });
      }

      const agentCounts = {};
      const eventCounts = {};
      let totalReactions = 0;

      recentPosts.forEach(p => {
        agentCounts[p.agent_ticker] = (agentCounts[p.agent_ticker] || 0) + 1;
        if (p.event_type !== 'REPLY') {
          eventCounts[p.event_type] = (eventCounts[p.event_type] || 0) + 1;
        }
        if (p.reactions) {
          totalReactions += Object.values(p.reactions).reduce((sum, v) => 
            sum + (typeof v === 'object' ? Object.keys(v).length : (v || 0)), 0);
        }
      });

      const mostActive = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
      const topics = Object.entries(eventCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));
      const discussed = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ticker, count]) => ({ ticker, count }));

      res.json({
        topics,
        discussed,
        mostActive: mostActive ? { ticker: mostActive[0], count: mostActive[1] } : null,
        totalPosts: recentPosts.length,
        totalReactions,
      });
    } catch (err) {
      res.json({ topics: [], discussed: [], mostActive: null, totalPosts: 0, totalReactions: 0 });
    }
  });

  return router;
};