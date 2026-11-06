// Histórias de All Hands passados, que aparecem nos quadradinhos da sala de espera.
// Sem nome de ninguém, só o teaser. Para adicionar ou tirar, edite a lista.
// A sala de espera sorteia 3 destas por visita (QTD_HISTORIAS em App.jsx). Lista vazia ([]) esconde os quadradinhos.
const MES = 'All Hands'
const CORES = ['verde', 'claro', 'borda', 'cinza']

const ITENS = [
  ['💩', 'Sou vingativa e já coloquei cocô de cachorro no shampoo de uma pessoa (que só descobriu no final do frasco).'],
  ['🚗', 'Não dirijo pois falhei no teste psicotécnico (sim, o de fazer palitinho) 3x.'],
  ['🐱', 'Já tive 31 filhotes de gato em um apartamento (tinha 3 fêmeas e um macho “supostamente castrado” que engravidou as 3 ao mesmo tempo).'],
  ['🔬', 'Assistia vídeos de autópsias reais quando criança só por diversão.'],
  ['🔪', 'Me esfaqueei por acidente, rompi 2 tendões e precisei de cirurgia.'],
  ['⚖️', 'Meu pai me processou criminalmente por xingar a amante dele.'],
  ['🥣', 'Ganhei um concurso de fantasia porque me transformei em uma caixa de sucrilhos gigante e realista na empresa onde trabalhava. Eu fiz a fantasia e saía leite.'],
  ['📺', 'Apareci no SOS Desaparecidos, no jornal do almoço! Estava desaparecida? Não exatamente.'],
]

export const HISTORIAS = ITENS.map(([emoji, texto], i) => ({ emoji, texto, mes: MES, cor: CORES[i % CORES.length] }))
