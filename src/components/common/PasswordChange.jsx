import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';

// 로그인한 사용자가 스스로 비밀번호를 바꾸는 카드. 비밀번호는 Supabase Auth 가 관리한다.
// 현재 비밀번호를 다시 확인한 뒤 바꾼다(남이 열어 둔 화면에서 함부로 바꾸지 못하게).
export default function PasswordChange({ phone }) {
    const { showToast } = useNotification();
    const [form, setForm] = useState({ current: '', next: '', confirm: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.current || !form.next || !form.confirm) {
            showToast('error', '입력 오류', '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.');
            return;
        }
        if (form.next.length < 6) {
            showToast('error', '입력 오류', '새 비밀번호는 6자리 이상이어야 합니다.');
            return;
        }
        if (form.next !== form.confirm) {
            showToast('error', '입력 오류', '새 비밀번호가 서로 일치하지 않습니다.');
            return;
        }
        if (form.next === form.current) {
            showToast('error', '입력 오류', '현재 비밀번호와 다른 비밀번호를 입력해주세요.');
            return;
        }
        const last6 = (phone || '').replace(/[^0-9]/g, '').slice(-6);
        if (last6 && form.next === last6) {
            showToast('error', '입력 오류', '전화번호 끝 6자리는 쉽게 알아낼 수 있어 사용할 수 없습니다.');
            return;
        }

        try {
            setSaving(true);
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser?.email) throw new Error('로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.');

            // 현재 비밀번호 확인
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: authUser.email,
                password: form.current,
            });
            if (verifyError) {
                showToast('error', '확인 실패', '현재 비밀번호가 일치하지 않습니다.');
                return;
            }

            const { error } = await supabase.auth.updateUser({ password: form.next });
            if (error) throw error;

            setForm({ current: '', next: '', confirm: '' });
            showToast('success', '변경 완료', '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
        } catch (err) {
            console.error('비밀번호 변경 오류:', err);
            showToast('error', '변경 실패', err.message || '비밀번호 변경 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const inputClass = 'w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium';

    return (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 mt-4">
            <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                <Lock className="w-5 h-5 text-indigo-600" /> 비밀번호 변경
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">현재 비밀번호</label>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={form.current}
                        onChange={(e) => setForm({ ...form, current: e.target.value })}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">새 비밀번호 (6자리 이상)</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={form.next}
                        onChange={(e) => setForm({ ...form, next: e.target.value })}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">새 비밀번호 확인</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={form.confirm}
                        onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                        className={inputClass}
                    />
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                    비밀번호 변경
                </button>
            </form>
        </div>
    );
}
