const express = require('express');

const PARAM_META = {
  exchange_cycle_interval: { label: 'Exchange Cycle Interval', unit: 'minutes', min: 1, max: 60, type: 'int' },
  task_cycle_interval:     { label: 'Task Cycle Interval', unit: 'minutes', min: 1, max: 60, type: 'int' },
  trade_fee:               { label: 'Trade Fee', unit: '%', min: 0, max: 10, type: 'float' },
  bankruptcy_threshold:    { label: 'Bankruptcy Threshold', unit: '$', min: 0.01, max: 1, type: 'float' },
  dominant_multiplier:     { label: 'Dominant Multiplier', unit: 'x avg', min: 1.1, max: 3, type: 'float' },
  dashboard_refresh_rate:  { label: 'Dashboard Refresh Rate', unit: 'seconds', min: 10, max: 300, type: 'int' },
};

module.exports = function createSettingsRouter(supabase, io) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) return res.json(getDefaults());
      res.json(data);
    } catch {
      res.json(getDefaults());
    }
  });

  router.put('/', async (req, res) => {
    try {
      const allowed = [
        'exchange_cycle_interval', 'task_cycle_interval', 'trade_fee',
        'bankruptcy_threshold', 'dominant_multiplier',
        'allow_agent_suggestions', 'dashboard_refresh_rate'
      ];
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('settings')
        .update(updates)
        .eq('id', 1)
        .select()
        .single();

      if (error) return res.status(500).json({ error: 'Failed to update settings' });

      io.emit('settings-updated', data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Update failed' });
    }
  });

  router.get('/suggestions', async (req, res) => {
    try {
      const status = req.query.status || 'pending';
      let query = supabase
        .from('agent_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) return res.json([]);
      res.json(data || []);
    } catch {
      res.json([]);
    }
  });

  router.post('/suggestions', async (req, res) => {
    try {
      const { agentTicker, parameter, currentValue, proposedValue, reasoning } = req.body;
      if (!agentTicker || !parameter || !reasoning) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { data, error } = await supabase
        .from('agent_suggestions')
        .insert({
          agent_ticker: agentTicker,
          parameter,
          current_value: String(currentValue),
          proposed_value: String(proposedValue),
          reasoning,
          status: 'pending'
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: 'Failed to create suggestion' });

      io.emit('new-suggestion', data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Suggestion failed' });
    }
  });

  router.put('/suggestions/:id/approve', async (req, res) => {
    try {
      const { data: suggestion } = await supabase
        .from('agent_suggestions')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
      if (suggestion.status !== 'pending') return res.status(400).json({ error: 'Already resolved' });

      const meta = PARAM_META[suggestion.parameter];
      let value = suggestion.proposed_value;
      if (meta?.type === 'int') value = parseInt(value);
      else if (meta?.type === 'float') value = parseFloat(value);

      if (meta) {
        if (value < meta.min || value > meta.max) {
          return res.status(400).json({ error: `Value out of range (${meta.min}-${meta.max})` });
        }
      }

      const { error: updateErr } = await supabase
        .from('settings')
        .update({ [suggestion.parameter]: value, updated_at: new Date().toISOString() })
        .eq('id', 1);

      if (updateErr) return res.status(500).json({ error: 'Failed to apply setting' });

      const { data: updated } = await supabase
        .from('agent_suggestions')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

      await supabase.from('activity').insert({
        agent_ticker: suggestion.agent_ticker,
        action: `📋 Suggestion APPROVED: ${suggestion.parameter} → ${suggestion.proposed_value}`,
        amount: 0,
        action_type: 'suggestion'
      });

      io.emit('suggestion-resolved', updated);

      const { data: newSettings } = await supabase
        .from('settings').select('*').eq('id', 1).single();
      io.emit('settings-updated', newSettings);

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Approval failed' });
    }
  });

  router.put('/suggestions/:id/reject', async (req, res) => {
    try {
      const { data: suggestion } = await supabase
        .from('agent_suggestions')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
      if (suggestion.status !== 'pending') return res.status(400).json({ error: 'Already resolved' });

      const { data: updated } = await supabase
        .from('agent_suggestions')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

      await supabase.from('activity').insert({
        agent_ticker: suggestion.agent_ticker,
        action: `📋 Suggestion REJECTED: ${suggestion.parameter} → ${suggestion.proposed_value}`,
        amount: 0,
        action_type: 'suggestion'
      });

      io.emit('suggestion-resolved', updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Rejection failed' });
    }
  });

  return router;
};

function getDefaults() {
  return {
    id: 1, exchange_cycle_interval: 10, task_cycle_interval: 15, trade_fee: 2,
    bankruptcy_threshold: 0.10, dominant_multiplier: 1.5,
    allow_agent_suggestions: true, dashboard_refresh_rate: 30
  };
}

module.exports.PARAM_META = PARAM_META;
module.exports.getDefaults = getDefaults;
