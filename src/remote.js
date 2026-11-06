// Camada Supabase. Mantém o mesmo formato de estado do modo local, então o App não muda.
//  - Admin: lê sessões/histórias por RLS e as apurações por RPC (polling de 2,5s).
//  - Votante: só RPC (voter_state / cast_vote). Recebe um "tick" por broadcast quando o admin
//    muda algo, e refaz a leitura com atraso aleatório para não bater 100 requisições juntas.
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_JOKES } from './local.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const enabled = Boolean(URL && KEY)
export const mode = 'remote'
const sb = enabled ? createClient(URL, KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }) : null

let state = { team: [], jokes: DEFAULT_JOKES, sessions: {}, list: null, me: null }
const subs = new Set()
const loading = new Set()
const emit = () => { state = { ...state }; subs.forEach((f) => f()) }
export function useStore() {
  const [, set] = useState(0)
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  return state
}
export const isLoading = (code) => loading.has(code)

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now())
const ms = (t) => (t ? new Date(t).getTime() : null)

export const voterId = () => {
  let v = localStorage.getItem('allhands.voter')
  if (!v) { v = uid().replace(/-/g, ''); localStorage.setItem('allhands.voter', v) }
  return v
}

// ---------- gravações com debounce (campos de texto) ----------
const timers = new Map()
const dirty = new Set()
function queue(key, fn, wait = 500) {
  dirty.add(key)
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(async () => {
    timers.delete(key)
    try { await fn() } finally { if (!timers.has(key)) dirty.delete(key) }
  }, wait))
}
const mutate = (code, f) => { const x = state.sessions[code]; if (x) { f(x); emit() } }
const touch = () => ({ last_activity: new Date().toISOString() })

// ---------- broadcast ----------
const chans = {}
function tick(code) {
  let c = chans[code]
  if (!c) { c = chans[code] = sb.channel('s:' + code); c.subscribe() }
  c.send({ type: 'broadcast', event: 'tick', payload: {} })
}

// ---------- auth ----------
async function onSession(session) {
  if (!session) { state.me = null; emit(); return }
  const email = (session.user.email || '').toLowerCase()
  const { data: team } = await sb.from('team').select('*')
  if (!team?.some((t) => t.email === email)) {
    await sb.auth.signOut()
    state = { ...state, me: null, authError: 'Esse e-mail não está na equipe.' }; emit(); return
  }
  const { data: lib } = await sb.from('joke_library').select('*').order('created_at')
  state = { ...state, team, me: email, jokes: lib?.length ? lib : DEFAULT_JOKES }
  // limpa ?code= do retorno do link mágico
  if (location.search) history.replaceState(null, '', location.pathname + (location.hash.startsWith('#/admin') ? location.hash : '#/admin'))
  emit()
}
if (enabled) {
  sb.auth.getSession().then(({ data }) => onSession(data.session))
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') onSession(session) })
}
export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (!error) return { ok: true }
  return { ok: false, msg: /invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message }
}
export const logout = () => sb.auth.signOut()
export const roleOf = (s) => s.team.find((t) => t.email === s.me)?.role

// ---------- leitura (admin) ----------
const mapStory = (r) => ({ id: r.id, name: r.name, area: r.area, text: r.body, status: r.status, position: r.position })
const mapSession = (r) => ({
  code: r.code, date: r.date, status: r.status, weight: Number(r.weight), current: r.cur_index, jokes: r.jokes,
  createdAt: ms(r.created_at), endedAt: ms(r.ended_at), lastActivity: ms(r.last_activity),
  stories: [], tallies: {},
})
async function loadList() {
  const { data } = await sb.rpc('admin_overview')
  if (!data) return
  state.list = data.map((r) => ({ code: r.code, date: r.date, status: r.status, createdAt: ms(r.created_at), storyCount: r.stories, voteCount: r.votes, stories: [], votes: [] }))
  emit()
}
async function loadSession(code) {
  const [a, b, c] = await Promise.all([
    sb.from('sessions').select('*').eq('code', code).maybeSingle(),
    sb.from('stories').select('*').eq('session_code', code).order('position').order('id'),
    sb.rpc('admin_tallies', { p_code: code }),
  ])
  loading.delete(code)
  if (a.error || b.error) return
  if (!a.data) { delete state.sessions[code]; emit(); return }
  const prev = state.sessions[code]
  const x = mapSession(a.data)
  const fetched = b.data.map(mapStory)
  // não pisa em edição ainda não gravada
  x.stories = prev && dirty.size
    ? fetched.map((f) => (dirty.has('story:' + f.id) ? prev.stories.find((p) => p.id === f.id) || f : f))
        .concat(prev.stories.filter((p) => dirty.has('story:' + p.id) && !fetched.some((f) => f.id === p.id)))
    : fetched
  if (prev && (dirty.has('jokes:' + code) || dirty.has('session:' + code))) {
    if (dirty.has('jokes:' + code)) x.jokes = prev.jokes
    if (dirty.has('session:' + code)) x.weight = prev.weight
  }
  x.tallies = c.data || {}
  x.votes = []
  state.sessions[code] = x
  emit()
}
export function watchAdmin(code) {
  if (!state.me) return
  if (code && !state.sessions[code]) loading.add(code)
  const run = () => (code ? loadSession(code) : loadList())
  run()
  const t = setInterval(run, 2500)
  return () => clearInterval(t)
}

