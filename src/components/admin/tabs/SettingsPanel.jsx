import React, { useEffect, useState } from 'react';
import { useNotification } from '../../../contexts/NotificationContext';
import { supabase } from '../../../lib/supabase';
import { Truck, Bell, Palette, Lock } from 'lucide-react';

// Modular Components
import { PasswordResetRequests } from './settings/PasswordResetRequests';
import { DispatchSettings } from './settings/DispatchSettings';
import { DispatchOrderSettings } from './settings/DispatchOrderSettings';
import { GeneralSettings } from './settings/GeneralSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { BiddingSettings } from './settings/BiddingSettings';
import { FooterSettings } from './settings/FooterSettings';
import { SiteImageSettings } from './settings/SiteImageSettings';
import { AdminPasswordSettings } from './settings/AdminPasswordSettings';
import { RegionalAlertSettings } from './settings/RegionalAlertSettings';
import { FamilyBenefitSettings } from './settings/FamilyBenefitSettings';

const TABS = [
    { key: 'dispatch', label: '배차 운영', icon: Truck },
    { key: 'general', label: '알림 & 운영', icon: Bell },
    { key: 'site', label: '사이트 관리', icon: Palette },
    { key: 'security', label: '보안', icon: Lock },
];

export default function SettingsPanel({ config, onUpdate, passwordRequests, onApproveReset, partners }) {
    const { showToast } = useNotification();
    const [activeTab, setActiveTab] = useState('dispatch');
    const [missingLeaderDocs, setMissingLeaderDocs] = useState(0);

    useEffect(() => {
        supabase.rpc('admin_get_leader_docs_status').then(({ data }) => {
            if (data) setMissingLeaderDocs(data.filter(row => row.enforced && !row.docs_ok).length);
        });
    }, [config.leader_docs_required]);

    const setLeaderDocsMode = async (mode) => {
        if (mode === 'all' && missingLeaderDocs > 0 && !window.confirm(`전체 적용 시 미등록 팀장 ${missingLeaderDocs}명이 배정 후보에서 제외됩니다. 계속하시겠습니까?`)) return;
        const { error } = await supabase.rpc('set_leader_docs_required', { p_mode: mode });
        if (error) { showToast('error', '설정 변경 실패', error.message); return; }
        showToast('success', '설정 변경', '팀장 서류 적용 범위를 변경했습니다.');
        onUpdate();
    };

    const toggleConfig = async (key, currentValue, overrideNewValue = null) => {
        const safeValue = currentValue || 'false';
        let newValue = safeValue === 'true' ? 'false' : 'true';
        if (overrideNewValue) {
            newValue = overrideNewValue;
        }

        const { error } = await supabase.from('system_config').upsert({ key, value: newValue });
        if (error) {
            showToast('error', '설정 변경 실패', error.message);
            return;
        }
        showToast('success', '설정 변경', '설정이 변경되었습니다.');
        onUpdate();
    };

    // 비밀번호 초기화 요청이 있으면 보안 탭에 뱃지 표시
    const securityBadge = passwordRequests?.length || 0;

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* 탭 네비게이션 */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-1 justify-center
                                ${isActive
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {tab.key === 'security' && securityBadge > 0 && (
                                <span className="ml-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                                    {securityBadge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="space-y-6">
                {activeTab === 'dispatch' && (
                    <>
                        <DispatchSettings
                            config={config}
                            toggleConfig={toggleConfig}
                            onUpdate={onUpdate}
                        />
                        {(config.dispatch_mode === 'sequential' || config.dispatch_mode === 'team_hybrid' || true) && (
                            <DispatchOrderSettings
                                config={config}
                                onUpdate={onUpdate}
                                partners={partners}
                            />
                        )}
                        <BiddingSettings config={config} onUpdate={onUpdate} />
                        <RegionalAlertSettings config={config} onUpdate={onUpdate} />
                        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <h3 className="font-bold text-amber-900">팀장 서류·계좌 적용 범위</h3>
                            <p className="mt-1 text-xs text-amber-800">사업자등록증과 은행·계좌번호·예금주가 모두 없는 팀장은 승인·자동 배정에서 제외됩니다. 현재 적용 대상 중 미등록: <b>{missingLeaderDocs}명</b></p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                {[['off', '끄기'], ['new_only', '신규만'], ['all', '전체']].map(([mode, label]) => (
                                    <button key={mode} onClick={() => setLeaderDocsMode(mode)} className={`rounded-lg px-2 py-2 text-sm font-bold ${config.leader_docs_required === mode ? 'bg-amber-600 text-white' : 'bg-white text-amber-900 border border-amber-300'}`}>{label}</button>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] text-amber-800">신규만은 기존 승인 팀장을 면제하고 이후 가입·승인 팀장부터 적용합니다. 전체는 기존 면제와 무관하게 모두 적용합니다.</p>
                        </section>
                        <FamilyBenefitSettings config={config} onUpdate={onUpdate} />
                    </>
                )}

                {activeTab === 'general' && (
                    <>
                        <NotificationSettings
                            config={config}
                            toggleConfig={toggleConfig}
                            onUpdate={onUpdate}
                        />
                        <GeneralSettings
                            config={config}
                            toggleConfig={toggleConfig}
                            onUpdate={onUpdate}
                        />
                    </>
                )}

                {activeTab === 'site' && (
                    <>
                        <FooterSettings config={config} onUpdate={onUpdate} />
                        <SiteImageSettings config={config} onUpdate={onUpdate} />
                    </>
                )}

                {activeTab === 'security' && (
                    <>
                        <PasswordResetRequests
                            passwordRequests={passwordRequests}
                            onApproveReset={onApproveReset}
                        />
                        <AdminPasswordSettings />
                    </>
                )}
            </div>
        </div>
    );
}
