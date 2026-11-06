import React, { useEffect, useState } from 'react'
import * as S from './store.js'

const LOGO = 'https://cdn.prod.website-files.com/6597493048b37364a6af5de6/65eb9366bb1d92351b49f349_logosite.svg'
const fmt = (n) => (n == null ? '–' : n.toFixed(2).replace('.', ','))

function useRoute() {
  const [h, set] = useState(location.hash || '#/')
  useEffect(() => { const f = () => set(location.hash || '#/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return h.replace(/^#\/?/, '').split('/').filter(Boolean)
}
const go = (p) => { location.hash = p }
const voteLink = (code) => `${location.origin}${location.pathname}#/v/${code}`
const adminLink = (code) => `${location.origin}${location.pathname}#/admin/${code}`

function Bar({ right }) {
  return (
    <header className="bar" style={{ background: '#000', color: '#fff' }}>
      <img src={LOGO} alt="Coders" />
      <nav>{right}</nav>
    </header>
  )
}

export default function App() {
  const r = useRoute()
  const st = S.useStore()
  if (r[0] === 'demo') return <Demo />
  if (r[0] === 'v') return <Voter code={(r[1] || '').toUpperCase()} st={st} />
  if (r[0] === 'admin') {
    if (!st.me) return <Login st={st} />
    if (r[1] === 'equipe') return <Team st={st} />
    if (r[1] && r[2] === 'live') return <Live code={r[1]} st={st} />
    if (r[1] && r[2] === 'ranking') return <Ranking code={r[1]} st={st} />
    if (r[1]) return <Setup code={r[1]} st={st} />
    return <Home st={st} />
  }
  return <Landing />
}

function Landing() {
  return (
    <div className="app dark" style={{ minHeight: '100vh' }}>
      <Bar />
      <div className="wrap">
        <span className="tag">All Hands</span>
        <h1>Vota nas histórias<br /><b>estranhas</b>.</h1>
        <p className="muted">Entra pelo link de votação que veio no chat do Meet. Se você é da equipe, entra pelo admin.</p>
        <button className="btn pri" onClick={() => go('/admin')}>Entrar como admin</button>
      </div>
    </div>
  )
}

function Login({ st }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setMsg(null)
    const r = await S.login(email, pass)
    setBusy(false)
    if (r.msg) setMsg(r)
  }
  return (
    <div className="app dark">
      <Bar />
      <div className="wrap" style={{ maxWidth: 480 }}>
        <span className="tag">Admin</span>
        <h1>Login</h1>
        <p className="muted">Só entra e-mail que está na lista da equipe.</p>
        <input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {S.mode === 'remote' && <input type="password" placeholder="senha" value={pass} style={{ marginTop: '.75rem' }} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />}
        {msg && <p style={{ color: msg.ok ? 'var(--primary)' : '#ea384c' }}>{msg.msg}</p>}
        {!msg && st.authError && <p style={{ color: '#ea384c' }}>{st.authError}</p>}
        <p><button className="btn pri" disabled={busy || !email || (S.mode === 'remote' && !pass)} onClick={submit}>Entrar</button></p>
        {S.mode === 'local' && <p className="muted" style={{ fontSize: '.8rem' }}>Modo local (sem banco): os dados ficam só neste navegador.</p>}
      </div>
    </div>
  )
}

function AdminShell({ st, children, back }) {
  const role = S.roleOf(st)
  return (
    <div className="app dark">
      <Bar right={<>
        {back && <button className="btn sm" onClick={() => go(back)}>← Voltar</button>}
        {role === 'admin' && <button className="btn sm" onClick={() => go('/admin/equipe')}>Equipe</button>}
        <span className="pill">{st.me} · {role}</span>
        <button className="btn sm" onClick={S.logout}>Sair</button>
      </>} />
      <div className="wrap">{children}</div>
    </div>
  )
}

function Home({ st }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  useEffect(() => S.watchAdmin(null), [st.me])
  const list = [...(st.list ?? Object.values(st.sessions))].sort((a, b) => b.createdAt - a.createdAt)
  return (
    <AdminShell st={st}>
      <span className="tag">Admin</span>
      <h1>Sessões do <b>All Hands</b></h1>
      <div className="card row">
        <input type="date" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn pri" onClick={async () => go('/admin/' + (await S.createSession(date)))}>Criar sessão</button>
      </div>
      {list.length === 0 && <p className="muted">Nenhuma sessão. Os dados somem 12 horas depois do encerramento.</p>}
      {list.map((x) => (
        <div key={x.code} className="card row">
          <span className="code g" style={{ fontSize: '1.4rem' }}>{x.code}</span>
          <div className="grow"><b>{x.date}</b> <span className="pill">{x.status}</span><div className="muted">{x.storyCount ?? x.stories.length} pessoas · {x.voteCount ?? x.votes.length} votos</div></div>
          <button className="btn sm" onClick={() => go('/admin/' + x.code)}>Montar</button>
          <button className="btn sm" onClick={() => go(`/admin/${x.code}/live`)}>Ao vivo</button>
          <button className="btn sm danger" onClick={() => confirm('Apagar sessão?') && S.deleteSession(x.code)}>Apagar</button>
        </div>
      ))}
    </AdminShell>
  )
}

function copy(t, set) { navigator.clipboard?.writeText(t); set('Copiado'); setTimeout(() => set(''), 1500) }

function Setup({ code, st }) {
  const x = st.sessions[code]
  const [toast, setToast] = useState('')
  useEffect(() => S.watchAdmin(code), [code, st.me])
  if (!x && S.isLoading(code)) return <AdminShell st={st} back="/admin"><p className="muted pulse">Carregando…</p></AdminShell>
  if (!x) return <AdminShell st={st} back="/admin"><p>Sessão não encontrada (ou já expirou).</p></AdminShell>
  return (
    <AdminShell st={st} back="/admin">
      <span className="tag">Montar sessão</span>
      <h1>Sessão <b className="code">{code}</b></h1>
      <div className="row">
        <button className="btn" onClick={() => copy(voteLink(code), setToast)}>Copiar link de votação</button>
        <button className="btn" onClick={() => copy(adminLink(code), setToast)}>Copiar link do admin</button>
        <button className="btn pri" onClick={() => go(`/admin/${code}/live`)}>Ir para o controle ao vivo →</button>
      </div>

      <h2>Pessoas</h2>
      <p className="muted">Nome, área e um resumo curto da história.</p>
      {x.stories.map((s, i) => (
        <div key={s.id} className="card">
          <div className="row" style={{ marginBottom: '.5rem' }}>
            <span className="num g">{i + 1}</span>
            <input className="grow" placeholder="Nome e sobrenome" value={s.name} onChange={(e) => S.patchStory(code, s.id, { name: e.target.value })} />
            <button className="btn sm" onClick={() => S.moveStory(code, i, -1)}>↑</button>
            <button className="btn sm" onClick={() => S.moveStory(code, i, 1)}>↓</button>
            <button className="btn sm danger" onClick={() => S.removeStory(code, s.id)}>✕</button>
          </div>
          <input placeholder="Área em que trabalha" value={s.area} onChange={(e) => S.patchStory(code, s.id, { area: e.target.value })} style={{ marginBottom: '.5rem' }} />
          <textarea placeholder="Resumo da história (o que ela contou)" value={s.text} onChange={(e) => S.patchStory(code, s.id, { text: e.target.value })} />
        </div>
      ))}
      <button className="btn" onClick={() => S.addStory(code)}>+ Adicionar pessoa</button>

      <h2>Notas piada</h2>
      <p className="muted">Notas só pra zoar. Liga e desliga por sessão.</p>
      {x.jokes.map((j) => (
        <div key={j.id} className="card row">
          <label className="sw"><input type="checkbox" checked={j.active} onChange={(e) => S.patchJoke(code, j.id, { active: e.target.checked })} /></label>
          <input style={{ width: 60, textAlign: 'center' }} value={j.emoji} onChange={(e) => S.patchJoke(code, j.id, { emoji: e.target.value })} />
          <input className="grow" value={j.name} onChange={(e) => S.patchJoke(code, j.id, { name: e.target.value })} />
        </div>
      ))}
      <button className="btn" onClick={() => S.addJoke(code)}>+ Criar nota nova</button>

      <h2>Peso de quem conta a história</h2>
      <div className="row"><input type="number" step="0.1" min="0" max="1" style={{ width: 100 }} value={x.weight} onChange={(e) => S.patchSession(code, { weight: parseFloat(e.target.value) || 0 })} /><span className="muted">Vale só pra média. Padrão 0,5.</span></div>
      {toast && <div className="toast">{toast}</div>}
    </AdminShell>
  )
}

function Expiry({ x }) {
  const left = S.expiresAt(x) - Date.now()
  const h = Math.max(0, Math.floor(left / 3600000))
  const m = Math.max(0, Math.floor((left % 3600000) / 60000))
  return <span className={'pill' + (left < 3600000 ? ' warn' : '')}>dados somem {new Date(S.expiresAt(x)).toLocaleString('pt-BR')} ({h}h{m}min){left < 3600000 ? ' · falta menos de 1h, exporta!' : ''}</span>
}

function Live({ code, st }) {
  const x = st.sessions[code]
  const role = S.roleOf(st)
  useEffect(() => S.watchAdmin(code), [code, st.me])
  if (!x && S.isLoading(code)) return <AdminShell st={st} back="/admin"><p className="muted pulse">Carregando…</p></AdminShell>
  if (!x) return <AdminShell st={st} back="/admin"><p>Sessão não encontrada.</p></AdminShell>
  const s = x.stories[x.current]
  const t = s ? S.tally(x, s.id) : null
  return (
    <AdminShell st={st} back={`/admin/${code}`}>
      <div className="row"><span className="tag">Ao vivo</span><span className="pill on">{x.status}</span><span className="code g">{code}</span><Expiry x={x} /></div>
      {!s ? <p>Cadastre pelo menos uma pessoa na montagem.</p> : (<>
        <p className="muted">Pessoa {x.current + 1} de {x.stories.length}</p>
        {s.status === 'revealed'
          ? <Result x={x} s={s} />
          : <div className="card"><div className="who"><b>{s.name || 'Sem nome'}</b></div><div className="q">{s.area}</div><p className="story">{s.text}</p></div>}
        <div className="card row">
          <span className="num" style={{ fontSize: '2rem' }}>{t.total}</span><span className="muted">votos entraram · {s.status}</span>
        </div>
        <div className="row">
          <button className="btn pri" disabled={s.status !== 'waiting' && s.status !== 'closed'} onClick={() => S.setStoryStatus(code, 'voting')}>Abrir votação</button>
          <button className="btn" disabled={s.status !== 'voting'} onClick={() => S.setStoryStatus(code, 'closed')}>Fechar votação</button>
          <button className="btn pri" disabled={s.status !== 'closed'} onClick={() => S.setStoryStatus(code, 'revealed')}>Revelar</button>
          <button className="btn" disabled={s.status !== 'revealed'} onClick={() => S.nextStory(code)}>{x.current < x.stories.length - 1 ? 'Próxima pessoa' : 'Encerrar sessão'}</button>
        </div>
      </>)}
      <h2>Fim</h2>
      <div className="row">
        <button className="btn" onClick={() => go(`/admin/${code}/ranking`)}>Ranking da sessão</button>
        {role === 'admin' && <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + S.exportCsv(x)], { type: 'text/csv' })); a.download = `all-hands-${x.date}.csv`; a.click() }}>Exportar CSV</button>}
        {x.status !== 'ended' && <button className="btn danger" onClick={() => confirm('Encerrar a sessão? Começa a contar as 12h.') && S.endSession(code)}>Encerrar sessão</button>}
      </div>
    </AdminShell>
  )
}

