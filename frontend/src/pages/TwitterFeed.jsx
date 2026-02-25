import { useEffect, useState } from 'react'
import axios from 'axios'
import { Twitter, ExternalLink, CheckCircle, Clock } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function TwitterFeed() {
  const [tweets, setTweets] = useState([])

  useEffect(() => {
    axios.get(`${API}/api/tweets`)
      .then(r => setTweets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTweets([]))
  }, [])

  const typeColors = {
    daily_summary: 'var(--blue)',
    bankruptcy: 'var(--red)',
    dominant: 'var(--gold)',
    milestone: 'var(--green)',
    weekly: 'var(--purple)'
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Twitter Feed</div>
        <div className="page-subtitle">All announcements posted to @UniApe007 autonomously</div>
      </div>

      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Tweets', value: tweets.length, color: 'var(--blue)' },
          { label: 'Posted', value: tweets.filter(t => t.posted).length, color: 'var(--green)' },
          { label: 'Pending', value: tweets.filter(t => !t.posted).length, color: 'var(--gold)' },
          { label: 'Account', value: '@UniApe007', color: 'var(--text)' },
        ].map((s, i) => (
          <div key={i} className="card">
            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {tweets.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>
            <Twitter size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div>No tweets yet. The agent will post when triggered.</div>
          </div>
        )}
        {tweets.map(tweet => (
          <div key={tweet.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Twitter size={16} color="#1da1f2" />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: typeColors[tweet.trigger_type] || 'var(--text2)' }}>
                  {tweet.trigger_type?.toUpperCase().replace('_', ' ')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {tweet.posted
                  ? <span className="badge badge-green"><CheckCircle size={10} style={{ marginRight: '4px' }} />POSTED</span>
                  : <span className="badge badge-gold"><Clock size={10} style={{ marginRight: '4px' }} />PENDING</span>
                }
                <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                  {new Date(tweet.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <div style={{
              background: 'var(--bg3)',
              borderRadius: '8px',
              padding: '14px',
              fontSize: '0.82rem',
              color: 'var(--text)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              fontFamily: "'Geist Mono', monospace"
            }}>
              {tweet.tweet_text}
            </div>
            {tweet.tweet_id && (
              <div style={{ marginTop: '10px' }}>
                <a
                  href={`https://twitter.com/UniApe007/status/${tweet.tweet_id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.7rem', color: '#1da1f2', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                >
                  <ExternalLink size={12} /> View on Twitter
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}