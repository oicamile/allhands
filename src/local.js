// Camada de dados. Hoje: localStorage + BroadcastChannel (funciona entre abas do mesmo navegador).
// Para votar de celulares diferentes, troque load/save/subscribe por um banco compartilhado
// (ex.: Supabase Realtime) mantendo a mesma API.
import { useEffect, useState } from 'react'

const KEY = 'allhands.v1'
const TTL = 12 * 3600 * 1000
const uid = () => Math.random().toString(36).slice(2, 10)

export const DEFAULT_JOKES = [
  { id: 'pesar', name: 'Nota de pesar', emoji: '🕯️', meaning: '' },
  { id: 'repudio', name: 'Nota de repúdio', emoji: '🚫', meaning: '' },
  { id: 'do', name: 'Nota dó', emoji: '🥺', meaning: '' },
  { id: 'ressarcimento', name: 'Nota de ressarcimento', emoji: '💸', meaning: '' },
]

const seed = () => ({
  team: [{ email: 'camile@oicamile.cc', role: 'admin' }],
  jokes: DEFAULT_JOKES,
  sessions: {},
  me: null,
})

let state = seed()
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('allhands') : null
const subs = new Set()

function purge(s) {
  const now = Date.now()
  for (const [code, x] of Object.entries(s.sessions)) {
    const base = x.endedAt || x.lastActivity || x.createdAt
    if (now - base > TTL) delete s.sessions[code]
  }
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) state = { ...seed(), ...JSON.parse(r) } } catch {}
  purge(state)
}
load()
const emit = () => subs.forEach((f) => f(state))
export function commit(mut) {
  load()
  mut(state)
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  bc?.postMessage('x')
  emit()
}
bc && (bc.onmessage = () => { load(); emit() })
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); emit() } })
setInterval(() => { load(); emit() }, 3000)

export function useStore() {
  const [, set] = useState(0)
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  return state
}

export const voterId = () => {
  let v = localStorage.getItem('allhands.voter')
  if (!v) { v = uid() + uid(); localStorage.setItem('allhands.voter', v) }
  return v
}

// ---- ações ----
export const mode = 'local'
export const login = async (email) => {
  const e = email.trim().toLowerCase()
  const m = state.team.find((t) => t.email === e)
  if (!m) return { ok: false, msg: 'Esse e-mail não está na equipe.' }
  commit((s) => { s.me = m.email })
  return { ok: true }
}
export const watchAdmin = () => {}
export const watchVoter = () => {}
export const isLoading = () => false
export const addMember = (email, role) => commit((s) => { if (!s.team.some((t) => t.email === email)) s.team.push({ email, role }) })
export const setRole = (email, role) => commit((s) => { s.team.find((t) => t.email === email).role = role })
export const removeMember = (email) => commit((s) => { s.team = s.team.filter((t) => t.email !== email) })
export const logout = () => commit((s) => { s.me = null })
export const roleOf = (s) => s.team.find((t) => t.email === s.me)?.role

export function createSession(date) {
  const code = Math.random().toString(36).slice(2, 6).toUpperCase()
  commit((s) => {
    s.sessions[code] = {
      code, date, status: 'draft', weight: 0.5, createdAt: Date.now(), lastActivity: Date.now(),
      current: 0, stories: [], votes: [],
      jokes: s.jokes.map((j) => ({ ...j, active: true })),
    }
  })
  return code
}
const upd = (code, f) => commit((s) => { const x = s.sessions[code]; if (x) { f(x, s); x.lastActivity = Date.now() } })
export const patchSession = (code, p) => upd(code, (x) => Object.assign(x, p))
export const addStory = (code) => upd(code, (x) => x.stories.push({ id: uid(), name: '', area: '', text: '', status: 'waiting' }))
export const patchStory = (code, id, p) => upd(code, (x) => Object.assign(x.stories.find((t) => t.id === id), p))
export const removeStory = (code, id) => upd(code, (x) => { x.stories = x.stories.filter((t) => t.id !== id) })
export const moveStory = (code, i, d) => upd(code, (x) => { const j = i + d; if (j < 0 || j >= x.stories.length) return; [x.stories[i], x.stories[j]] = [x.stories[j], x.stories[i]] })
export const patchJoke = (code, id, p) => upd(code, (x) => Object.assign(x.jokes.find((j) => j.id === id), p))
export const addJoke = (code) => commit((s) => {
  const j = { id: uid(), name: 'Nota nova', emoji: '⭐', meaning: '' }
  s.jokes.push(j)
  const x = s.sessions[code]; if (x) x.jokes.push({ ...j, active: true })
})
export const deleteSession = (code) => commit((s) => { delete s.sessions[code] })

// Votação da sessão inteira: o admin só abre e fecha.
export const openVoting = (code) => upd(code, (x) => { x.status = 'live'; delete x.endedAt })
export const closeVoting = (code) => upd(code, (x) => { x.status = 'ended'; x.endedAt = Date.now() })

export function castVote(code, storyId, voter, grade, isAuthor) {
  upd(code, (x) => {
    if (x.status !== 'live' || !x.stories.some((t) => t.id === storyId)) return
    const v = x.votes.find((t) => t.storyId === storyId && t.voter === voter)
    if (v) Object.assign(v, { grade, isAuthor, ts: Date.now() })
    else x.votes.push({ id: uid(), storyId, voter, grade, isAuthor, ts: Date.now() })
  })
}

// ---- cálculo ----
const EMPTY = { total: 0, nums: [0, 0, 0, 0, 0], jokes: {}, avg: null, counted: 0 }
export function tally(x, storyId) {
  if (x.tallies) return x.tallies[storyId] || EMPTY // modo remoto: a apuração vem pronta do servidor
  const votes = x.votes.filter((v) => v.storyId === storyId)
  const jokes = {}
  const nums = [0, 0, 0, 0, 0]
  let sum = 0, w = 0
  for (const v of votes) {
    if (/^[1-5]$/.test(v.grade)) {
      const g = Number(v.grade), wt = v.isAuthor ? x.weight : 1
      nums[g - 1]++; sum += g * wt; w += wt
    } else jokes[v.grade] = (jokes[v.grade] || 0) + 1
  }
  return { total: votes.length, nums, jokes, avg: w ? sum / w : null, counted: nums.reduce((a, b) => a + b, 0) }
}
export function ranking(x) {
  const rows = x.stories.map((st) => ({ st, ...tally(x, st.id) }))
  const ranked = [...rows].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  const awards = x.jokes.filter((j) => j.active).map((j) => {
    const top = [...rows].sort((a, b) => (b.jokes[j.id] || 0) - (a.jokes[j.id] || 0))[0]
    return top && (top.jokes[j.id] || 0) > 0 ? { joke: j, st: top.st, n: top.jokes[j.id] } : null
  }).filter(Boolean)
  return { ranked, awards, rows }
}
export function exportCsv(x) {
  const { ranked } = ranking(x)
  const act = x.jokes.filter((j) => j.active)
  const head = ['posicao', 'pessoa', 'area', 'media', 'total_votos', '1', '2', '3', '4', '5', ...act.map((j) => j.name)]
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = ranked.map((r, i) => [i + 1, r.st.name, r.st.area, r.avg == null ? '' : r.avg.toFixed(2), r.total, ...r.nums, ...act.map((j) => r.jokes[j.id] || 0)].map(q).join(','))
  return [head.map(q).join(','), ...lines].join('\n')
}
export const expiresAt = (x) => (x.endedAt || x.lastActivity || x.createdAt) + TTL
