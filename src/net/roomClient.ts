// The app's single room client (FR-8.1). Null Supabase client (no env vars) = rooms report 'offline'.
import { createRoomClient } from './rooms'
import { supabase } from './supabase'

export const roomClient = createRoomClient({ client: supabase })

/** Rooms need the multiplayer server; without it the menu shows them as unavailable. */
export const roomsAvailable = supabase !== null
