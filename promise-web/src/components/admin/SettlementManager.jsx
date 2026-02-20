import React, { useState, useEffect } from 'react';
import { Search, DollarSign, CheckCircle, AlertCircle, Edit2, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SettlementManager() {
    const [settlements, setSettlements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'paid', 'completed'
    const [searchTerm, setSearchTerm] = useState('');

    // Edit Mode State
    const [editingId, setEditingId] = useState(null);
    const [editAmount, setEditAmount] = useState(0);
    const [editMemo, setEditMemo] = useState('');

    useEffect(() => {
        fetchSettlements();
    }, []);

    const fetchSettlements = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('settlements')
                .select(`
                    *,
                    funeral_cases (
                        package_name,
                        location,
                        team_leader_id
                    ),
                    profiles:recipient_id (
                        name,
                        role,
                        phone,
                        bank_account
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSettlements(data || []);
        } catch (error) {
            console.error('Error fetching settlements:', error);
            alert('정산 데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAmount = async (id) => {
        if (!confirm('금액을 수정하시겠습니까?')) return;

        try {
            const { error } = await supabase
                .from('settlements')
                .update({
                    amount: parseInt(editAmount),
                    admin_memo: editMemo
                })
                .eq('id', id);

            if (error) throw error;

            alert('수정되었습니다.');
            setEditingId(null);
            fetchSettlements();
        } catch (error) {
            console.error('Update error:', error);
            alert('수정 실패: ' + error.message);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        if (!confirm(`상태를 '${newStatus}'(으)로 변경하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('settlements')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            fetchSettlements();
        } catch (error) {
            console.error('Status update error:', error);
            alert('상태 변경 실패');
        }
    };

    // Filter Logic
    const filteredSettlements = settlements.filter(item => {
        const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
        const matchesSearch =
            item.profiles?.name?.includes(searchTerm) ||
            item.funeral_cases?.package_name?.includes(searchTerm);
        return matchesStatus && matchesSearch;
    });

    const getTypeLabel = (type) => {
        const map = {
            'dealer_commission': '딜러 수수료',
            'dealer_override': '마스터 오버라이딩',
            'leader_override': '팀장 오버라이딩',
            'usage_fee_remittance': '본사 입금(사용료)',
            'refund': '환불'
        };
        return map[type] || type;
    };

    return (
        <div className="space-y-6">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-gray-500 text-sm font-medium">지급 대기 (Pending)</h4>
                    <p className="text-2xl font-bold text-orange-600 mt-1">
                        ₩ {settlements.filter(s => s.status === 'pending' && s.type !== 'usage_fee_remittance').reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}
                    </p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-gray-500 text-sm font-medium">입금 예정 (사용료)</h4>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                        ₩ {settlements.filter(s => s.status === 'pending' && s.type === 'usage_fee_remittance').reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}
                    </p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-gray-500 text-sm font-medium">이번 달 완료</h4>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                        ₩ {settlements.filter(s => s.status === 'completed').reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex gap-2">
                    {['all', 'pending', 'paid', 'completed'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filterStatus === status
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            {status === 'all' ? '전체' : status === 'pending' ? '대기' : status === 'paid' ? '지급됨' : '완료'}
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="이름 또는 상품명 검색"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">접수번호 / 날짜</th>
                                <th className="px-6 py-4 font-medium">대상자 (역할)</th>
                                <th className="px-6 py-4 font-medium">구분</th>
                                <th className="px-6 py-4 font-medium">금액 (원)</th>
                                <th className="px-6 py-4 font-medium text-center">상태</th>
                                <th className="px-6 py-4 font-medium text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">로딩 중...</td></tr>
                            ) : filteredSettlements.length === 0 ? (
                                <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">내역이 없습니다.</td></tr>
                            ) : (
                                filteredSettlements.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-gray-500 text-xs mb-1">{item.case_id?.substring(0, 8) || '-'}</div>
                                            <div className="text-gray-400 text-xs">{new Date(item.created_at).toLocaleDateString()}</div>
                                        </td>

                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">{item.profiles?.name}</div>
                                            <div className="text-xs text-indigo-500 flex items-center gap-1">
                                                {item.profiles?.role}
                                                {item.recipient_id === item.funeral_cases?.team_leader_id && <span className="bg-indigo-100 px-1 rounded">담당팀장</span>}
                                            </div>
                                            {item.profiles?.bank_account && (
                                                <div className="text-xs text-gray-400 mt-1">{item.profiles.bank_account}</div>
                                            )}
                                        </td>

                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${item.type.includes('remittance')
                                                    ? 'bg-blue-50 text-blue-700'
                                                    : 'bg-orange-50 text-orange-700'
                                                }`}>
                                                {getTypeLabel(item.type)}
                                            </span>
                                            {item.package_name && <div className="text-xs text-gray-400 mt-1">{item.package_name}</div>}
                                        </td>

                                        <td className="px-6 py-4">
                                            {editingId === item.id ? (
                                                <div className="flex flex-col gap-2">
                                                    <input
                                                        type="number"
                                                        className="w-32 border border-indigo-300 rounded px-2 py-1 text-right font-bold"
                                                        value={editAmount}
                                                        onChange={(e) => setEditAmount(e.target.value)}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="w-32 border border-gray-300 rounded px-2 py-1 text-xs"
                                                        placeholder="변경 사유 메모"
                                                        value={editMemo}
                                                        onChange={(e) => setEditMemo(e.target.value)}
                                                    />
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="font-bold text-gray-900">₩ {item.amount.toLocaleString()}</div>
                                                    {item.admin_memo && (
                                                        <div className="text-xs text-red-500 mt-1">Memo: {item.admin_memo}</div>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.status === 'completed' || item.status === 'paid'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {item.status === 'pending' ? '대기' :
                                                    item.status === 'paid' ? '지급완료' : '처리완료'}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            {editingId === item.id ? (
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleUpdateAmount(item.id)} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" title="저장">
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="p-2 bg-gray-200 text-gray-600 rounded hover:bg-gray-300" title="취소">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    {item.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingId(item.id);
                                                                    setEditAmount(item.amount);
                                                                    setEditMemo(item.admin_memo || '');
                                                                }}
                                                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 px-2 py-1 rounded"
                                                            >
                                                                <Edit2 className="w-3 h-3" /> 수정
                                                            </button>

                                                            {item.type === 'usage_fee_remittance' ? (
                                                                <button
                                                                    onClick={() => handleStatusChange(item.id, 'completed')}
                                                                    className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 shadow-sm"
                                                                >
                                                                    <CheckCircle className="w-3 h-3" /> 입금확인
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleStatusChange(item.id, 'paid')}
                                                                    className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 shadow-sm"
                                                                >
                                                                    <DollarSign className="w-3 h-3" /> 지급처리
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-end">
                <button onClick={fetchSettlements} className="text-sm text-gray-500 hover:text-gray-900 underline">
                    데이터 새로고침
                </button>
            </div>
        </div>
    );
}
