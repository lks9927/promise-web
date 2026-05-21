import React, { useState } from 'react';
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

const TABS = [
    { key: 'dispatch', label: '배차 운영', icon: Truck },
    { key: 'general', label: '알림 & 운영', icon: Bell },
    { key: 'site', label: '사이트 관리', icon: Palette },
    { key: 'security', label: '보안', icon: Lock },
];

export default function SettingsPanel({ config, onUpdate, passwordRequests, onApproveReset, partners }) {
    const { showToast } = useNotification();
    const [activeTab, setActiveTab] = useState('dispatch');

    const toggleConfig = async (key, currentValue, overrideNewValue = null) => {
        const safeValue = currentValue || 'false';
        let newValue = safeValue === 'true' ? 'false' : 'true';
        if (overrideNewValue) {
            newValue = overrideNewValue;
        }

        await supabase.from('system_config').upsert({ key, value: newValue });
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