// ---------- leitura (votante) ----------
let inflight = 0
async function loadVoter(code) {
  const { data, error } = await sb.rpc('voter_state', { p_code: code, p_voter: voterId() })
  if (error) return
  loading.delete(code)
  if (!data) { delete state.sessions[code]; emit(); return }
  const prev = state.sessions[code]
  const me = voterId()
  const x = {
    code, status: data.status, weight: data.weight, jokes: data.jokes, current: 0,
    stories: (data.stories || []).map((s) => ({ id: s.id, name: s.name, area: s.area, text: s.text })),
    votes: Object.entries(data.my_votes || {}).map(([storyId, v]) => ({ storyId, voter: me, grade: v.grade, isAuthor: v.is_author })),
    tallies: {},
  }
  if (inflight > 0 && prev) x.votes = prev.votes // voto ainda em trânsito vence a leitura antiga
  state.sessions[code] = x
  emit()
}
export function watchVoter(code) {
  if (!code) return
  if (!state.sessions[code]) loading.add(code)
  loadVoter(code)
  const ch = sb.channel('s:' + code).on('broadcast', { event: 'tick' }, () => setTimeout(() => loadVoter(code), Math.random() * 1200)).subscribe()
  const t = setInterval(() => loadVoter(code), 5000)
  return () => { clearInterval(t); sb.removeChannel(ch) }
}
export async function castVote(code, storyId, voter, grade, isAuthor) {
  mutate(code, (x) => {
    const v = x.votes.find((t) => t.storyId === storyId)
    if (v) Object.assign(v, { grade, isAuthor })
    else x.votes.push({ storyId, voter, grade, isAuthor })
  })
  inflight++
  try {
    const { error } = await sb.rpc('cast_vote', { p_code: code, p_story: storyId, p_voter: voter, p_grade: grade, p_is_author: isAuthor })
    if (error) console.error(error)
  } finally { inflight-- }
  loadVoter(code)
}

// ---------- ações (admin) ----------
export async function createSession(date) {
  const jokes = state.jokes.map((j) => ({ id: j.id, name: j.name, emoji: j.emoji, meaning: j.meaning, active: true }))
  for (let i = 0; i < 6; i++) {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase()
    const { error } = await sb.from('sessions').insert({ code, date, jokes })
    if (!error) return code
    if (error.code !== '23505') throw error
  }
  throw new Error('não consegui gerar código')
}
export function patchSession(code, p) {
  mutate(code, (x) => Object.assign(x, p))
  const row = {}
  if ('weight' in p) row.weight = p.weight
  queue('session:' + code, () => sb.from('sessions').update({ ...row, ...touch() }).eq('code', code), 400)
}
export async function addStory(code) {
  const x = state.sessions[code]; if (!x) return
  const st = { id: uid(), name: '', area: '', text: '', status: 'waiting', position: Math.max(-1, ...x.stories.map((s) => s.position ?? 0)) + 1 }
  mutate(code, (y) => y.stories.push(st))
  await sb.from('stories').insert({ id: st.id, session_code: code, position: st.position })
}
const pend = {}
export function patchStory(code, id, p) {
  mutate(code, (x) => Object.assign(x.stories.find((t) => t.id === id), p))
  pend[id] = { ...(pend[id] || {}), ...p }
  queue('story:' + id, async () => {
    const q = pend[id]; delete pend[id]
    if (!q) return
    const row = {}
    for (const k of ['name', 'area', 'status']) if (k in q) row[k] = q[k]
    if ('text' in q) row.body = q.text
    await sb.from('stories').update(row).eq('id', id)
  })
}
export async function removeStory(code, id) {
  mutate(code, (x) => { x.stories = x.stories.filter((t) => t.id !== id) })
  await sb.from('stories').delete().eq('id', id)
}
export function moveStory(code, i, d) {
  const x = state.sessions[code]; const j = i + d
  if (!x || j < 0 || j >= x.stories.length) return
  mutate(code, (y) => {
    const a = y.stories[i], b = y.stories[j]
    ;[a.position, b.position] = [b.position, a.position]
    ;[y.stories[i], y.stories[j]] = [b, a]
  })
  const a = x.stories[i], b = x.stories[j] // já trocados
  for (const s of [a, b]) queue('story:' + s.id, () => sb.from('stories').update({ position: s.position }).eq('id', s.id), 50)
}
export function patchJoke(code, id, p) {
  mutate(code, (x) => Object.assign(x.jokes.find((j) => j.id === id), p))
  queue('jokes:' + code, () => sb.from('sessions').update({ jokes: state.sessions[code].jokes, ...touch() }).eq('code', code))
}
export async function addJoke(code) {
  const j = { id: uid().slice(0, 8), name: 'Nota nova', emoji: '⭐', meaning: '' }
  state.jokes = [...state.jokes, j]
  mutate(code, (x) => x.jokes.push({ ...j, active: true }))
  await sb.from('joke_library').insert(j)
  queue('jokes:' + code, () => sb.from('sessions').update({ jokes: state.sessions[code].jokes, ...touch() }).eq('code', code), 50)
}
export async function deleteSession(code) {
  delete state.sessions[code]
  state.list = (state.list || []).filter((x) => x.code !== code)
  emit()
  await sb.from('sessions').delete().eq('code', code)
}
export async function openVoting(code) {
  mutate(code, (y) => { y.status = 'live'; y.endedAt = null })
  await sb.from('sessions').update({ status: 'live', ended_at: null, ...touch() }).eq('code', code)
  tick(code)
}
export async function closeVoting(code) {
  mutate(code, (y) => { y.status = 'ended'; y.endedAt = Date.now() })
  await sb.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString(), ...touch() }).eq('code', code)
  tick(code)
}

// ---------- equipe ----------
async function reloadTeam() { const { data } = await sb.from('team').select('*'); if (data) { state.team = data; emit() } }
export async function addMember(email, role) { await sb.from('team').insert({ email, role }); reloadTeam() }
export async function setRole(email, role) { await sb.from('team').update({ role }).eq('email', email); reloadTeam() }
export async function removeMember(email) { await sb.from('team').delete().eq('email', email); reloadTeam() }