function Result({ x, s }) {
  const t = S.tally(x, s.id)
  const act = x.jokes.filter((j) => j.active)
  const topJ = Math.max(0, ...act.map((j) => t.jokes[j.id] || 0))
  const max = Math.max(1, ...t.nums)
  return (
    <div className="card result">
      <div className="who"><b>{s.name}</b></div>
      <div className="muted">{s.area}</div>
      <div className="big">{fmt(t.avg)}</div>
      <div className="muted">média ponderada · {t.counted} votos de 1 a 5 · {t.total} no total</div>
      <div className="bars split">
        {[5, 4, 3, 2, 1].map((g) => (
          <div className="brow" key={g}><span>{g}</span><div className="track"><div className="fill" style={{ width: (t.nums[g - 1] / max) * 100 + '%' }} /></div><span>{t.nums[g - 1]}</span></div>
        ))}
      </div>
      {act.length > 0 && <div className="jgrid">
        {act.map((j) => { const n = t.jokes[j.id] || 0; return (
          <div key={j.id} className={'jbtn jres' + (n && n === topJ ? ' top' : '')}><span>{j.emoji} {j.name}</span><b>{n}</b></div>
        ) })}
      </div>}
    </div>
  )
}

function Ranking({ code, st }) {
  const x = st.sessions[code]
  useEffect(() => S.watchAdmin(code), [code, st.me])
  if (!x) return <AdminShell st={st} back="/admin"><p>Sessão não encontrada.</p></AdminShell>
  const { ranked, awards } = S.ranking(x)
  return (
    <AdminShell st={st} back={`/admin/${code}/live`}>
      <span className="tag">Ranking</span>
      <h1>Ranking da <b>sessão</b></h1>
      {ranked.map((r, i) => (
        <div key={r.st.id} className="card rank"><span className="n">{i + 1}</span><div><b>{r.st.name}</b><div className="muted">{r.st.area}</div></div><span className="num g" style={{ fontSize: '1.6rem' }}>{fmt(r.avg)}</span></div>
      ))}
      <h2>Prêmios das notas piada</h2>
      {awards.length === 0 && <p className="muted">Ninguém ganhou nada ainda.</p>}
      {awards.map((a) => <div key={a.joke.id} className="card">{a.joke.emoji} <b>{a.joke.name}</b>: {a.st.name} <span className="pill">{a.n} votos</span></div>)}
    </AdminShell>
  )
}

