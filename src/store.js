// Fachada: usa o Supabase quando VITE_SUPABASE_URL está definido; senão o modo local (localStorage).
import * as L from './local.js'
import * as R from './remote.js'

const M = R.enabled ? R : L

export const {
  mode, useStore, voterId, login, logout, roleOf,
  createSession, patchSession, addStory, patchStory, removeStory, moveStory,
  patchJoke, addJoke, deleteSession, setStoryStatus, nextStory, endSession, castVote,
  watchAdmin, watchVoter, isLoading, addMember, setRole, removeMember,
} = M

// funções puras compartilhadas
export const { tally, ranking, exportCsv, expiresAt, DEFAULT_JOKES } = L
