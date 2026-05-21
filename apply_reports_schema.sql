-- 1. profiles 테이블 임선장/소개글 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS introduction TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;

-- 2. 장례 진행 단계별 보고서 테이블 신설
CREATE TABLE IF NOT EXISTS funeral_progress_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES funeral_cases(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_grade TEXT,
    stage_number INTEGER NOT NULL CHECK (stage_number >= 1 AND stage_number <= 6),
    stage_name TEXT NOT NULL,
    content TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 정책 추가
ALTER TABLE funeral_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "보고서는 누구나 열람 가능 (해당 건 관련자만 보게 앱 내 제어)"
ON funeral_progress_reports FOR SELECT
USING (true);

CREATE POLICY "보고서는 팀장 이상 작성 가능"
ON funeral_progress_reports FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = author_id AND profiles.role IN ('leader', 'admin', 'master')
  )
);

CREATE POLICY "보고서는 작성자만 수정 가능"
ON funeral_progress_reports FOR UPDATE
USING (auth.uid() = author_id);

CREATE POLICY "보고서는 작성자만 삭제 가능"
ON funeral_progress_reports FOR DELETE
USING (auth.uid() = author_id);

-- 3. 스토리지 버킷 'reports' 생성 (아직 없다면)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('reports', 'reports', true)
ON CONFLICT (id) DO NOTHING;

-- reports 버킷 정책
CREATE POLICY "Public Access to reports"
ON storage.objects FOR SELECT
USING ( bucket_id = 'reports' );

CREATE POLICY "Users can upload reports"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'reports' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update their reports"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'reports' AND auth.uid() = owner );

CREATE POLICY "Users can delete their reports"
ON storage.objects FOR DELETE
USING ( bucket_id = 'reports' AND auth.uid() = owner );
