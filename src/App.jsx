import React, { useEffect, useState } from 'react'
import * as S from './store.js'
import { HISTORIAS } from './historias.js'
import { baixaPodio } from './podio.js'

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
  if (r[0] && r[0].startsWith('demo')) return <Demo />
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
          <div className="grow"><b>{x.date}</b> <span className="pill">{STATUS[x.status]}</span><div className="muted">{x.storyCount ?? x.stories.length} pessoas · {x.voteCount ?? x.votes.length} votos</div></div>
          <button className="btn sm" onClick={() => go('/admin/' + x.code)}>Montar</button>
          <button className="btn sm" onClick={() => go(`/admin/${x.code}/live`)}>Votação</button>
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

const STATUS = { draft: 'rascunho', live: 'votação aberta', ended: 'votação fechada' }

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
  const rows = x.stories.map((s) => ({ s, t: S.tally(x, s.id) }))
  const totalVotos = rows.reduce((a, r) => a + r.t.total, 0)
  const votantes = Math.max(0, ...rows.map((r) => r.t.total)) // aproximação: quem votou na pessoa mais votada
  const ranked = S.ranking(x).ranked
  return (
    <AdminShell st={st} back={`/admin/${code}`}>
      <div className="row"><span className="tag">Votação</span><span className={'pill' + (x.status === 'live' ? ' on' : '')}>{STATUS[x.status]}</span><span className="code g">{code}</span><Expiry x={x} /></div>
      {x.stories.length === 0 && <p>Cadastre pelo menos uma pessoa na montagem.</p>}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><span className="num" style={{ fontSize: '2.4rem' }}>{totalVotos}</span> <span className="muted">votos no total · até {votantes} votantes</span></div>
        </div>
        <div className="vlist">
          {rows.map(({ s, t }) => (
            <div key={s.id} className="vrow"><div className="grow"><b>{s.name || 'Sem nome'}</b><div className="muted">{s.area}</div></div><span className="num g">{t.total}</span></div>
          ))}
        </div>
        {x.status === 'live' && <p className="muted" style={{ marginBottom: 0 }}>Os resultados ficam escondidos até você fechar a votação.</p>}
      </div>

      {x.status === 'ended' && (<>
        <h2>Resultado</h2>
        {ranked.map((r) => <Result key={r.st.id} x={x} s={r.st} />)}
      </>)}

      <h2>Fim</h2>
      <div className="row">
        <button className="btn" onClick={() => go(`/admin/${code}/ranking`)}>Ranking e pódio</button>
        {role === 'admin' && <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + S.exportCsv(x)], { type: 'text/csv' })); a.download = `all-hands-${x.date}.csv`; a.click() }}>Exportar CSV</button>}
      </div>

      <div className="row actions">
        {x.status !== 'ended'
          ? <button className="btn pri" disabled={x.status === 'live' || x.stories.length === 0} onClick={() => S.openVoting(code)}>Abrir votação</button>
          : <button className="btn" onClick={() => S.openVoting(code)}>Reabrir votação</button>}
        <button className="btn" disabled={x.status !== 'live'} onClick={() => confirm('Fechar a votação? Ninguém mais consegue votar e começam a contar as 12h.') && S.closeVoting(code)}>Fechar votação</button>
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

function Podio({ ranked, date, canExport }) {
  const top = ranked.filter((r) => r.avg != null).slice(0, 3).map((r) => ({ name: r.st.name, area: r.st.area, avg: r.avg }))
  if (top.length === 0) return null
  const ordem = [1, 0, 2].filter((i) => top[i]) // 2º, 1º, 3º
  return (
    <section className="podio-wrap">
      <div className="podio">
        {ordem.map((i) => (
          <div key={i} className={'pcol p' + (i + 1)}>
            <div className="pmedal">{['🥇', '🥈', '🥉'][i]}</div>
            <div className="pname">{top[i].name}</div>
            <div className="parea">{top[i].area}</div>
            <div className="pbloco"><b>{fmt(top[i].avg)}</b><small>média</small></div>
          </div>
        ))}
      </div>
      {canExport && <button className="btn pri" onClick={() => baixaPodio({ top, data: date })}>Baixar pódio (PNG)</button>}
    </section>
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
      <Podio ranked={ranked} date={x.date} canExport={S.roleOf(st) === 'admin'} />
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
  useEffect(() => S.watchVoter(code), [code])
  return <VoterView code={code} x={x} me={me} loading={S.isLoading(code)} cast={S.castVote} />
}

const QTD_HISTORIAS = 3 // quantos quadradinhos aparecem por vez
const TROCA_MS = 10000 // a cada quantos ms as histórias mudam
function sorteia(lista, n) {
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, n)
}

