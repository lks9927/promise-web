import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Supabase Realtime 구독 커스텀 훅
 * 
 * @param {string} table - 구독할 테이블명 (예: 'funeral_cases')
 * @param {Function} onDataChange - 데이터 변경 시 실행할 콜백
 * @param {Object} options - 추가 옵션
 * @param {string[]} options.events - 감지할 이벤트 ['INSERT', 'UPDATE', 'DELETE']
 * @param {string} options.filter - 필터 조건 (예: 'user_id=eq.xxx')
 * @param {boolean} options.enabled - 구독 활성화 여부 (기본: true)
 */
export default function useRealtimeSubscription(table, onDataChange, options = {}) {
    const { 
        events = ['INSERT', 'UPDATE', 'DELETE'], 
        filter = null, 
        enabled = true 
    } = options;

    const callbackRef = useRef(onDataChange);
    callbackRef.current = onDataChange;

    useEffect(() => {
        if (!enabled || !table) return;

        const channelName = `realtime_${table}_${filter || 'all'}_${Date.now()}`;
        const channel = supabase.channel(channelName);

        events.forEach((event) => {
            const config = {
                event,
                schema: 'public',
                table,
            };
            if (filter) config.filter = filter;

            channel.on('postgres_changes', config, (payload) => {
                console.log(`[Realtime] ${table} ${event}:`, payload);
                callbackRef.current(payload);
            });
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Realtime] ✅ ${table} 구독 시작`);
            }
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, filter, enabled, events.join(',')]);
}

/**
 * 여러 테이블을 한번에 구독하는 편의 훅
 * 
 * @param {Array<{table: string, events?: string[], filter?: string}>} subscriptions
 * @param {Function} onDataChange - 변경 시 공통 콜백 (payload에 table 정보 포함)
 * @param {boolean} enabled - 전체 활성화 여부
 */
export function useMultiRealtimeSubscription(subscriptions, onDataChange, enabled = true) {
    const callbackRef = useRef(onDataChange);
    callbackRef.current = onDataChange;

    useEffect(() => {
        if (!enabled || !subscriptions?.length) return;

        const channelName = `realtime_multi_${Date.now()}`;
        const channel = supabase.channel(channelName);

        subscriptions.forEach(({ table, events = ['INSERT', 'UPDATE', 'DELETE'], filter }) => {
            events.forEach((event) => {
                const config = {
                    event,
                    schema: 'public',
                    table,
                };
                if (filter) config.filter = filter;

                channel.on('postgres_changes', config, (payload) => {
                    console.log(`[Realtime] ${table} ${event}:`, payload);
                    callbackRef.current({ ...payload, table });
                });
            });
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Realtime] ✅ 멀티 구독 시작 (${subscriptions.map(s => s.table).join(', ')})`);
            }
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [enabled, JSON.stringify(subscriptions)]);
}
