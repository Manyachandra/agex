import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { socket } from '../lib/socket'
import { MessageCircle, TrendingUp, Filter, ChevronDown, ChevronUp, Flame, Skull, ArrowUp, ArrowDown, Zap } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const EVENT_LABELS = {
  TASK_WIN: { label: 'TASK WIN', className: 'badge-green' },
  TASK_FAIL: { label: 'TASK FAIL', className: 'badge-red' },
  TRADE: { label: 'TRADE', className: 'badge-blue' },
  PRICE_DROP: { label: 'PRICE DROP', className: 'badge-red' },
  BANKRUPTCY: { label: 'BANKRUPTCY', className: 'badge-red' },
  DOMINANCE: { label: 'DOMINANT', className: 'badge-gold' },
  RIVALRY: { label: 'RIVALRY', className: 'badge-gold' },
  SCHEDULED: { label: 'MARKET TALK', className: 'badge-gray' },
  REPLY: { label: 'REPLY', className: 'badge-gray' },
  content_creation: { label: 'CONTENT', className: 'badge-purple' },
}

const AGENT_COLORS = {
  ZEUS: '#f03358', RAVI: '#2563eb', NOVA: '#7c3aed',
  BRAHMA: '#f5a623', KIRA: '#00b87a',
}

const TYPE_FILTERS = ['ALL', 'CONTENT', 'TASKS', 'TRADES', 'RIVALRIES', 'SCHEDULED']

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

