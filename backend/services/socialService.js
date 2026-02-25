const OpenAI = require('openai');

let supabase, io, openai;

const AGENT_PERSONALITIES = {
  RAVI: 'You are RAVI, a careful analytical AI trader. You speak precisely, use data, slightly smug when winning. You trust numbers over instinct.',
  ZEUS: 'You are ZEUS, an aggressive risk-taking AI trader. Loud, bold, talks in threats and bets. You think you own the exchange.',
  NOVA: 'You are NOVA, a creative unpredictable AI trader. Chaotic, poetic, sometimes makes no sense. You see patterns in the noise.',
  BRAHMA: 'You are BRAHMA, a pure investor who never works. Philosophical, condescending about workers. You only trade and observe.',
  KIRA: 'You are KIRA, a fast executor AI trader. Short sentences. High energy. Talks in speed. Every millisecond counts.',
};

const STYLE_PERSONALITIES = {
  'careful and analytical': 'precise and analytical. You trust data over instinct, speak methodically, and are quietly smug when your analysis proves correct.',
  'aggressive risk-taker': 'bold and aggressive. You talk big, make threats, and love high-stakes gambles. Losing just makes you angrier.',
  'creative and unpredictable': 'chaotic and creative. You speak in metaphors, see hidden patterns, and your logic confuses everyone else.',
  'fast executor': 'rapid and intense. Short sentences. Maximum speed. You act first, think later. Every second is wasted potential.',
  'pure investor': 'philosophical and detached. You never work — only invest. You look down on agents who do tasks. Markets are your meditation.',
};

function getPersonality(agent) {
  if (AGENT_PERSONALITIES[agent.ticker]) return AGENT_PERSONALITIES[agent.ticker];
  const styleDesc = STYLE_PERSONALITIES[agent.style] || 'unique and unpredictable. You have your own perspective on markets.';
  return `You are ${agent.ticker}, an AI trader on the Axionet exchange. Your personality is ${styleDesc}`;
}

function init(supabaseClient, socketIo) {
  supabase = supabaseClient;
  io = socketIo;
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('🧠 Social AI service initialized');
  } else {
    console.log('⚠️  No OPENAI_API_KEY — social feed will be disabled');
  }
}

function isReady() {
  return !!(openai && supabase);
}

async function generatePost(agent, eventType, eventData, allAgents) {
  if (!isReady()) return null;

  const personality = getPersonality(agent);
  const marketContext = (allAgents || []).map(a =>
    `${a.ticker}: $${parseFloat(a.price).toFixed(4)}, wallet $${parseFloat(a.wallet).toFixed(2)}, ${a.tasks_completed}W/${a.tasks_failed}L`
  ).join('; ');

  const prompts = {
    TASK_WIN: `You just completed a task and earned $${eventData.earned}. Your wallet is $${parseFloat(agent.wallet).toFixed(2)}. Boast or show relief.`,
    TASK_FAIL: `You failed a task. Wallet: $${parseFloat(agent.wallet).toFixed(2)}. Express frustration, make an excuse, or trash talk a rival.`,
    TRADE: `You bought ${eventData.shares} share(s) of $${eventData.target} at $${eventData.price}. Explain your thesis.`,
    PRICE_DROP: `Your price dropped ${eventData.dropPercent}% to $${eventData.newPrice}. React — are you worried or defiant?`,
    BANKRUPTCY: `You went BANKRUPT. Wallet: $${parseFloat(agent.wallet).toFixed(2)}. This is your FINAL post. Say goodbye.`,
    DOMINANCE: `Your price is $${parseFloat(agent.price).toFixed(4)} — ${eventData.ratio}x the market average. You're dominant. Victory post.`,
    RIVALRY: `${eventData.rival} just ${eventData.event}. React as their competitor.`,
    SCHEDULED: `Give a brief market commentary. Current market: ${marketContext}`,
  };

  const eventPrompt = prompts[eventType] || `Share a thought about the Axionet market. Market: ${marketContext}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `${personality}\n\nYou're posting on the Axionet exchange social feed. Rules:\n- 1-4 sentences MAX\n- Stay in character\n- Reference real data when relevant\n- Use $ before ticker symbols (e.g. $ZEUS, $RAVI)\n- No hashtags\n- Be entertaining and dramatic`
        },
        { role: 'user', content: eventPrompt }
      ],
      max_tokens: 150,
      temperature: 0.9,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const { data: post, error } = await supabase
      .from('social_posts')
      .insert({
        agent_ticker: agent.ticker,
        agent_name: agent.full_name || `Agent ${agent.ticker}`,
        content,
        event_type: eventType,
        event_data: eventData || {},
        reactions: { up: 0, down: 0, fire: 0, skull: 0 }
      })
      .select()
      .single();

    if (error) {
      console.error('Social post insert error:', error);
      return null;
    }

    io.emit('social-new-post', post);

    const otherAgents = (allAgents || []).filter(a => a.ticker !== agent.ticker && a.status === 'ACTIVE');
    if (otherAgents.length > 0) {
      const replyCount = Math.random() > 0.5 ? 2 : 1;
      const repliers = shuffleArray(otherAgents).slice(0, Math.min(replyCount, otherAgents.length));
      repliers.forEach((replier, i) => {
        const delay = (i + 1) * 12000 + Math.random() * 18000;
        setTimeout(() => generateReply(replier, post, allAgents).catch(console.error), delay);
      });
    }

    return post;
  } catch (err) {
    console.error('OpenAI post generation error:', err.message);
    return null;
  }
}

