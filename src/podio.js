// Gera a imagem do pódio (PNG 1920x1080, 16:9) para colocar em slide, Caju, etc.
// Desenha direto no canvas, sem biblioteca. top = [{ name, area, avg }] em ordem de colocação (1º, 2º, 3º).
const VERDE = '#44d62c'
const FONTE = "'Nexa Text', 'Poppins', sans-serif"

const fmtNota = (n) => n.toFixed(2).replace('.', ',')

function ajusta(ctx, texto, maxW, px, min, peso = 600) {
  let s = px
  ctx.font = `${peso} ${s}px ${FONTE}`
  while (ctx.measureText(texto).width > maxW && s > min) { s -= 2; ctx.font = `${peso} ${s}px ${FONTE}` }
  if (ctx.measureText(texto).width <= maxW) return texto
  let t = texto
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

function blocoArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

export async function desenhaPodio({ top, data }) {
  const W = 1920, H = 1080
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  try { await Promise.all([document.fonts.load(`600 80px ${FONTE}`), document.fonts.load(`400 30px ${FONTE}`)]) } catch {}

  // fundo
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 1100)
  g.addColorStop(0, 'rgba(34,110,22,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

  // título
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'; ctx.font = `400 84px ${FONTE}`
  const a = 'Histórias do ', b = 'All Hands'
  const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width
  const x0 = W / 2 - (wa + wb) / 2
  ctx.textAlign = 'left'
  ctx.fillText(a, x0, 130)
  ctx.fillStyle = VERDE; ctx.fillText(b, x0 + wa, 130)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `400 32px ${FONTE}`
  const [yy, mm, dd] = String(data).split('-')
  ctx.fillText(`Pódio · ${dd && mm ? dd + '/' + mm + '/' + yy : data}`, W / 2, 185)

  // pódio: ordem visual 2º, 1º, 3º
  const base = 930, bw = 480, gap = 28
  const alturas = { 1: 400, 2: 300, 3: 220 }
  const centros = { 1: W / 2, 2: W / 2 - (bw + gap), 3: W / 2 + (bw + gap) }
  const medalhas = { 1: '🥇', 2: '🥈', 3: '🥉' }

  top.slice(0, 3).forEach((p, i) => {
    const pos = i + 1, h = alturas[pos], cx = centros[pos], x = cx - bw / 2, y = base - h
    // bloco
    blocoArredondado(ctx, x, y, bw, h, 30)
    ctx.fillStyle = pos === 1 ? 'rgba(68,214,44,.20)' : 'rgba(255,255,255,.07)'; ctx.fill()
    ctx.lineWidth = pos === 1 ? 4 : 2; ctx.strokeStyle = pos === 1 ? VERDE : 'rgba(255,255,255,.22)'; ctx.stroke()
    // textos acima do bloco: medalha, nome e área
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
    ctx.font = `400 90px ${FONTE}`
    ctx.fillText(medalhas[pos], cx, y - 130)
    const nome = ajusta(ctx, p.name || 'Sem nome', bw - 20, 46, 28, 600)
    ctx.fillStyle = '#fff'; ctx.fillText(nome, cx, y - 70)
    const area = ajusta(ctx, p.area || '', bw - 20, 30, 20, 400)
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(area, cx, y - 26)
    // nota dentro do bloco
    const nota = p.avg == null ? '–' : fmtNota(p.avg)
    ctx.fillStyle = VERDE; ctx.font = `600 ${pos === 1 ? 120 : 96}px ${FONTE}`
    ctx.fillText(nota, cx, y + (pos === 1 ? 150 : 125))
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `400 28px ${FONTE}`
    ctx.fillText('média', cx, y + (pos === 1 ? 200 : 168))
  })

  // rodapé
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `400 26px ${FONTE}`; ctx.textAlign = 'center'
  ctx.fillText('Coders · média ponderada das notas de 1 a 5', W / 2, 1030)
  return c
}

export async function baixaPodio({ top, data }) {
  const c = await desenhaPodio({ top, data })
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `podio-all-hands-${data}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
