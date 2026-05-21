import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
        heartbeatIntervalMs: 15000, // 15초마다 heartbeat → 모바일 끊김 빠르게 감지
        reconnectAfterMs: (tries) => Math.min(tries * 1000, 10000), // 최대 10초 간격으로 재연결
    },
})