function Hero() {
  // ordem sorteada por visita; a cada TROCA_MS avança um trio, sem repetir até passar por todas
  const [ordem] = useState(() => sorteia(HISTORIAS, HISTORIAS.length))
  const [pos, setPos] = useState(0)
  useEffect(() => {
    if (ordem.length <= QTD_HISTORIAS) return
    const t = setInterval(() => setPos((p) => (p + QTD_HISTORIAS) % ordem.length), TROCA_MS)
    return () => clearInterval(t)
  }, [ordem.length])
  const sorteadas = Array.from({ length: Math.min(QTD_HISTORIAS, ordem.length) }, (_, k) => ordem[(pos + k) % ordem.length])
  return (
    <section className="hero">
      <span className="tag">All Hands</span>
      <h1>Histórias do <b>All Hands</b></h1>
      <p className="lead">No All Hands, os novos integrantes da Coders contam suas histórias mais estranhas e a gente vota.</p>
      <div className="wait"><span className="dot" />Aguardando a votação abrir. A tela muda sozinha.</div>
      {sorteadas.length > 0 && <>
        <div className="hlabel">Já passaram por aqui</div>
        <div className="hcards">
          {sorteadas.map((h, i) => (
            <article key={pos + '-' + i} className={'hcard ' + h.cor} style={{ '--tilt': (i % 2 ? 2 : -2) + 'deg', '--d': i * 0.4 + 's' }}>
              <div className="hemoji">{h.emoji}</div>
              <p>{h.texto}</p>
              <small>{h.mes}</small>
            </article>
          ))}
        </div>
      </>}
    </section>
  )
}

function VoterView({ code, x, me, loading, cast }) {
  const mine = x ? x.votes.filter((v) => v.voter === me) : []
  const total = x ? x.stories.length : 0
  const done = x ? x.stories.filter((s) => mine.some((v) => v.storyId === s.id)).length : 0
  return (
    <div className="app dark">
      <Bar right={<span className="pill">{code}</span>} />
      <div className="wrap voter">
        {!x && loading ? <div className="center"><h1 className="pulse">Entrando…</h1></div>
        : !x ? <div className="center"><h1>Sessão não encontrada</h1><p className="muted">Confere o link ou fala com o admin.</p></div>
        : x.status === 'draft' ? <Hero />
        : x.status === 'ended' ? (
          <div className="center"><span className="tag">Votação fechada</span>
            <h1>{done > 0 ? <>Você votou em <b>{done} de {total}</b></> : <>Você <b>não votou</b> dessa vez</>}</h1>
            <p className="muted">O voto é secreto. A apuração fica com a equipe.</p></div>
        ) : (<>
          <span className="tag">Votando</span>
          <h1>Vote nas <b>histórias</b></h1>
          <p className="muted">Escolhe a nota de cada pessoa. Dá pra mudar até fechar.</p>
          <div className="vprogress"><span>{done} de {total} votadas</span><div className="track"><div className="fill" style={{ width: (total ? (done / total) * 100 : 0) + '%' }} /></div></div>
          {x.stories.map((s) => <StoryCard key={s.id} s={s} x={x} me={me} code={code} cast={cast} />)}
          {total === 0 && <p className="muted">Ainda não tem ninguém cadastrado.</p>}
        </>)}
      </div>
    </div>
  )
}

// Simulação da tela do votante (sem banco). Rotas: #/demo (manual) e #/demo?auto (roda sozinha, com legendas)
const DEMO_JOKES = [
  { id: 'pesar', name: 'Nota de pesar', emoji: '🕯️', meaning: '', active: true },
  { id: 'repudio', name: 'Nota de repúdio', emoji: '🚫', meaning: '', active: true },
  { id: 'do', name: 'Nota dó', emoji: '🥺', meaning: '', active: true },
  { id: 'ressarcimento', name: 'Nota de ressarcimento', emoji: '💸', meaning: '', active: true },
]
const DEMO_STORIES = [
  { id: 'd1', name: 'Ana Souza', area: 'Engenharia de Dados', text: 'Comi grilo frito num mercado em Bangkok e gostei tanto que voltei no dia seguinte pra comer de novo.' },
  { id: 'd2', name: 'Bruno Lima', area: 'Comunidade', text: 'Já abri show de uma banda que ninguém lembra o nome.' },
  { id: 'd3', name: 'Carla Dias', area: 'Marketing e Parcerias', text: 'Ganhei um concurso de fantasia de caixa de sucrilhos gigante. Saía leite.' },
]
const DEMO_STEPS = [
  { ms: 9000, stage: 'waiting', caption: 'Você abre o link, no celular ou no computador. Enquanto a votação não abre, rolam histórias de All Hands passados.' },
  { ms: 4000, stage: 'voting', votes: {}, caption: 'A equipe abre a votação e as pessoas aparecem todas de uma vez. Você vota em cada uma, no seu ritmo.' },
  { ms: 3500, stage: 'voting', votes: { d1: '4' }, caption: 'Um toque na nota, de 1 a 5. Dá pra trocar até fechar.' },
  { ms: 4000, stage: 'voting', votes: { d1: '4', d2: 'do', d3: '5' }, caption: 'Ou uma nota piada, só pra zoar. O progresso mostra quantas faltam.' },
  { ms: 4500, stage: 'closed', votes: { d1: '4', d2: 'do', d3: '5' }, caption: 'A equipe fecha a votação. O voto é secreto: ninguém vê o que você escolheu.' },
  { ms: 5500, stage: 'result', votes: {}, caption: 'A apuração fica só com a equipe, que monta o pódio com a média ponderada.' },
]
const DEMO_RANKED = [{ st: { name: 'Carla Dias', area: 'Marketing e Parcerias' }, avg: 4.8 }, { st: { name: 'Ana Souza', area: 'Engenharia de Dados' }, avg: 4.6 }, { st: { name: 'Bruno Lima', area: 'Comunidade' }, avg: 3.6 }]

