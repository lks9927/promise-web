import React from 'react';
import { Lock } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function AdminPasswordSettings() {
    const { showToast } = useNotification();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const newPw = e.target.newPw.value;
        const confirmPw = e.target.confirmPw.value;

        if (newPw !== confirmPw) {
            showToast('error', '오류', '비밀번호가 일치하지 않습니다.');
            return;
        }
        if (newPw.length < 4) {
            showToast('error', '오류', '비밀번호는 4자리 이상이어야 합니다.');
            return;
        }

        const user = JSON.parse(localStorage.getItem('user'));
        if (!user) return;

        if (confirm('비밀번호를 변경하시겠습니까?')) {
            const { error } = await supabase
                .from('profiles')
                .update({ password: newPw })
                .eq('id', user.id);

            if (error) {
                showToast('error', '오류', '변경 중 오류가 발생했습니다.');
            } else {
                alert('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-600" /> 관리자 비밀번호 변경
            </h4>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    name="newPw"
                    type="password"
                    placeholder="새 비밀번호"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                <input
                    name="confirmPw"
                    type="password"
                    placeholder="비밀번호 확인"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                <button
                    type="submit"
                    className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors"
                >
                    변경
                </button>
            </form>
        </div>
    );
}
