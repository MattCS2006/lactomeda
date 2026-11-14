// Supabase client for multiplayer rooms and the leaderboard (Dev 3).
// If the env vars are missing, `supabase` is null and the game runs in solo/offline mode (NFR-07).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

/** Quick health check: joins a throwaway Realtime channel and resolves true when subscribed. */
export function testRealtime(timeoutMs = 5000): Promise<boolean> {
  if (!supabase) return Promise.resolve(false)
  const client = supabase
  return new Promise((resolve) => {
    const channel = client.channel(`ping-${Math.random().toString(36).slice(2, 8)}`)
    const timer = setTimeout(() => {
      client.removeChannel(channel)
      resolve(false)
    }, timeoutMs)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        client.removeChannel(channel)
        resolve(true)
      }
    })
  })
}