function Team({ st }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('moderador')
  if (S.roleOf(st) !== 'admin') return <AdminShell st={st} back="/admin"><p>Só admin acessa a equipe.</p></AdminShell>
  return (
    <AdminShell st={st} back="/admin">
      <span className="tag">Equipe</span>
      <h1>Admins e <b>moderadores</b></h1>
      {st.team.map((m) => (
        <div key={m.email} className="card row">
          <span className="grow">{m.email}</span>
          <select style={{ width: 150 }} value={m.role} onChange={(e) => S.setRole(m.email, e.target.value)}><option>admin</option><option>moderador</option></select>
          <button className="btn sm danger" disabled={m.email === st.me} onClick={() => S.removeMember(m.email)}>Remover</button>
        </div>
      ))}
      <div className="card row">
        <input className="grow" placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select style={{ width: 150 }} value={role} onChange={(e) => setRole(e.target.value)}><option>moderador</option><option>admin</option></select>
        <button className="btn pri" onClick={() => { const v = email.trim().toLowerCase(); if (v && !st.team.some((t) => t.email === v)) S.addMember(v, role); setEmail('') }}>Adicionar</button>
      </div>
    </AdminShell>
  )
}

function Voter({ code, st }) {
  const x = st.sessions[code]
  const me = S.voterId()
  const [mine, setMine] = useState(false) // "essa história é minha" (local, por história)
  useEffect(() => S.watchVoter(code), [code])
  const s = x?.stories[x.current]
  useEffect(() => setMine(false), [s?.id])
  return <VoterView code={code} x={x} s={s} me={me} mine={mine} setMine={setMine} loading={S.isLoading(code)} cast={S.castVote} />
}

