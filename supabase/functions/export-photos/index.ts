import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    // 1. CORS Headers Setup
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const caseId = url.searchParams.get('case_id');
        const apiKey = req.headers.get('x-api-key');
        
        // API 키 검증 (환경 변수 EXPORT_API_KEY와 대조)
        if (apiKey !== Deno.env.get('EXPORT_API_KEY')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        
        // 사진이 있는 보고서만 조회 (분류 필터링 없이 모두)
        let query = supabase
            .from('funeral_progress_reports')
            .select('case_id, stage_number, image_url, content, created_at, author_name')
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false });
        
        if (caseId) {
            query = query.eq('case_id', caseId);
        } else {
            // case_id 파라미터가 없으면 최근 완료 건 10개 조회
            const { data: cases } = await supabase
                .from('funeral_cases')
                .select('id')
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (cases && cases.length > 0) {
                query = query.in('case_id', cases.map(c => c.id));
            }
        }
        
        const { data, error } = await query;
        
        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        return new Response(JSON.stringify({
            total: data.length,
            photos: data
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
});
