import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Send, Users, User, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function AdminMessageTab({ partners }) {
    const { showToast } = useNotification();
    const [targetType, setTargetType] = useState('all'); // all, group, master_team, specific
    const [targetGroup, setTargetGroup] = useState('leader'); // leader, master_leader, dealer, master_dealer
    const [targetMasterId, setTargetMasterId] = useState('');
    const [targetPartnerId, setTargetPartnerId] = useState('');
    const [messageTitle, setMessageTitle] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Filter masters for the dropdown
    const masters = partners.filter(p => p.grade === 'Master' || p.grade === 'S');

    const handleSend = async (e) => {
        e.preventDefault();

        if (!messageTitle.trim() || !messageContent.trim()) {
            showToast('warning', '입력 오류', '메시지 제목과 내용을 모두 입력해주세요.');
            return;
        }

        if (!confirm('메시지를 발송하시겠습니까?')) return;

        setIsSending(true);

        try {
            let targetUserIds = [];

            if (targetType === 'all') {
                targetUserIds = partners.map(p => p.user_id);
            } else if (targetType === 'group') {
                targetUserIds = partners.filter(p => {
                    if (targetGroup === 'leader') return p.profiles?.role === 'leader' && p.grade !== 'Master' && p.grade !== 'S';
                    if (targetGroup === 'master_leader') return p.profiles?.role === 'leader' && (p.grade === 'Master' || p.grade === 'S');
                    if (targetGroup === 'dealer') return ['dealer', 'morning', 'meal'].includes(p.profiles?.role) && p.grade !== 'Master' && p.grade !== 'S';
                    if (targetGroup === 'master_dealer') return ['dealer', 'morning', 'meal'].includes(p.profiles?.role) && (p.grade === 'Master' || p.grade === 'S');
                    return false;
                }).map(p => p.user_id);
            } else if (targetType === 'master_team') {
                if (!targetMasterId) throw new Error('마스터를 선택해주세요.');
                targetUserIds = partners.filter(p => p.master_id === targetMasterId).map(p => p.user_id);
            } else if (targetType === 'specific') {
                if (!targetPartnerId) throw new Error('수신자를 선택해주세요.');
                targetUserIds = [targetPartnerId];
            }

            if (targetUserIds.length === 0) {
                showToast('warning', '발송 취소', '선택한 조건에 해당하는 수신자가 없습니다.');
                setIsSending(false);
                return;
            }

            // Insert notifications
            const notificationsToInsert = targetUserIds.map(userId => ({
                user_id: userId,
                type: 'info',
                title: messageTitle,
                message: messageContent
            }));

            const { error } = await supabase.from('notifications').insert(notificationsToInsert);

            if (error) throw error;

            showToast('success', '발송 완료', `총 ${targetUserIds.length}명에게 메시지를 성공적으로 발송했습니다.`);

            // Reset form
            setMessageTitle('');
            setMessageContent('');
        } catch (error) {
            console.error('Send message error:', error);
            showToast('error', '발송 실패', error.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Send className="w-5 h-5 text-indigo-600" />
                        메시지 일괄/개별 발송
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        전체 파트너 혹은 특정 그룹/개인에게 시스템 알림 메시지를 보냅니다.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSend} className="p-6 space-y-6">

                {/* 1. Target Selection */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500" /> 수신 대상 범위 선택
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {['all', 'group', 'master_team', 'specific'].map((type) => (
                            <label key={type} className={`
                                cursor-pointer flex justify-center items-center py-3 px-2 rounded-xl border-2 transition-all text-sm font-bold text-center
                                ${targetType === type ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'}
                            `}>
                                <input
                                    type="radio"
                                    name="targetType"
                                    value={type}
                                    checked={targetType === type}
                                    onChange={() => setTargetType(type)}
                                    className="hidden"
                                />
                                {type === 'all' && '전체 파트너'}
                                {type === 'group' && '역할별 그룹'}
                                {type === 'master_team' && '특정 본부(마스터) 팀'}
                                {type === 'specific' && '특정 인원 (1명)'}
                            </label>
                        ))}
                    </div>

                    {/* Conditional Selectors */}
                    <div className="pt-2">
                        {targetType === 'group' && (
                            <select
                                value={targetGroup}
                                onChange={(e) => setTargetGroup(e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="leader">일반 팀장 전체</option>
                                <option value="master_leader">마스터 팀장 전체 (본부장)</option>
                                <option value="dealer">일반 딜러 전체</option>
                                <option value="master_dealer">마스터 딜러 전체 (본부장)</option>
                            </select>
                        )}

                        {targetType === 'master_team' && (
                            <select
                                value={targetMasterId}
                                onChange={(e) => setTargetMasterId(e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">마스터(본부장)를 선택하세요</option>
                                {masters.map(m => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.profiles?.name} ({m.profiles?.role === 'leader' ? '마스터 팀장' : '마스터 딜러'}) - 지점
                                    </option>
                                ))}
                            </select>
                        )}

                        {targetType === 'specific' && (
                            <select
                                value={targetPartnerId}
                                onChange={(e) => setTargetPartnerId(e.target.value)}
                                className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">수신할 파트너를 선택하세요</option>
                                {partners.map(p => (
                                    <option key={p.user_id} value={p.user_id}>
                                        [{p.profiles?.role === 'leader' ? '팀장' : (['dealer', 'morning', 'meal'].includes(p.profiles?.role) ? '딜러' : p.profiles?.role)}] {p.profiles?.name} ({p.profiles?.phone})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* 2. Message Content */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">메시지 제목</label>
                        <input
                            type="text"
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="예: 긴급 공지, 시스템 점검 안내 등"
                            value={messageTitle}
                            onChange={(e) => setMessageTitle(e.target.value)}
                            maxLength={50}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">메시지 내용</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                            placeholder="발송할 내용을 입력하세요."
                            value={messageContent}
                            onChange={(e) => setMessageContent(e.target.value)}
                            maxLength={500}
                        ></textarea>
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isSending}
                    className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-md hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isSending ? (
                        <>발송 중...</>
                    ) : (
                        <><Send className="w-5 h-5" /> 메세지 보내기</>
                    )}
                </button>
            </form>
        </div>
    );
}
