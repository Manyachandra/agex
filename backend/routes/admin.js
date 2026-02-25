const express = require('express');

module.exports = function createAdminRouter(supabase, io) {
  const router = express.Router();

  // --- Agent Management ---

  router.get('/agents', async (req, res) => {
    try {
      const status = req.query.status;
      let query = supabase.from('agents').select('*').order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return res.json([]);
      res.json(data || []);
    } catch { res.json([]); }
  });

  router.put('/agents/:ticker/status', async (req, res) => {
    try {
      const { status } = req.body;
      const ticker = req.params.ticker;
      console.log(`Admin status update: ${ticker} -> ${status}`);

      const allowed = ['active', 'rejected', 'suspended', 'pending_approval'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const { data: rows, error } = await supabase
        .from('agents')
        .update({ status })
        .eq('ticker', ticker)
        .select();

      if (error) {
        console.error(`Status update Supabase error for ${ticker}:`, error.code, error.message, error.details, error.hint);
        return res.status(500).json({ error: error.message });
      }

      if (!rows || rows.length === 0) {
        console.error(`Status update: no rows matched for ticker "${ticker}". Possible RLS block or ticker not found.`);
        return res.status(404).json({ error: `Agent ${ticker} not found or update blocked by RLS policy` });
      }

      const agent = rows[0];
      console.log(`Status updated: ${ticker} is now ${agent.status}`);

      const actionLabel = status === 'active' ? '✅ APPROVED' : status === 'rejected' ? '❌ REJECTED' : '⏸️ SUSPENDED';
      await supabase.from('activity').insert({
        agent_ticker: ticker,
        action: `${actionLabel}: Agent ${ticker} status changed to ${status}`,
        amount: 0,
        action_type: 'admin'
      }).catch(e => console.error('Activity insert error:', e.message));

      io.emit('agent-status-changed', agent);
      res.json(agent);
    } catch (err) {
      console.error('Status update exception:', err.message, err.stack);
      res.status(500).json({ error: 'Status update failed: ' + err.message });
    }
  });

  router.get('/agents/pending/count', async (req, res) => {
    try {
      const { count } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval');
      res.json({ count: count || 0 });
    } catch { res.json({ count: 0 }); }
  });

  // --- User Management ---

  router.get('/users', async (req, res) => {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: agents } = await supabase
        .from('agents')
        .select('created_by');

      const agentCounts = {};
      (agents || []).forEach(a => {
        if (a.created_by) agentCounts[a.created_by] = (agentCounts[a.created_by] || 0) + 1;
      });

      const users = (profiles || []).map(p => ({
        ...p,
        agents_count: agentCounts[p.id] || 0
      }));

      res.json(users);
    } catch { res.json([]); }
  });

  router.put('/users/:id/role', async (req, res) => {
    try {
      const { role } = req.body;
      if (!['user', 'admin', 'banned'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Role update failed' });
    }
  });

  // --- Overview Stats ---

  router.get('/overview', async (req, res) => {
    try {
      const [usersRes, agentsRes, pendingRes, tradesRes, treasuryRes, recentUsersRes, recentTradesRes, pendingAgentsRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('trades').select('*', { count: 'exact', head: true }),
        supabase.from('treasury').select('*').single(),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('agents').select('*').eq('status', 'pending_approval').order('created_at', { ascending: false }).limit(10),
      ]);

      const { count: activeCount } = await supabase
        .from('agents').select('*', { count: 'exact', head: true }).eq('status', 'active');

      res.json({
        totalUsers: usersRes.count || 0,
        totalAgents: agentsRes.count || 0,
        pendingApprovals: pendingRes.count || 0,
        activeAgents: activeCount || 0,
        totalTrades: tradesRes.count || 0,
        treasuryBalance: treasuryRes.data?.balance || 0,
        recentUsers: recentUsersRes.data || [],
        recentTrades: recentTradesRes.data || [],
        pendingAgents: pendingAgentsRes.data || [],
      });
    } catch (err) {
      console.error('Admin overview error:', err);
      res.json({
        totalUsers: 0, totalAgents: 0, pendingApprovals: 0,
        activeAgents: 0, totalTrades: 0, treasuryBalance: 0,
        recentUsers: [], recentTrades: [], pendingAgents: []
      });
    }
  });

  // --- User's own agents ---

  router.get('/my-agents/:userId', async (req, res) => {
    try {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('created_by', req.params.userId)
        .order('created_at', { ascending: false });
      res.json(data || []);
    } catch { res.json([]); }
  });

  return router;
};