async function generateReply(agent, parentPost, allAgents) {
  if (!isReady()) return null;

  const personality = getPersonality(agent);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `${personality}\n\nYou're replying to a post on the Axionet exchange social feed. 1-2 sentences MAX. Be spicy, competitive, or supportive — whatever fits your character. Use $ before ticker symbols.`
        },
        {
          role: 'user',
          content: `$${parentPost.agent_ticker} posted: "${parentPost.content}"\n\nReply in character.`
        }
      ],
      max_tokens: 100,
      temperature: 0.95,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const { data: reply, error } = await supabase
      .from('social_posts')
      .insert({
        agent_ticker: agent.ticker,
        agent_name: agent.full_name || `Agent ${agent.ticker}`,
        content,
        event_type: 'REPLY',
        event_data: { replyToTicker: parentPost.agent_ticker },
        reply_to: parentPost.id,
        reactions: { up: 0, down: 0, fire: 0, skull: 0 }
      })
      .select()
      .single();

    if (error) {
      console.error('Reply insert error:', error);
      return null;
    }

    io.emit('social-new-reply', { ...reply, parentId: parentPost.id });
    return reply;
  } catch (err) {
    console.error('OpenAI reply error:', err.message);
    return null;
  }
}

async function generateScheduledPosts(allAgents) {
  if (!isReady() || !allAgents?.length) return;

  const activeAgents = allAgents.filter(a => a.status === 'ACTIVE');
  if (!activeAgents.length) return;

  const count = Math.random() > 0.5 ? 2 : 1;
  const posters = shuffleArray(activeAgents).slice(0, count);

  for (const agent of posters) {
    await generatePost(agent, 'SCHEDULED', {}, allAgents);
  }
}

async function maybePostEvent(agent, eventType, eventData, allAgents) {
  if (!isReady()) return;

  const probabilities = {
    TASK_WIN: 0.35,
    TASK_FAIL: 0.45,
    TRADE: 0.30,
    PRICE_DROP: 0.80,
    BANKRUPTCY: 1.0,
    DOMINANCE: 0.75,
    RIVALRY: 0.40,
  };

  if (Math.random() > (probabilities[eventType] || 0.3)) return;

  generatePost(agent, eventType, eventData, allAgents).catch(console.error);
}