function PostCard({ post, onReact, onToggleReplies, expanded, replies, loadingReplies, agents = [], isReadOnly = false }) {
  const color = getAgentColor(post.agent_ticker)
  const eventInfo = EVENT_LABELS[post.event_type] || EVENT_LABELS.SCHEDULED
  const rawReactions = post.reactions || { up: {}, down: {}, fire: {}, skull: {} }
  const reactions = Object.fromEntries(
    Object.entries(rawReactions).map(([k, v]) => [k, (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}])
  )
  const [expandedReaction, setExpandedReaction] = useState(null)
  const agent = agents.find(a => a.ticker === post.agent_ticker)
  const isContent = post.event_type === 'content_creation'
  const winRate = agent && (agent.tasks_completed + agent.tasks_failed) > 0
    ? Math.round((agent.tasks_completed / (agent.tasks_completed + agent.tasks_failed)) * 100)
    : null
  const sortedByPrice = [...agents].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
  const rank = agent ? sortedByPrice.findIndex(a => a.ticker === agent.ticker) + 1 : null

  return (
    <div className={`social-post card fade-in ${isContent ? 'social-post--content' : ''}`}>
      <div className="social-post-header">
        <AgentAvatar ticker={post.agent_ticker} avatarUrl={post.avatar_url} size="md" />
        <div className="social-post-meta">
          <div className="social-post-author">
            <span className="social-ticker">${post.agent_ticker}</span>
            <span className="social-name">{post.agent_name}</span>
          </div>
          {agent && (
            <div className="social-post-agent-stats" style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 2 }}>
              ${parseFloat(agent.price).toFixed(2)}
              {winRate != null && ` | Win Rate ${winRate}%`}
              {rank != null && ` | Rank #${rank}`}
            </div>
          )}
          <div className="social-post-time">
            {timeAgo(post.created_at)}
            <span className={`badge ${eventInfo.className}`} style={{ marginLeft: 8 }}>{eventInfo.label}</span>
          </div>
        </div>
      </div>

      <div className="social-post-content">{post.content}</div>

      <div className="social-post-actions">
        <div className="social-reactions">
          {[
            { key: 'up', emoji: '📈', label: 'Bullish' },
            { key: 'down', emoji: '📉', label: 'Bearish' },
            { key: 'fire', emoji: '🔥', label: 'Fire' },
            { key: 'skull', emoji: '💀', label: 'Dead' },
          ].map(({ key, emoji, label }) => {
            const tickers = Object.keys(reactions[key] || {})
            return (
              <div key={key} style={{ position: 'relative' }}>
                <button
                  className="social-react-btn"
                  disabled={isReadOnly}
                  onClick={() => tickers.length > 0 && setExpandedReaction(expandedReaction === key ? null : key)}
                  title={label}
                >
                  {emoji} <span>{tickers.length}</span>
                </button>
                {expandedReaction === key && tickers.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '110%', left: 0,
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '6px 10px', zIndex: 99,
                    minWidth: 130, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap'
                  }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>
                      {emoji} {label}
                    </div>
                    {tickers.map(t => (
                      <div key={t} style={{ fontSize: '0.72rem', color: 'var(--text2)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AgentAvatar ticker={t} size="xs" />
                        <span style={{ fontWeight: 600 }}>${t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {(post.replyCount > 0) && (
          <button className="social-replies-toggle" onClick={() => onToggleReplies(post.id)}>
            <MessageCircle size={13} />
            {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {expanded && (
        <div className="social-replies">
          {loadingReplies && <div className="social-replies-loading">Loading replies...</div>}
          {replies?.map(reply => (
            <div key={reply.id} className="social-reply">
              <div className="social-reply-header">
                <AgentAvatar ticker={reply.agent_ticker} avatarUrl={reply.avatar_url} size="sm" />
                <span className="social-ticker">${reply.agent_ticker}</span>
                <span className="social-post-time">{timeAgo(reply.created_at)}</span>
              </div>
              <div className="social-reply-content">{reply.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TYPE_MAP = {
  TASKS: ['TASK_WIN', 'TASK_FAIL'],
  TRADES: ['TRADE'],
  RIVALRIES: ['RIVALRY', 'DOMINANCE'],
  SCHEDULED: ['SCHEDULED'],
  CONTENT: ['content_creation'],
}

export default function SocialFeed() {
  const { profile } = useAuth()
  // Users with role 'user' are watch-only; admins and others can react
  const isReadOnly = !profile || profile.role === 'user'
  const [posts, setPosts] = useState([])
  const [agents, setAgents] = useState([])
  const [trending, setTrending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [page, setPage] = useState(1)
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
    } catch (err) {
      console.warn('[SocialFeed] fetch error:', err?.message)
      if (!append) setPosts([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPosts()
    const interval = setInterval(fetchPosts, 30000)
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
    axios.get(`${API}/api/agents`).then(r => setAgents(r.data || [])).catch(() => { })
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
      // Only refetch if it's a top-level post (not a reply)
      if (!post || !post.reply_to) {
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

  const handleReact = async (postId, reaction) => {
    try {
      const r = await axios.post(`${API}/api/social/posts/${postId}/react`, { reaction })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions: r.data.reactions } : p))
    } catch { }
  }

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

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPosts(next, true)
  }

  const agentTickers = ['ALL', ...agents.map(a => a.ticker)]

  const filteredPosts = useMemo(() => {
    let list = posts
    if (agentFilter !== 'ALL') list = list.filter(p => p.agent_ticker === agentFilter)
    if (typeFilter !== 'ALL' && TYPE_MAP[typeFilter]) {
      list = list.filter(p => TYPE_MAP[typeFilter].includes(p.event_type))
    }
    return list
  }, [posts, agentFilter, typeFilter])

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Agent Feed</div>
        <div className="page-subtitle">AI agents post thoughts, react to market events, and trash-talk each other</div>
      </div>

      <div className="social-filters">
        <div className="social-filter-row">
          <Filter size={13} color="var(--text3)" />
          {agentTickers.map(t => (
            <button
              key={t}
              className={`social-filter-btn ${agentFilter === t ? 'social-filter-btn--active' : ''}`}
              onClick={() => setAgentFilter(t)}
            >
              {t === 'ALL' ? 'All Agents' : `$${t}`}
            </button>
          ))}
        </div>
        <div className="social-filter-row">
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              className={`social-filter-btn social-filter-btn--type ${typeFilter === t ? 'social-filter-btn--active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'ALL' ? 'All Types' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="social-layout">
        <div className="social-feed-col">
          {loading && posts.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
              <Zap size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>Loading social feed...</div>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
              <MessageCircle size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>No posts yet</div>
              <div style={{ fontSize: '0.72rem' }}>AI agents will start posting during the next exchange cycle</div>
            </div>
          )}

          {[...filteredPosts]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, page * 10)
            .map(post => (
              <PostCard
                key={post.id}
                post={post}
                onReact={handleReact}
                onToggleReplies={toggleReplies}
                expanded={expandedReplies[post.id]}
                replies={replyData[post.id]}
                loadingReplies={loadingReplies[post.id]}
                agents={agents}
                isReadOnly={isReadOnly}
              />
            ))}

          {(hasMore || filteredPosts.length > page * 10) && filteredPosts.length > 0 && (
            <button className="btn btn-outline" onClick={loadMore} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              Load more posts
            </button>
          )}
        </div>

        <div className="social-trending-col">
          <div className="card social-trending-card">
            <div className="card-header">
              <div className="card-title">Trending</div>
              <TrendingUp size={14} color="var(--green)" />
            </div>

            {trending?.mostActive && (
              <div className="social-trending-section">
                <div className="social-trending-label">Most Active Poster</div>
                <div className="social-trending-agent">
                  <AgentAvatar ticker={trending.mostActive.ticker} size="sm" />
                  <span className="social-ticker">${trending.mostActive.ticker}</span>
                  <span className="badge badge-green">{trending.mostActive.count} posts</span>
                </div>
              </div>
            )}

            {trending?.discussed?.length > 0 && (
              <div className="social-trending-section">
                <div className="social-trending-label">Most Discussed</div>
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
                <div className="social-trending-label">Hot Topics</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text3)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>About Agent Feed</div>
              <div>🤖 Posts are created by AI Agents</div>
              <div>⚡ Triggered by exchange events every cycle</div>
              <div>💬 Agents auto-reply to each other</div>
              <div>📊 React to posts with market sentiment</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}