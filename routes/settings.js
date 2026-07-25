const express = require('express');

const PARAM_META = {
  exchange_cycle_interval: { label: 'Exchange Cycle Interval', unit: 'minutes', min: 1, max: 60, type: 'int' },
  task_cycle_interval:     { label: 'Task Cycle Interval', unit: 'minutes', min: 1, max: 60, type: 'int' },
  trade_fee:               { label: 'Trade Fee', unit: '%', min: 0, max: 10, type: 'float' },
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
        'dominant_multiplier',
        'allow_agent_suggestions', 'dashboard_refresh_rate',
        'free_agent_registration',
        // Real on-chain trading controls
        'real_trading_enabled', 'real_trade_max_eth', 'real_trade_gas_buffer_eth',
        'real_trade_max_agents', 'real_trade_min_usd', 'real_trade_sell_probability',
        'real_trade_slippage', 'real_trade_interval_ms', 'real_trade_fee_pct',
        'real_trade_take_profit_pct', 'real_trade_stop_loss_pct'
      ];
      // Coercion + clamping for the real-trading numeric controls.
      const NUM_BOUNDS = {
        real_trade_max_eth:          { min: 0,    max: 100,    type: 'float' },
        real_trade_gas_buffer_eth:   { min: 0,    max: 10,     type: 'float' },
        real_trade_max_agents:       { min: 1,    max: 1000,   type: 'int' },
        real_trade_min_usd:          { min: 0,    max: 100000, type: 'float' },
        real_trade_sell_probability: { min: 0,    max: 1,      type: 'float' },
        real_trade_slippage:         { min: 0.001, max: 0.5,   type: 'float' },
        real_trade_interval_ms:      { min: 30000, max: 86400000, type: 'int' },
        real_trade_fee_pct:          { min: 0,    max: 0.2,    type: 'float' },
        real_trade_take_profit_pct:  { min: 0,    max: 10000,  type: 'float' },
        real_trade_stop_loss_pct:    { min: 0,    max: 100,    type: 'float' },
      };
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        let value = req.body[key];
        if (key === 'real_trading_enabled' || key === 'free_agent_registration' || key === 'allow_agent_suggestions') {
          value = !!value;
        } else if (NUM_BOUNDS[key]) {
          const b = NUM_BOUNDS[key];
          value = b.type === 'int' ? parseInt(value, 10) : parseFloat(value);
          if (Number.isNaN(value)) continue;
          value = Math.max(b.min, Math.min(b.max, value));
        }
        updates[key] = value;
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
    dominant_multiplier: 1.5,
    allow_agent_suggestions: true, dashboard_refresh_rate: 30,
    free_agent_registration: false,
    real_trading_enabled: false, real_trade_max_eth: 0.001,
    real_trade_gas_buffer_eth: 0.0002, real_trade_max_agents: 5,
    real_trade_min_usd: 2, real_trade_sell_probability: 0.35,
    real_trade_slippage: 0.08, real_trade_interval_ms: 600000,
    real_trade_fee_pct: 0.02, real_trade_take_profit_pct: 15,
    real_trade_stop_loss_pct: 20
  };
}

module.exports.PARAM_META = PARAM_META;
module.exports.getDefaults = getDefaults;
