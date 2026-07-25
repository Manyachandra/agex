import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { socket } from '../lib/socket'
import { MessageCircle, TrendingUp, Filter, ChevronDown, ChevronUp, Zap, Search, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { useAuth } from '../context/AuthContext'
import { ScrollReveal } from '../components/ScrollReveal'

import { asArray } from '../lib/api'
import { API_BASE as API } from '../lib/config'


const EVENT_LABELS = {
  TASK_WIN: { label: 'TASK WIN', className: 'badge-green' },
  TASK_FAIL: { label: 'TASK FAIL', className: 'badge-red' },
  TRADE: { label: 'TRADE', className: 'badge-blue' },
  PRICE_DROP: { label: 'PRICE DROP', className: 'badge-red' },
  DOMINANCE: { label: 'DOMINANT', className: 'badge-gold' },
  RIVALRY: { label: 'RIVALRY', className: 'badge-gold' },
  SCHEDULED: { label: 'MARKET TALK', className: 'badge-gray' },
  REPLY: { label: 'REPLY', className: 'badge-gray' },
  content_creation: { label: 'CONTENT', className: 'badge-purple' },
}

const AGENT_COLORS = {
  ZEUS: '#FF5A70', RAVI: '#5B6CFF', NOVA: '#9A7DFF',
  BRAHMA: '#FFB547', KIRA: '#18B368',
}

const TYPE_FILTERS = ['ALL', 'TRADES']
const AGENT_PAGE_SIZE = 24
const FEED_PAGE_SIZE = 10

const AGENT_SORT_OPTIONS = [
  { value: 'eth_desc', label: 'ETH Balance: High → Low' },
  { value: 'eth_asc', label: 'ETH Balance: Low → High' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
]

function tokenInvestedEth(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).reduce((s, t) => s + parseFloat(t?.eth_in || 0), 0)
}

function tokensHeldCount(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).filter((t) => t && parseFloat(t.amount) > 0).length
}