function VoterView({ code, x, s, me, mine, setMine, loading, cast }) {
  return (
    <div className="app dark">
      <Bar right={<span className="pill">{code}</span>} />
      <div className="wrap" style={{ maxWidth: 560 }}>
        {!x && loading ? <div className="center"><h1 className="pulse">Entrando…</h1></div>
        : !x ? <div className="center"><h1>Sessão não encontrada</h1><p className="muted">Confere o link ou fala com o admin.</p></div>
        : x.status === 'ended' && (!s || s.status !== 'revealed') ? <div className="center"><h1>Acabou. <b>Valeu!</b></h1></div>
        : !s || s.status === 'waiting' ? <div className="center"><span className="tag">Sala de espera</span><h1 className="pulse">Já já <b>abre</b></h1><p className="muted">Quando o admin abrir a votação, a tela muda sozinha.</p></div>
        : s.status === 'closed' || s.status === 'revealed' ? (() => {
            const voted = x.votes.some((t) => t.storyId === s.id && t.voter === me)
            return <div className="center"><span className="tag">Votação fechada</span>
              <h1>{voted ? <>Teu voto foi <b>registrado</b></> : <>Você <b>não votou</b> dessa vez</>}</h1>
              <p className="muted">O voto é secreto. A apuração fica com a equipe. A próxima pessoa aparece sozinha.</p></div>
          })()
        : <VoteScreen x={x} s={s} me={me} mine={mine} setMine={setMine} code={code} cast={cast} />}
      </div>
    </div>
  )
}