function Demo() {
  const auto = location.hash.includes('auto')
  const STAGES = { waiting: 'Sala de espera', voting: 'Votando', closed: 'Fechada', result: 'Resultado (equipe)' }
  const [stage, setStage] = useState(auto ? DEMO_STEPS[0].stage : 'voting')
  const [votes, setVotes] = useState([])
  const [step, setStep] = useState(0)
  const toVotes = (o) => Object.entries(o || {}).map(([storyId, grade]) => ({ storyId, voter: 'demo', grade, isAuthor: false }))
  useEffect(() => {
    if (!auto) return
    let i = 0, t
    const run = () => {
      const st = DEMO_STEPS[i % DEMO_STEPS.length]
      setStep(i % DEMO_STEPS.length); setStage(st.stage); setVotes(toVotes(st.votes))
      t = setTimeout(() => { i++; run() }, st.ms)
    }
    run()
    return () => clearTimeout(t)
  }, [auto])
  const x = { code: 'DEMO', status: stage === 'closed' ? 'ended' : stage === 'waiting' ? 'draft' : 'live', weight: 0.5, jokes: DEMO_JOKES, current: 0, stories: DEMO_STORIES, votes }
  const cast = (_c, id, voter, grade, isAuthor) => setVotes((vs) => [...vs.filter((v) => v.storyId !== id), { storyId: id, voter, grade, isAuthor }])
  return (
    <div className="app dark">
      <div className="wrap" style={{ maxWidth: 1000 }}>
        {auto ? (
          <div className="demo-cap">
            <span className="tag">Como funciona a votação</span>
            <p key={step}>{DEMO_STEPS[step].caption}</p>
            <div className="demo-dots">{DEMO_STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}</div>
          </div>
        ) : (<>
          <span className="tag">Simulação</span>
          <h1 style={{ fontSize: '2rem' }}>Tela do <b>votante</b></h1>
          <p className="muted">A tela se adapta ao aparelho: celular, tablet ou computador.</p>
          <div className="row" style={{ marginBottom: '1rem' }}>
            {Object.entries(STAGES).map(([k, v]) => <button key={k} className={'btn sm' + (stage === k ? ' pri' : '')} onClick={() => setStage(k)}>{v}</button>)}
            <button className="btn sm" onClick={() => setVotes([])}>Limpar votos</button>
          </div>
        </>)}
        <div className="screen">
          {stage === 'result'
            ? <div className="app dark"><Bar right={<span className="pill">equipe</span>} /><div className="wrap"><Podio ranked={DEMO_RANKED} date="2026-11-06" canExport={false} /></div></div>
            : <VoterView code="DEMO" x={x} me="demo" cast={cast} />}
        </div>
      </div>
    </div>
  )
}

function StoryCard({ s, x, me, code, cast }) {
  const v = x.votes.find((t) => t.storyId === s.id && t.voter === me)
  const [mine, setMine] = useState(!!v?.isAuthor)
  useEffect(() => { if (v) setMine(!!v.isAuthor) }, [v?.isAuthor])
  const pick = (g) => cast(code, s.id, me, g, mine)
  const act = x.jokes.filter((j) => j.active)
  return (
    <article className={'scard' + (v ? ' done' : '')}>
      <h2 className="sname">{s.name}</h2>
      <div className="q">{s.area}</div>
      <p className="story">{s.text}</p>
      <div className="grades">
        {['1', '2', '3', '4', '5'].map((g) => <button key={g} className={'gbtn' + (v?.grade === g ? ' sel' : '')} onClick={() => pick(g)}>{g}</button>)}
      </div>
      <div className="jgrid">{act.map((j) => <button key={j.id} className={'jbtn' + (v?.grade === j.id ? ' sel' : '')} onClick={() => pick(j.id)}>{j.emoji} {j.name}</button>)}</div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
        <label className="sw"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); if (v) cast(code, s.id, me, v.grade, e.target.checked) }} /> Essa história é minha</label>
        {v && <span className="ok">✓ voto registrado</span>}
      </div>
    </article>
  )
}
