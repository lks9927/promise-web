import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Key, Plus, Copy, Eye, EyeOff, Trash2, ToggleLeft, ToggleRight, Activity, Clock, Shield, AlertCircle, CheckCircle, Search, BookOpen, ExternalLink } from 'lucide-react';

export default function ApiKeyPanel({ isReadonly }) {
    const [keys, setKeys] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedKeyId, setSelectedKeyId] = useState(null);
    const [visibleKeys, setVisibleKeys] = useState({});
    const [logSearch, setLogSearch] = useState('');
    const [showGuide, setShowGuide] = useState(false);

    // Available permissions
    const PERMISSIONS = [
        { id: 'cases.read', label: '접수 조회', desc: '장례 접수 목록 열람' },
        { id: 'cases.write', label: '접수 등록', desc: '새 장례 접수 생성' },
        { id: 'photos.read', label: '사진 조회', desc: '현장 사진 열람' },
        { id: 'photos.write', label: '사진 업로드', desc: '현장 사진 등록' },
        { id: 'partners.read', label: '파트너 조회', desc: '파트너 정보 열람' },
        { id: 'settlements.read', label: '정산 조회', desc: '정산 내역 열람' },
        { id: 'status.read', label: '진행상황 조회', desc: '행사 진행 상태 확인' },
    ];

    useEffect(() => {
        fetchKeys();
    }, []);

    useEffect(() => {
        if (selectedKeyId) fetchLogs(selectedKeyId);
    }, [selectedKeyId]);

    const fetchKeys = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('api_keys')
            .select('*')
            .order('created_at', { ascending: false });
        setKeys(data || []);
        setLoading(false);
    };

    const fetchLogs = async (keyId) => {
        const { data } = await supabase
            .from('api_logs')
            .select('*')
            .eq('api_key_id', keyId)
            .order('created_at', { ascending: false })
            .limit(50);
        setLogs(data || []);
    };

    const generateApiKey = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const prefix = 'pk_';
        let key = prefix;
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    };

    const handleCreate = async (formData) => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const newKey = generateApiKey();

        const { error } = await supabase.from('api_keys').insert([{
            name: formData.name,
            api_key: newKey,
            permissions: formData.permissions,
            description: formData.description,
            daily_limit: formData.dailyLimit || 1000,
            expires_at: formData.expiresAt || null,
            created_by: user.id
        }]);

        if (error) {
            alert('키 생성 실패: ' + error.message);
            return;
        }

        alert(`✅ API 키가 생성되었습니다!\n\n키: ${newKey}\n\n⚠️ 이 키는 다시 볼 수 없습니다. 안전한 곳에 저장해주세요.`);
        setShowCreateModal(false);
        fetchKeys();
    };

    const handleToggleStatus = async (key) => {
        const newStatus = key.status === 'active' ? 'inactive' : 'active';
        const { error } = await supabase
            .from('api_keys')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', key.id);

        if (error) { alert('상태 변경 실패'); return; }
        fetchKeys();
    };

    const handleDelete = async (key) => {
        if (!confirm(`"${key.name}" API 키를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        const { error } = await supabase.from('api_keys').delete().eq('id', key.id);
        if (error) { alert('삭제 실패'); return; }
        if (selectedKeyId === key.id) setSelectedKeyId(null);
        fetchKeys();
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('📋 클립보드에 복사되었습니다!');
    };

    const toggleKeyVisibility = (keyId) => {
        setVisibleKeys(prev => ({ ...prev, [keyId]: !prev[keyId] }));
    };

    const maskKey = (key) => key.substring(0, 6) + '••••••••••••••••' + key.substring(key.length - 4);

    const getStatusBadge = (status) => {
        const map = {
            active: { color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" />, label: '활성' },
            inactive: { color: 'bg-gray-100 text-gray-600', icon: <AlertCircle className="w-3 h-3" />, label: '비활성' },
            revoked: { color: 'bg-red-100 text-red-700', icon: <AlertCircle className="w-3 h-3" />, label: '폐기' },
        };
        const s = map[status] || map.inactive;
        return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${s.color}`}>{s.icon}{s.label}</span>;
    };

    if (loading) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Key className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">API 키 관리</h3>
                        <p className="text-xs text-gray-500">외부 시스템 연동을 위한 API 키를 관리합니다</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowGuide(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors"
                    >
                        <BookOpen className="w-4 h-4" /> 사용법
                    </button>
                    {!isReadonly && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> 새 키 생성
                        </button>
                    )}
                </div>
            </div>

            {/* Key List */}
            <div className="space-y-3 mb-8">
                {keys.length === 0 ? (
                    <div className="py-16 text-center">
                        <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">등록된 API 키가 없습니다</p>
                        <p className="text-gray-400 text-sm mt-1">새 키를 생성하여 외부 시스템을 연동해보세요</p>
                    </div>
                ) : keys.map(key => (
                    <div key={key.id}
                        className={`bg-white border rounded-xl p-5 transition-all ${selectedKeyId === key.id ? 'border-indigo-300 shadow-md ring-2 ring-indigo-100' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-bold text-gray-800">{key.name}</span>
                                    {getStatusBadge(key.status)}
                                    {key.expires_at && new Date(key.expires_at) < new Date() && (
                                        <span className="text-xs text-red-500 font-bold">만료됨</span>
                                    )}
                                </div>

                                {/* API Key Display */}
                                <div className="flex items-center gap-2 mb-3">
                                    <code className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-mono text-gray-700 select-all">
                                        {visibleKeys[key.id] ? key.api_key : maskKey(key.api_key)}
                                    </code>
                                    <button onClick={() => toggleKeyVisibility(key.id)} className="text-gray-400 hover:text-gray-600 p-1">
                                        {visibleKeys[key.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => copyToClipboard(key.api_key)} className="text-gray-400 hover:text-indigo-600 p-1">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Permissions */}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {(key.permissions || []).map(perm => (
                                        <span key={perm} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                            <Shield className="w-3 h-3" />
                                            {PERMISSIONS.find(p => p.id === perm)?.label || perm}
                                        </span>
                                    ))}
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                    <span className="flex items-center gap-1">
                                        <Activity className="w-3 h-3" />
                                        요청 {key.request_count?.toLocaleString() || 0}회
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {key.last_used_at ? `마지막: ${new Date(key.last_used_at).toLocaleString('ko-KR')}` : '미사용'}
                                    </span>
                                    <span>일일 제한: {key.daily_limit?.toLocaleString()}회</span>
                                    {key.description && <span className="text-gray-500">| {key.description}</span>}
                                </div>
                            </div>

                            {/* Actions */}
                            {!isReadonly && (
                                <div className="flex items-center gap-2 ml-4">
                                    <button onClick={() => setSelectedKeyId(selectedKeyId === key.id ? null : key.id)}
                                        className={`p-2 rounded-lg transition-colors ${selectedKeyId === key.id ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                        title="사용 기록 보기"
                                    >
                                        <Activity className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleToggleStatus(key)}
                                        className={`p-2 rounded-lg transition-colors ${key.status === 'active' ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                        title={key.status === 'active' ? '비활성화' : '활성화'}
                                    >
                                        {key.status === 'active' ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                    </button>
                                    <button onClick={() => handleDelete(key)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="삭제"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Logs Section */}
            {selectedKeyId && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-600" />
                            사용 기록 — {keys.find(k => k.id === selectedKeyId)?.name}
                        </h4>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="엔드포인트 검색..."
                                value={logSearch}
                                onChange={e => setLogSearch(e.target.value)}
                                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-56"
                            />
                        </div>
                    </div>

                    {logs.length === 0 ? (
                        <p className="text-center text-gray-400 py-8 text-sm">아직 사용 기록이 없습니다</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 border-b">
                                        <th className="py-2 px-3 font-medium">시간</th>
                                        <th className="py-2 px-3 font-medium">메서드</th>
                                        <th className="py-2 px-3 font-medium">엔드포인트</th>
                                        <th className="py-2 px-3 font-medium">상태</th>
                                        <th className="py-2 px-3 font-medium">응답시간</th>
                                        <th className="py-2 px-3 font-medium">IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs
                                        .filter(l => !logSearch || l.endpoint?.includes(logSearch))
                                        .map(log => (
                                        <tr key={log.id} className="border-b border-gray-100 hover:bg-white transition-colors">
                                            <td className="py-2 px-3 text-gray-500 whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </td>
                                            <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${log.method === 'GET' ? 'bg-blue-100 text-blue-700' : log.method === 'POST' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {log.method}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 font-mono text-xs text-gray-700">{log.endpoint}</td>
                                            <td className="py-2 px-3">
                                                <span className={`font-bold ${log.status_code < 400 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {log.status_code}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-gray-500">{log.duration_ms}ms</td>
                                            <td className="py-2 px-3 text-gray-400 text-xs">{log.ip_address || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && <CreateKeyModal permissions={PERMISSIONS} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />}

            {/* Guide Modal */}
            {showGuide && <ApiGuideModal onClose={() => setShowGuide(false)} />}
        </div>
    );
}

function CreateKeyModal({ permissions, onClose, onCreate }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedPerms, setSelectedPerms] = useState([]);
    const [dailyLimit, setDailyLimit] = useState(1000);
    const [hasExpiry, setHasExpiry] = useState(false);
    const [expiresAt, setExpiresAt] = useState('');

    const togglePerm = (permId) => {
        setSelectedPerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) { alert('키 이름을 입력해주세요.'); return; }
        if (selectedPerms.length === 0) { alert('최소 1개 이상의 권한을 선택해주세요.'); return; }

        onCreate({
            name: name.trim(),
            description: description.trim(),
            permissions: selectedPerms,
            dailyLimit,
            expiresAt: hasExpiry && expiresAt ? new Date(expiresAt).toISOString() : null
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Key className="w-5 h-5 text-indigo-600" /> 새 API 키 생성
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">키 이름 <span className="text-red-500">*</span></label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 홍보자동화, 제휴사A" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">설명 (메모)</label>
                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="이 키의 용도를 간단히 작성" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">권한 선택 <span className="text-red-500">*</span></label>
                        <div className="grid grid-cols-2 gap-2">
                            {permissions.map(perm => (
                                <label key={perm.id} className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedPerms.includes(perm.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input type="checkbox" checked={selectedPerms.includes(perm.id)} onChange={() => togglePerm(perm.id)} className="w-4 h-4 accent-indigo-600" />
                                    <div>
                                        <div className="text-sm font-bold text-gray-800">{perm.label}</div>
                                        <div className="text-xs text-gray-500">{perm.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">일일 요청 제한</label>
                            <input type="number" value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" min={1} />
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-1">
                                <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="accent-indigo-600" />
                                만료일 설정
                            </label>
                            {hasExpiry && (
                                <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50">취소</button>
                        <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">키 생성</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ApiGuideModal({ onClose }) {
    const [activeSection, setActiveSection] = useState('overview');
    const API_URL = 'https://pfwiaaxkgwhdjpdjlwjd.supabase.co/functions/v1/api-gateway';

    const copyCode = (text) => {
        navigator.clipboard.writeText(text);
        alert('📋 복사되었습니다!');
    };

    const sections = [
        { id: 'overview', label: '개요' },
        { id: 'auth', label: '인증 방법' },
        { id: 'actions', label: '지원 액션' },
        { id: 'examples', label: '호출 예시' },
        { id: 'errors', label: '에러 코드' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-5 border-b bg-gradient-to-r from-indigo-600 to-purple-600 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5" /> API 사용 가이드
                    </h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">&times;</button>
                </div>

                {/* Section Tabs */}
                <div className="flex border-b bg-gray-50 px-4 pt-3 gap-1">
                    {sections.map(s => (
                        <button key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${
                                activeSection === s.id
                                    ? 'bg-white text-indigo-600 border border-b-0 border-gray-200'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >{s.label}</button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto">

                    {/* ── 개요 ── */}
                    {activeSection === 'overview' && (
                        <div className="space-y-4">
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                                <h4 className="font-bold text-indigo-800 mb-2">📡 API Gateway 엔드포인트</h4>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-white px-4 py-2.5 rounded-lg text-sm font-mono text-gray-800 border select-all">
                                        {API_URL}
                                    </code>
                                    <button onClick={() => copyCode(API_URL)} className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-green-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl mb-1">🔐</div>
                                    <div className="text-sm font-bold text-green-800">API 키 인증</div>
                                    <div className="text-xs text-green-600 mt-1">x-api-key 헤더</div>
                                </div>
                                <div className="bg-blue-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl mb-1">📋</div>
                                    <div className="text-sm font-bold text-blue-800">권한 기반 접근</div>
                                    <div className="text-xs text-blue-600 mt-1">키별 개별 권한 설정</div>
                                </div>
                                <div className="bg-purple-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl mb-1">📊</div>
                                    <div className="text-sm font-bold text-purple-800">자동 로그 기록</div>
                                    <div className="text-xs text-purple-600 mt-1">모든 요청 자동 추적</div>
                                </div>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <p className="text-sm text-amber-800">⚠️ <strong>모든 요청은 POST</strong>로 보내야 합니다. Body에 <code className="bg-amber-100 px-1 rounded">action</code>과 <code className="bg-amber-100 px-1 rounded">params</code>를 포함합니다.</p>
                            </div>
                        </div>
                    )}

                    {/* ── 인증 방법 ── */}
                    {activeSection === 'auth' && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800">🔑 인증 방법</h4>
                            <p className="text-sm text-gray-600">모든 API 요청에는 <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-indigo-600">x-api-key</code> 헤더가 필요합니다.</p>
                            <CodeBlock title="요청 헤더 예시" code={`POST ${API_URL}\nContent-Type: application/json\nx-api-key: pk_여기에_발급받은_키_입력`} onCopy={copyCode} />
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <p className="text-sm text-red-800">🚫 <strong>주의사항</strong></p>
                                <ul className="text-sm text-red-700 mt-2 space-y-1 list-disc list-inside">
                                    <li>API 키를 프론트엔드 코드에 노출하지 마세요</li>
                                    <li>키가 유출된 경우 즉시 비활성화 후 새 키를 발급하세요</li>
                                    <li>일일 요청 제한을 초과하면 자동 차단됩니다</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* ── 지원 액션 ── */}
                    {activeSection === 'actions' && (
                        <div className="space-y-3">
                            <h4 className="font-bold text-gray-800 mb-3">📋 지원 액션 목록</h4>
                            {[
                                { action: 'cases.read', perm: '접수 조회', desc: '장례 접수 목록을 조회합니다', params: 'limit (선택), status (선택)' },
                                { action: 'cases.write', perm: '접수 등록', desc: '새 장례 접수를 생성합니다', params: 'customer_name (필수), customer_phone (필수), deceased_name, funeral_hall, memo' },
                                { action: 'photos.read', perm: '사진 조회', desc: '행사 현장 사진을 조회합니다', params: 'case_id (필수)' },
                                { action: 'partners.read', perm: '파트너 조회', desc: '승인된 파트너 목록을 조회합니다', params: '없음' },
                                { action: 'settlements.read', perm: '정산 조회', desc: '정산 내역을 조회합니다', params: 'limit (선택), status (선택)' },
                                { action: 'status.read', perm: '진행상황 조회', desc: '특정 행사의 진행 상태를 확인합니다', params: 'case_id (필수)' },
                            ].map(item => (
                                <div key={item.action} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition-colors">
                                    <div className="flex items-center justify-between mb-1">
                                        <code className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-sm font-bold">{item.action}</code>
                                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">권한: {item.perm}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-1">{item.desc}</p>
                                    <p className="text-xs text-gray-400">params: {item.params}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── 호출 예시 ── */}
                    {activeSection === 'examples' && (
                        <div className="space-y-5">
                            <h4 className="font-bold text-gray-800">💻 호출 예시</h4>
                            
                            <CodeBlock title="1. 접수 목록 조회 (최근 5건)" code={`curl -X POST ${API_URL} \\\n  -H "x-api-key: pk_발급받은키" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "cases.read", "params": {"limit": 5}}'`} onCopy={copyCode} />
                            
                            <CodeBlock title="2. 새 접수 등록" code={`curl -X POST ${API_URL} \\\n  -H "x-api-key: pk_발급받은키" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "action": "cases.write",\n    "params": {\n      "customer_name": "김철수",\n      "customer_phone": "010-1234-5678",\n      "deceased_name": "김영수",\n      "funeral_hall": "서울성모병원 장례식장"\n    }\n  }'`} onCopy={copyCode} />

                            <CodeBlock title="3. JavaScript (fetch)" code={`const response = await fetch(\n  '${API_URL}',\n  {\n    method: 'POST',\n    headers: {\n      'Content-Type': 'application/json',\n      'x-api-key': 'pk_발급받은키'\n    },\n    body: JSON.stringify({\n      action: 'cases.read',\n      params: { limit: 10 }\n    })\n  }\n);\nconst data = await response.json();\nconsole.log(data);`} onCopy={copyCode} />

                            <CodeBlock title="4. Python (requests)" code={`import requests\n\nresponse = requests.post(\n    '${API_URL}',\n    headers={\n        'Content-Type': 'application/json',\n        'x-api-key': 'pk_발급받은키'\n    },\n    json={\n        'action': 'status.read',\n        'params': {'case_id': 'uuid-여기에-케이스-id'}\n    }\n)\nprint(response.json())`} onCopy={copyCode} />
                        </div>
                    )}

                    {/* ── 에러 코드 ── */}
                    {activeSection === 'errors' && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800">⚠️ 에러 코드</h4>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b-2 border-gray-200">
                                        <th className="py-2 px-3 font-bold">코드</th>
                                        <th className="py-2 px-3 font-bold">의미</th>
                                        <th className="py-2 px-3 font-bold">원인</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { code: 200, color: 'text-green-600', label: '성공', desc: '요청이 정상 처리됨' },
                                        { code: 201, color: 'text-green-600', label: '생성 성공', desc: '새 리소스가 생성됨 (접수 등록 등)' },
                                        { code: 400, color: 'text-amber-600', label: '잘못된 요청', desc: 'JSON 파싱 실패, action 누락, 필수 파라미터 부족' },
                                        { code: 401, color: 'text-red-500', label: 'API 키 없음', desc: 'x-api-key 헤더가 포함되지 않음' },
                                        { code: 403, color: 'text-red-500', label: '인증 실패', desc: '잘못된 키 / 비활성 키 / 만료된 키 / 권한 없음' },
                                        { code: 500, color: 'text-red-700', label: '서버 오류', desc: '내부 처리 중 오류 발생' },
                                    ].map(row => (
                                        <tr key={row.code} className="border-b border-gray-100">
                                            <td className={`py-2.5 px-3 font-bold font-mono ${row.color}`}>{row.code}</td>
                                            <td className="py-2.5 px-3 font-bold text-gray-800">{row.label}</td>
                                            <td className="py-2.5 px-3 text-gray-600">{row.desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <p className="text-sm text-gray-700 font-bold mb-1">📌 응답 형식 (JSON)</p>
                                <pre className="bg-gray-800 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">{`// 성공 시\n{"cases": [...], "count": 5}\n\n// 에러 시\n{"error": "이 키에는 'cases.write' 권한이 없습니다."}`}</pre>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 text-right">
                    <button onClick={onClose} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">닫기</button>
                </div>
            </div>
        </div>
    );
}

function CodeBlock({ title, code, onCopy }) {
    return (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <span className="text-xs font-bold text-gray-400">{title}</span>
                <button onClick={() => onCopy(code)} className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors">
                    <Copy className="w-3 h-3" /> 복사
                </button>
            </div>
            <pre className="p-4 text-sm font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">{code}</pre>
        </div>
    );
}