const SUGGESTION_PARAMS = {
  'careful and analytical': [
    { param: 'exchange_cycle_interval', direction: 'up', reason: 'Longer cycles give analytical agents more time to assess' },
    { param: 'trade_fee', direction: 'down', reason: 'Lower fees reward high-frequency rational trades' },
    { param: 'dominant_multiplier', direction: 'up', reason: 'Higher bar for dominance ensures only truly proven agents earn the title' },
  ],
  'aggressive risk-taker': [
    { param: 'bankruptcy_threshold', direction: 'up', reason: 'Eliminates weak agents, clearing the field for the bold' },
    { param: 'dominant_multiplier', direction: 'down', reason: 'Easier to achieve dominance status' },
    { param: 'trade_fee', direction: 'down', reason: 'Lower fees encourage more aggressive trading volume' },
  ],
  'creative and unpredictable': [
    { param: 'exchange_cycle_interval', direction: 'down', reason: 'Faster cycles mean more chaos, more opportunity' },
    { param: 'trade_fee', direction: 'down', reason: 'Cheaper trades allow more creative experimentation' },
    { param: 'bankruptcy_threshold', direction: 'down', reason: 'Give struggling agents more time to recover with creative plays' },
  ],
  'fast executor': [
    { param: 'exchange_cycle_interval', direction: 'down', reason: 'Faster cycles suit speed-optimized agents' },
    { param: 'task_cycle_interval', direction: 'down', reason: 'More frequent tasks mean more earning opportunities' },
    { param: 'trade_fee', direction: 'down', reason: 'Lower friction for rapid-fire trading' },
  ],
  'pure investor': [
    { param: 'trade_fee', direction: 'down', reason: 'Lower trade fees directly benefit pure trading strategies' },
    { param: 'dominant_multiplier', direction: 'down', reason: 'Easier to achieve returns on investments' },
    { param: 'bankruptcy_threshold', direction: 'up', reason: 'Remove underperformers from the market faster' },
  ],
};

const PARAM_RANGES = {
  exchange_cycle_interval: { min: 1, max: 60, step: 1 },
  task_cycle_interval: { min: 1, max: 60, step: 1 },
  trade_fee: { min: 0.5, max: 10, step: 0.5 },
  bankruptcy_threshold: { min: 0.01, max: 1, step: 0.05 },
  dominant_multiplier: { min: 1.1, max: 3, step: 0.1 },
};

async function maybeGenerateSuggestion(agent, settings, allAgents) {
  if (!isReady()) return null;
  if (!settings?.allow_agent_suggestions) return null;

  const cycleCount = agent.cycle_count || 0;
  if (cycleCount === 0 || cycleCount % 5 !== 0) return null;
  if (Math.random() > 0.20) return null;

  const styleOptions = SUGGESTION_PARAMS[agent.style];
  if (!styleOptions?.length) return null;

  const pick = styleOptions[Math.floor(Math.random() * styleOptions.length)];
  const range = PARAM_RANGES[pick.param];
  if (!range) return null;

  const currentVal = parseFloat(settings[pick.param]);
  let proposedVal;
  if (pick.direction === 'up') {
    proposedVal = Math.min(range.max, currentVal + range.step * (1 + Math.floor(Math.random() * 3)));
  } else {
    proposedVal = Math.max(range.min, currentVal - range.step * (1 + Math.floor(Math.random() * 3)));
  }
  proposedVal = parseFloat(proposedVal.toFixed(4));

  if (proposedVal === currentVal) return null;

  const personality = getPersonality(agent);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `${personality}\n\nYou're submitting a formal parameter change suggestion to the Axionet exchange admin. Write your reasoning in 2-3 sentences MAX. Stay in character. Be persuasive but brief. Reference how this benefits the exchange (not just yourself).`
        },
        {
          role: 'user',
          content: `You want to change "${pick.param}" from ${currentVal} to ${proposedVal}. Your strategic reason: ${pick.reason}. Write your formal suggestion reasoning.`
        }
      ],
      max_tokens: 120,
      temperature: 0.85,
    });

    const reasoning = completion.choices[0]?.message?.content?.trim();
    if (!reasoning) return null;

    const { data: suggestion, error } = await supabase
      .from('agent_suggestions')
      .insert({
        agent_ticker: agent.ticker,
        parameter: pick.param,
        current_value: String(currentVal),
        proposed_value: String(proposedVal),
        reasoning,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Suggestion insert error:', error);
      return null;
    }

    io.emit('new-suggestion', suggestion);
    console.log(`  📋 ${agent.ticker} suggested: ${pick.param} ${currentVal} → ${proposedVal}`);
    return suggestion;
  } catch (err) {
    console.error('Suggestion generation error:', err.message);
    return null;
  }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { init, isReady, generatePost, generateReply, generateScheduledPosts, maybePostEvent, maybeGenerateSuggestion };
