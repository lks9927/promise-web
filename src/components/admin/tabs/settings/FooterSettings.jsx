import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function FooterSettings({ config, onUpdate }) {
    const { showToast } = useNotification();
    const [footerData, setFooterData] = useState({
        phone: config.footer_phone || '1588-0000',
        hours: config.footer_hours || '24시간 연중무휴',
        email: config.footer_email || 'help@promise10.com',
        company_name: config.footer_company_name || '',
        ceo_name: config.footer_ceo_name || '',
        business_number: config.footer_business_number || '',
        address: config.footer_address || '',
        mail_order: config.footer_mail_order || ''
    });

    useEffect(() => {
        setFooterData({
            phone: config.footer_phone || '1588-0000',
            hours: config.footer_hours || '24시간 연중무휴',
            email: config.footer_email || 'help@promise10.com',
            company_name: config.footer_company_name || '',
            ceo_name: config.footer_ceo_name || '',
            business_number: config.footer_business_number || '',
            address: config.footer_address || '',
            mail_order: config.footer_mail_order || ''
        });
    }, [config]);

    const handleSave = async () => {
        await Promise.all([
            supabase.from('system_config').upsert({ key: 'footer_phone', value: footerData.phone }),
            supabase.from('system_config').upsert({ key: 'footer_hours', value: footerData.hours }),
            supabase.from('system_config').upsert({ key: 'footer_email', value: footerData.email }),
            supabase.from('system_config').upsert({ key: 'footer_company_name', value: footerData.company_name }),
            supabase.from('system_config').upsert({ key: 'footer_ceo_name', value: footerData.ceo_name }),
            supabase.from('system_config').upsert({ key: 'footer_business_number', value: footerData.business_number }),
            supabase.from('system_config').upsert({ key: 'footer_address', value: footerData.address }),
            supabase.from('system_config').upsert({ key: 'footer_mail_order', value: footerData.mail_order })
        ]);
        onUpdate();
        showToast('success', '저장 완료', '푸터 정보가 업데이트 되었습니다.');
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" /> 홈 화면 푸터 고객센터 정보
            </h4>
            <p className="text-xs text-gray-400 mb-6">랜딩 페이지 하단에 고정적으로 표시되는 고객센터 정보를 변경합니다.</p>
            <div className="space-y-4 mb-4">
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">상호명</label>
                        <input type="text" placeholder="(주)십년의약속" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.company_name} onChange={e => setFooterData({...footerData, company_name: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">대표자명</label>
                        <input type="text" placeholder="홍길동" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.ceo_name} onChange={e => setFooterData({...footerData, ceo_name: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">사업자등록번호</label>
                        <input type="text" placeholder="123-45-67890" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.business_number} onChange={e => setFooterData({...footerData, business_number: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">추가 정보 (선택)</label>
                        <input type="text" placeholder="통신판매업: 제2026-서울강남-1234호 등" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.mail_order} onChange={e => setFooterData({...footerData, mail_order: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4 md:col-span-2">
                        <label className="w-24 font-bold text-sm text-gray-700">주소</label>
                        <input type="text" placeholder="서울시 강남구 테헤란로..." className="flex-1 px-4 py-2 border rounded-lg" value={footerData.address} onChange={e => setFooterData({...footerData, address: e.target.value})} />
                    </div>
                </div>

                <hr className="my-4 border-gray-100" />
                
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">대표전화</label>
                        <input type="text" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.phone} onChange={e => setFooterData({...footerData, phone: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="w-24 font-bold text-sm text-gray-700">운영시간</label>
                        <input type="text" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.hours} onChange={e => setFooterData({...footerData, hours: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4 md:col-span-2">
                        <label className="w-24 font-bold text-sm text-gray-700">이메일</label>
                        <input type="email" className="flex-1 px-4 py-2 border rounded-lg" value={footerData.email} onChange={e => setFooterData({...footerData, email: e.target.value})} />
                    </div>
                </div>
            </div>
            <div className="flex justify-end">
                 <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                    업데이트
                </button>
            </div>
        </div>
    );
}