// Simulação da tela do votante (sem banco). Rota: #/demo
function Demo() {
  const JOKES = [
    { id: 'pesar', name: 'Nota de pesar', emoji: '🕯️', meaning: '', active: true },
    { id: 'do', name: 'Nota dó', emoji: '🥺', meaning: '', active: true },
    { id: 'repudio', name: 'Nota de repúdio', emoji: '🚫', meaning: '', active: true },
    { id: 'ressarcimento', name: 'Nota de ressarcimento', emoji: '💸', meaning: '', active: true },
  ]
  const STAGES = { waiting: 'Sala de espera', voting: 'Votando', closed: 'Fechada', ended: 'Fim' }
  const [stage, setStage] = useState('voting')
  const [votes, setVotes] = useState([])
  const [mine, setMine] = useState(false)
  const story = { id: 'd1', name: 'Ana Souza', area: 'Engenharia de Dados', text: 'Comi grilo frito num mercado em Bangkok e gostei tanto que voltei no dia seguinte pra comer de novo.', status: stage === 'closed' ? 'closed' : stage === 'waiting' ? 'waiting' : 'voting' }
  const x = { code: 'DEMO', status: stage === 'ended' ? 'ended' : 'live', weight: 0.5, jokes: JOKES, current: 0, stories: [story], votes }
  const cast = (_c, id, voter, grade, isAuthor) => setVotes([{ storyId: id, voter, grade, isAuthor }])
  return (
    <div className="app dark">
      <div className="wrap" style={{ maxWidth: 1000 }}>
        <span className="tag">Simulação</span>
        <h1 style={{ fontSize: '2rem' }}>Tela do <b>votante</b></h1>
        <div className="row" style={{ marginBottom: '1rem' }}>
          {Object.entries(STAGES).map(([k, v]) => <button key={k} className={'btn sm' + (stage === k ? ' pri' : '')} onClick={() => setStage(k)}>{v}</button>)}
          <button className="btn sm" onClick={() => { setVotes([]); setMine(false) }}>Limpar voto</button>
        </div>
        <div className="phone"><VoterView code="DEMO" x={x} s={story} me="demo" mine={mine} setMine={setMine} cast={cast} /></div>
      </div>
    </div>
  )
}

function VoteScreen({ x, s, me, mine, setMine, code, cast = S.castVote }) {
  const v = x.votes.find((t) => t.storyId === s.id && t.voter === me)
  const pick = (g) => cast(code, s.id, me, g, mine)
  const act = x.jokes.filter((j) => j.active)
  return (
    <>
      <span className="tag">Votando</span>
      <h1 style={{ fontSize: '2.2rem' }}>{s.name}</h1>
      <div className="q">{s.area}</div>
      <p className="story">{s.text}</p>
      <p className="muted">Escolhe tua nota. Dá pra mudar até fechar.</p>
      <div className="grades">
        {['1', '2', '3', '4', '5'].map((g) => <button key={g} className={'gbtn' + (v?.grade === g ? ' sel' : '')} onClick={() => pick(g)}>{g}</button>)}
      </div>
      <div className="jgrid">{act.map((j) => <button key={j.id} className={'jbtn' + (v?.grade === j.id ? ' sel' : '')} onClick={() => pick(j.id)}>{j.emoji} {j.name}</button>)}</div>
      {v && <p className="ok">✓ Voto registrado. Pode trocar até fechar.</p>}
      <label className="sw" style={{ marginTop: '1.5rem' }}><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); if (v) cast(code, s.id, me, v.grade, e.target.checked) }} /> Essa história é minha</label>
    </>
  )
}