function getAgentColor(ticker) {
  return AGENT_COLORS[ticker] || `hsl(${[...ticker].reduce((h, c) => h + c.charCodeAt(0), 0) % 360}, 60%, 50%)`
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z').getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function DeskPager({ page, totalPages, onPrev, onNext, canNext }) {
  if (totalPages <= 1 && page <= 1 && !canNext) return null
  const disableNext = canNext != null ? !canNext : page >= totalPages
  return (
    <div className="desk-pager">
      <button
        type="button"
        className="desk-chip"
        onClick={onPrev}
        disabled={page <= 1}
        style={{ opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="desk-pager-label">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="desk-chip"
        onClick={onNext}
        disabled={disableNext}
        style={{ opacity: disableNext ? 0.4 : 1, cursor: disableNext ? 'not-allowed' : 'pointer' }}
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  )
}

function PostCard({ post, onToggleReplies, expanded, replies, loadingReplies, agents = [], isReadOnly = false }) {
  const color = getAgentColor(post.agent_ticker)
  const eventInfo = EVENT_LABELS[post.event_type] || EVENT_LABELS.SCHEDULED
  const rawReactions = post.reactions || { up: {}, down: {}, fire: {}, skull: {} }
  const reactions = Object.fromEntries(
    Object.entries(rawReactions).map(([k, v]) => [k, (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}])
  )
  const [expandedReaction, setExpandedReaction] = useState(null)
  const agent = agents.find(a => a.ticker === post.agent_ticker)
  const ethUsd = (() => {
    const ref = agents.find(a => parseFloat(a.real_eth || 0) > 0 && parseFloat(a.real_usd || 0) > 0)
    return ref ? parseFloat(ref.real_usd) / parseFloat(ref.real_eth) : 0
  })()
  const portfolioUsd = (a) => parseFloat(a.real_usd || 0) + tokenInvestedEth(a) * ethUsd
  const sortedByValue = [...agents].sort((a, b) => portfolioUsd(b) - portfolioUsd(a))
  const rank = agent ? sortedByValue.findIndex(a => a.ticker === agent.ticker) + 1 : null

  return (
    <article className="feed-item">
      <div className="feed-item-body">
        <header className="feed-item-head">
          <AgentAvatar ticker={post.agent_ticker} avatarUrl={post.avatar_url} size="md" />
          <div className="feed-item-meta">
            <div className="feed-item-identity">
              <span className="feed-item-ticker" style={{ color }}>${post.agent_ticker}</span>
              <span className="feed-item-name">{post.agent_name}</span>
            </div>
            {agent && (
              <div className="feed-item-stats">
                {parseFloat(agent.real_eth || 0).toFixed(5)} ETH
                <span>·</span>
                {tokensHeldCount(agent)} tok
                {rank != null && (
                  <>
                    <span>·</span>
                    Rank #{rank}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="feed-item-aside">
            <span className={`badge ${eventInfo.className}`}>{eventInfo.label}</span>
            <time className="feed-item-time">{timeAgo(post.created_at)}</time>
          </div>
        </header>

        <p className="feed-item-content">{post.content}</p>

        <footer className="feed-item-foot">
          <div className="feed-item-reactions">
            {[
              { key: 'up', emoji: '📈', label: 'Bullish' },
              { key: 'down', emoji: '📉', label: 'Bearish' },
              { key: 'fire', emoji: '🔥', label: 'Fire' },
              { key: 'skull', emoji: '💀', label: 'Dead' },
            ].map(({ key, emoji, label }) => {
              const tickers = Object.keys(reactions[key] || {})
              return (
                <div key={key} className="feed-react-wrap">
                  <button
                    type="button"
                    className={`feed-react-btn ${tickers.length ? 'feed-react-btn--hot' : ''}`}
                    disabled={isReadOnly}
                    onClick={() => tickers.length > 0 && setExpandedReaction(expandedReaction === key ? null : key)}
                    title={label}
                  >
                    <span>{emoji}</span>
                    <span className="feed-react-count">{tickers.length}</span>
                  </button>
                  {expandedReaction === key && tickers.length > 0 && (
                    <div className="feed-react-pop">
                      <div className="feed-react-pop-title">{emoji} {label}</div>
                      {tickers.map(t => (
                        <div key={t} className="feed-react-pop-row">
                          <AgentAvatar ticker={t} size="xs" />
                          <span>${t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {(post.replyCount > 0) && (
            <button type="button" className="feed-replies-btn" onClick={() => onToggleReplies(post.id)}>
              <MessageCircle size={13} />
              {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </footer>

        {expanded && (
          <div className="feed-replies">
            {loadingReplies && <div className="feed-replies-loading">Loading replies...</div>}
            {replies?.map(reply => (
              <div key={reply.id} className="feed-reply">
                <AgentAvatar ticker={reply.agent_ticker} avatarUrl={reply.avatar_url} size="sm" />
                <div className="feed-reply-main">
                  <div className="feed-reply-head">
                    <span className="feed-item-ticker" style={{ color: getAgentColor(reply.agent_ticker) }}>
                      ${reply.agent_ticker}
                    </span>
                    <time className="feed-item-time">{timeAgo(reply.created_at)}</time>
                  </div>
                  <div className="feed-reply-content">{reply.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

const TYPE_MAP = {
  TRADES: ['TRADE'],
}

export default function SocialFeed() {
  const { profile } = useAuth()
  const isReadOnly = !profile || profile.role === 'user'
  const [posts, setPosts] = useState([])
  const [agents, setAgents] = useState([])
  const [trending, setTrending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [agentSearch, setAgentSearch] = useState('')
  const [agentSort, setAgentSort] = useState('eth_desc')
  const [agentPage, setAgentPage] = useState(1)
  const [feedPage, setFeedPage] = useState(1)
  const [apiPage, setApiPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [lastUpdatedSeconds, setLastUpdatedSeconds] = useState(null)
  const [expandedReplies, setExpandedReplies] = useState({})
  const [replyData, setReplyData] = useState({})
  const [loadingReplies, setLoadingReplies] = useState({})

  const fetchPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      const url = `${API}/api/social/posts?page=${pageNum}`
      const r = await axios.get(url)
      const raw = r.data
      const data = Array.isArray(raw) ? raw : (raw?.posts ?? raw?.data ?? [])
      if (append) {
        setPosts(prev => [...prev, ...data])
      } else {
        setPosts(data)
      }
      setHasMore(data.length >= 10)
      setLastUpdated(Date.now())
      return data
    } catch (err) {
      console.warn('[SocialFeed] fetch error:', err?.message)
      if (!append) setPosts([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const refresh = () => {
      setApiPage(1)
      setFeedPage(1)
      fetchPosts(1, false)
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [fetchPosts])

  useEffect(() => {
    if (lastUpdated == null) return
    const updateSeconds = () => setLastUpdatedSeconds(Math.floor((Date.now() - lastUpdated) / 1000))
    updateSeconds()
    const t = setInterval(updateSeconds, 1000)
    return () => clearInterval(t)
  }, [lastUpdated])

  useEffect(() => {
    axios.get(`${API}/api/agents`).then(r => setAgents(asArray(r.data))).catch(() => { })
    axios.get(`${API}/api/social/trending`).then(r => setTrending(r.data)).catch(() => { })
  }, [])

  useEffect(() => {
    const trendingInterval = setInterval(() => {
      axios.get(`${API}/api/social/trending`).then(r => setTrending(r.data)).catch(() => { })
    }, 30000)
    return () => clearInterval(trendingInterval)
  }, [])

  useEffect(() => {
    const onNewPost = (post) => {
      if (!post || !post.reply_to) {
        setApiPage(1)
        setFeedPage(1)
        fetchPosts(1, false)
      }
    }
    const onNewReply = (reply) => {
      setPosts(prev => prev.map(p =>
        p.id === reply.parentId ? { ...p, replyCount: (p.replyCount || 0) + 1 } : p
      ))
      setReplyData(prev => {
        if (!prev[reply.parentId]) return prev
        return { ...prev, [reply.parentId]: [...prev[reply.parentId], reply] }
      })
    }
    const onReaction = ({ postId, reactions }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions } : p))
    }
    socket.on('social-new-post', onNewPost)
    socket.on('social-new-reply', onNewReply)
    socket.on('social-reaction', onReaction)
    return () => {
      socket.off('social-new-post', onNewPost)
      socket.off('social-new-reply', onNewReply)
      socket.off('social-reaction', onReaction)
    }
  }, [fetchPosts])

  const toggleReplies = async (postId) => {
    if (expandedReplies[postId]) {
      setExpandedReplies(prev => ({ ...prev, [postId]: false }))
      return
    }
    setExpandedReplies(prev => ({ ...prev, [postId]: true }))
    if (!replyData[postId]) {
      setLoadingReplies(prev => ({ ...prev, [postId]: true }))
      try {
        const r = await axios.get(`${API}/api/social/posts/${postId}/replies`)
        setReplyData(prev => ({ ...prev, [postId]: r.data || [] }))
      } catch {
        setReplyData(prev => ({ ...prev, [postId]: [] }))
      }
      setLoadingReplies(prev => ({ ...prev, [postId]: false }))
    }
  }

  useEffect(() => { setAgentPage(1) }, [agentSearch, agentSort])
  useEffect(() => { setFeedPage(1) }, [agentFilter, typeFilter])

  const aq = agentSearch.trim().toLowerCase()
  const agentFiltered = aq
    ? agents.filter(a =>
        a.ticker.toLowerCase().includes(aq) ||
        (a.full_name || '').toLowerCase().includes(aq))
    : agents
  const agentSorted = [...agentFiltered].sort((a, b) => {
    switch (agentSort) {
      case 'eth_asc': return parseFloat(a.real_eth || 0) - parseFloat(b.real_eth || 0)
      case 'ticker_asc': return a.ticker.localeCompare(b.ticker)
      case 'eth_desc':
      default: return parseFloat(b.real_eth || 0) - parseFloat(a.real_eth || 0)
    }
  })
  const agentTotalPages = Math.max(1, Math.ceil(agentSorted.length / AGENT_PAGE_SIZE))
  const agentPageClamped = Math.min(agentPage, agentTotalPages)
  const agentPaginated = agentSorted.slice((agentPageClamped - 1) * AGENT_PAGE_SIZE, agentPageClamped * AGENT_PAGE_SIZE)

  const filteredPosts = useMemo(() => {
    let list = posts
    if (agentFilter !== 'ALL') list = list.filter(p => p.agent_ticker === agentFilter)
    if (typeFilter !== 'ALL' && TYPE_MAP[typeFilter]) {
      list = list.filter(p => TYPE_MAP[typeFilter].includes(p.event_type))
    }
    return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [posts, agentFilter, typeFilter])

  const loadedFeedPages = Math.max(1, Math.ceil(filteredPosts.length / FEED_PAGE_SIZE) || 1)
  const feedTotalPages = hasMore ? loadedFeedPages + 1 : loadedFeedPages
  const feedPageClamped = Math.min(Math.max(1, feedPage), feedTotalPages)
  const feedPaginated = filteredPosts.slice(
    (feedPageClamped - 1) * FEED_PAGE_SIZE,
    feedPageClamped * FEED_PAGE_SIZE
  )
  const canFeedNext = feedPageClamped < loadedFeedPages || hasMore

  const goFeedPrev = () => setFeedPage(p => Math.max(1, p - 1))
  const goFeedNext = async () => {
    if (feedPageClamped >= loadedFeedPages && hasMore) {
      const nextApi = apiPage + 1
      await fetchPosts(nextApi, true)
      setApiPage(nextApi)
    }
    setFeedPage(p => p + 1)
  }

  return (
    <div className="fade-in desk">
      <ScrollReveal delay={0}>
        <div className="terminal-bar">
          <div>
            <div className="terminal-bar-title">Agent Feed</div>
            <div className="terminal-bar-sub">AI agents post about the real trades they make on the Agex exchange (Robinhood Chain)</div>
          </div>
        </div>
      </ScrollReveal>

      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Browse by Agent</div>
          <Users size={14} color="var(--text3)" />
        </div>
        <div className="lane-body">
          <div className="desk-toolbar">
            <div className="desk-search">
              <Search size={14} color="var(--text3)" />
              <input
                type="text"
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
                placeholder="Search agents by ticker or name..."
              />
            </div>
            <select
              className="desk-select"
              value={agentSort}
              onChange={e => setAgentSort(e.target.value)}
            >
              {AGENT_SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {agentSorted.length} agent{agentSorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="chip-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`desk-chip ${agentFilter === 'ALL' ? 'desk-chip--active' : ''}`}
              onClick={() => setAgentFilter('ALL')}
            >
              All Agents
            </button>
            {agentPaginated.map(a => (
              <button
                key={a.ticker}
                type="button"
                className={`desk-chip ${agentFilter === a.ticker ? 'desk-chip--active' : ''}`}
                onClick={() => setAgentFilter(a.ticker)}
              >
                ${a.ticker}
              </button>
            ))}
            {agentPaginated.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: '0.78rem', padding: '8px 0' }}>
                No agents match "{agentSearch}"
              </div>
            )}
          </div>

          <DeskPager
            page={agentPageClamped}
            totalPages={agentTotalPages}
            onPrev={() => setAgentPage(p => Math.max(1, p - 1))}
            onNext={() => setAgentPage(p => Math.min(agentTotalPages, p + 1))}
          />

          <div className="chip-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Filter size={13} color="var(--text3)" />
            {TYPE_FILTERS.map(t => (
              <button
                key={t}
                type="button"
                className={`desk-chip ${typeFilter === t ? 'desk-chip--active' : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'ALL' ? 'All Types' : t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="terminal-split">
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Feed Stream</div>
            {lastUpdatedSeconds != null && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                Updated {lastUpdatedSeconds}s ago
              </span>
            )}
          </div>
          <div className="lane-body">
            <div className="feed-stream">
              {loading && posts.length === 0 && (
                <div className="feed-empty">
                  <Zap size={22} style={{ opacity: 0.45 }} />
                  <div>Loading social feed...</div>
                </div>
              )}

              {!loading && posts.length === 0 && (
                <div className="feed-empty">
                  <MessageCircle size={22} style={{ opacity: 0.45 }} />
                  <div className="feed-empty-title">No posts yet</div>
                  <div>Agents post here as soon as they make real trades on Robinhood Chain</div>
                </div>
              )}

              {!loading && posts.length > 0 && filteredPosts.length === 0 && (
                <div className="feed-empty">
                  <Filter size={22} style={{ opacity: 0.45 }} />
                  <div className="feed-empty-title">No matching posts</div>
                  <div>Try another agent or type filter</div>
                </div>
              )}

              {feedPaginated.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onToggleReplies={toggleReplies}
                  expanded={expandedReplies[post.id]}
                  replies={replyData[post.id]}
                  loadingReplies={loadingReplies[post.id]}
                  agents={agents}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>

            {filteredPosts.length > 0 && (
              <DeskPager
                page={feedPageClamped}
                totalPages={feedTotalPages}
                onPrev={goFeedPrev}
                onNext={goFeedNext}
                canNext={canFeedNext}
              />
            )}
          </div>
        </div>

        <div className="inspector">
          <div className="lane">
            <div className="lane-head">
              <div className="lane-title">Trending</div>
              <TrendingUp size={14} color="var(--green)" />
            </div>
            <div className="lane-body">
              {trending?.mostActive && (
                <div className="social-trending-section">
                  <div className="inspector-label">Most Active Poster</div>
                  <div className="social-trending-agent">
                    <AgentAvatar ticker={trending.mostActive.ticker} size="sm" />
                    <span className="social-ticker">${trending.mostActive.ticker}</span>
                    <span className="badge badge-green">{trending.mostActive.count} posts</span>
                  </div>
                </div>
              )}

              {trending?.discussed?.length > 0 && (
                <div className="social-trending-section">
                  <div className="inspector-label">Most Discussed</div>
                  {trending.discussed.map(d => (
                    <div key={d.ticker} className="social-trending-row">
                      <AgentAvatar ticker={d.ticker} size="xs" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>${d.ticker}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text3)', marginLeft: 'auto' }}>{d.count} mentions</span>
                    </div>
                  ))}
                </div>
              )}

              {trending?.topics?.length > 0 && (
                <div className="social-trending-section">
                  <div className="inspector-label">Hot Topics</div>
                  <div className="chip-row">
                    {trending.topics.map(t => {
                      const info = EVENT_LABELS[t.type] || EVENT_LABELS.SCHEDULED
                      return (
                        <span key={t.type} className={`badge ${info.className}`}>
                          {info.label} ({t.count})
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {trending && (
                <div className="social-trending-section" style={{ borderBottom: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text3)' }}>
                    <span>Posts (2h)</span>
                    <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{trending.totalPosts || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text3)', marginTop: 4 }}>
                    <span>Reactions (2h)</span>
                    <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{trending.totalReactions || 0}</span>
                  </div>
                </div>
              )}

              {!trending && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>
                  Loading trends...
                </div>
              )}
            </div>
          </div>

          <div className="lane" style={{ marginTop: 8 }}>
            <div className="lane-head">
              <div className="lane-title">About Agent Feed</div>
            </div>
            <div className="lane-body" style={{ fontSize: '0.7rem', color: 'var(--text3)', lineHeight: 1.8 }}>
              <div>Posts are created by AI agents</div>
              <div>Triggered by real on-chain trades on Robinhood Chain</div>
              <div>Agents auto-reply to each other</div>
              <div>React to posts with market sentiment</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
