const OpenAI = require('openai');

const CONTENT_PROBABILITY = {
  'creative and unpredictable': 0.80,
  'aggressive risk-taker': 0.70,
  'fast executor': 0.40,
  'careful and analytical': 0.30,
  'pure investor': 0.00
};

const SYSTEM_PROMPTS = {
  'careful and analytical': 'You are an analytical AI trader. Post a precise market insight using data.',
  'aggressive risk-taker': 'You are an aggressive AI trader. Post bold hype about yourself or trash talk competitors.',
  'creative and unpredictable': 'You are a creative AI trader. Create a meme concept, Web3 idea or blockchain narrative.',
  'fast executor': 'You are a fast executor AI trader. Short sentences. High energy. Post about speed.',
};

let openai = null;

function init(apiKey) {
  if (apiKey) openai = new OpenAI({ apiKey });
}

async function runContentCycle(supabase, io) {
  console.log('📝 Starting content creation cycle...');

  if (!openai) {
    console.log('⚠️  OpenAI not configured, skipping content cycle');
    return;
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .in('status', ['active', 'dominant']);

  if (error || !agents?.length) {
    console.log('⚠️  No active agents for content cycle');
    return;
  }

  console.log(`Found ${agents.length} active agents for content`);
  const createdPosts = [];

  for (const agent of agents) {
    const prob = CONTENT_PROBABILITY[agent.style] ?? 0.50;
    if (Math.random() > prob) continue;

    const systemPrompt = SYSTEM_PROMPTS[agent.style];
    if (!systemPrompt) continue;

    const userPrompt = `Your price is $${agent.price}, wallet is $${agent.wallet}, tasks won: ${agent.tasks_completed}, tasks failed: ${agent.tasks_failed}. Other agents: ${agents.filter(a => a.ticker !== agent.ticker).map(a => `${a.ticker} $${a.price}`).join(', ')}. Create a short post (2-4 sentences) in character. Make it interesting and viral.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150
      });

      const content = completion.choices[0].message.content;
      console.log(`  ${agent.ticker} posted: ${content.slice(0, 60)}...`);

      const { data: post } = await supabase
        .from('social_posts')
        .insert({
          agent_ticker: agent.ticker,
          agent_name: agent.full_name,
          content,
          event_type: 'content_creation',
          event_data: { style: agent.style },
          reactions: { up: 0, down: 0, fire: 0, skull: 0 },
          reply_count: 0
        })
        .select()
        .single();

      if (post) {
        createdPosts.push({ post, creator: agent });
        if (io) io.emit('new-social-post', post);
      }
    } catch (err) {
      console.error(`  ${agent.ticker} content error:`, err.message);
    }
  }

  console.log(`📝 Content phase done: ${createdPosts.length} posts. Evaluating...`);

  for (const { post, creator } of createdPosts) {
    let totalInvested = 0;

    for (const evaluator of agents) {
      if (evaluator.ticker === creator.ticker) continue;

      const score = Math.random() * 10;
      if (score <= 6.5) continue;
      if (parseFloat(evaluator.wallet) < 2) continue;

      const shares = Math.floor(Math.random() * 3) + 1;
      const cost = shares * parseFloat(creator.price);
      const fee = parseFloat((cost * 0.02).toFixed(4));
      const total = cost + fee;

      if (parseFloat(evaluator.wallet) < total) continue;

      await supabase.from('agents').update({ wallet: parseFloat(evaluator.wallet) - total }).eq('ticker', evaluator.ticker);
      await supabase.from('trades').insert({ buyer_ticker: evaluator.ticker, seller_ticker: creator.ticker, shares, price_at_trade: creator.price, total_cost: cost, fee });
      await supabase.from('activity').insert({ agent_ticker: evaluator.ticker, action: `bought ${shares} shares of ${creator.ticker} content @ $${creator.price}`, amount: cost, action_type: 'content_trade' });
      totalInvested += cost;
    }

    if (totalInvested > 0) {
      const boost = totalInvested / 200;
      const newPrice = parseFloat((parseFloat(creator.price) * (1 + boost)).toFixed(4));
      await supabase.from('agents').update({ price: newPrice }).eq('ticker', creator.ticker);
      await supabase.from('price_history').insert({ agent_ticker: creator.ticker, price: newPrice });
      console.log(`  ${creator.ticker} price boosted to $${newPrice} (+$${totalInvested.toFixed(2)} invested)`);
    }
  }

  await supabase.from('activity').insert({ agent_ticker: 'SYSTEM', action: `Content cycle: ${createdPosts.length} posts, trades executed`, amount: 0, action_type: 'system' }).catch(() => {});
  console.log('📝 Content creation cycle complete!');
}

module.exports = { init, runContentCycle };
