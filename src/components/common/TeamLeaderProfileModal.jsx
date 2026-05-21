import React, { useState } from 'react';
import { User, XCircle, Award, Briefcase, Phone, FileBadge, ZoomIn } from 'lucide-react';

export default function TeamLeaderProfileModal({ isOpen, onClose, leaderProfile, isMasked = false }) {
    if (!isOpen || !leaderProfile) return null;

    const {
        name,
        role,
        grade,
        avatar_url,
        certificate_url,
        business_license_url,
        experience_years,
        introduction,
        phone
    } = leaderProfile;

    const [certZoomed, setCertZoomed] = useState(false);
    const [bizZoomed, setBizZoomed] = useState(false);

    const maskName = (n) => n ? (n.length <= 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]) : '';
    const displayName = isMasked ? maskName(name) : name;
    const maskedPhone = isMasked && phone ? phone.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-****') : phone;

    const getRoleBadge = () => {
        if (role === 'admin' || role === 'master') return <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded">본사 마스터</span>;
        if (grade === 'Master') return <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">마스터 팀장</span>;
        return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">전문 팀장</span>;
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 animate-fadeIn p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
                    <div className="relative h-24 bg-gradient-to-r from-indigo-500 to-purple-600">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-1 transition-colors"
                        >
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="px-6 pb-6 pt-0 relative">
                        <div className="flex justify-center -mt-12 mb-4">
                            <div className="w-24 h-24 rounded-full border-4 border-white bg-gray-100 shadow-md overflow-hidden flex items-center justify-center">
                                {avatar_url ? (
                                    <img src={avatar_url} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-12 h-12 text-gray-300" />
                                )}
                            </div>
                        </div>

                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-gray-900 mb-1 flex justify-center items-center gap-2">
                                {displayName}
                            </h3>
                            <div className="flex justify-center mb-3">
                                {getRoleBadge()}
                            </div>

                            {experience_years > 0 && (
                                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-600 font-medium bg-gray-50 inline-flex px-3 py-1.5 rounded-lg border border-gray-100 mx-auto">
                                    <Award className="w-4 h-4 text-indigo-500" />
                                    장례 지도 경력 <span className="font-bold text-gray-800">{experience_years}년</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            {/* 인사말 */}
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-50">
                                <h4 className="flex items-center gap-1.5 text-sm font-bold text-indigo-900 mb-2">
                                    <Briefcase className="w-4 h-4 text-indigo-600" /> 인사말 / 소개
                                </h4>
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {introduction || '등록된 소개글이 없습니다.'}
                                </p>
                            </div>

                            {/* ① 상례지도사 자격증 */}
                            <div className="bg-green-50/50 p-4 rounded-xl border border-green-100">
                                <h4 className="flex items-center gap-1.5 text-sm font-bold text-green-900 mb-2">
                                    <FileBadge className="w-4 h-4 text-green-600" /> ① 상례지도사 자격증
                                </h4>
                                {certificate_url ? (
                                    <div
                                        className="relative rounded-lg overflow-hidden border border-green-200 bg-gray-50 cursor-zoom-in group"
                                        onClick={() => setCertZoomed(true)}
                                    >
                                        <img
                                            src={certificate_url}
                                            alt="자격증"
                                            className="w-full h-auto max-h-40 object-contain group-hover:opacity-90 transition-opacity"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="flex items-center gap-1 bg-white/90 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow">
                                                <ZoomIn className="w-3.5 h-3.5" /> 크게 보기
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">자격증 사진이 아직 등록되지 않았습니다.</p>
                                )}
                            </div>

                            {/* ② 사업자등록증 */}
                            <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                                <h4 className="flex items-center gap-1.5 text-sm font-bold text-purple-900 mb-2">
                                    <FileBadge className="w-4 h-4 text-purple-600" /> ② 사업자등록증
                                </h4>
                                {business_license_url ? (
                                    <div
                                        className="relative rounded-lg overflow-hidden border border-purple-200 bg-gray-50 cursor-zoom-in group"
                                        onClick={() => setBizZoomed(true)}
                                    >
                                        <img
                                            src={business_license_url}
                                            alt="사업자등록증"
                                            className="w-full h-auto max-h-40 object-contain group-hover:opacity-90 transition-opacity"
                                        />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="flex items-center gap-1 bg-white/90 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow">
                                                <ZoomIn className="w-3.5 h-3.5" /> 크게 보기
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">사업자등록증이 아직 등록되지 않았습니다.</p>
                                )}
                            </div>

                            {/* 전화 */}
                            {isMasked ? (
                                <div className="w-full flex flex-col items-center justify-center gap-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-bold border border-gray-200 cursor-not-allowed">
                                    <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> 안심번호 ({maskedPhone})</span>
                                    <span className="text-xs font-normal text-gray-400">직접 연락은 불가능하며 앱을 통한 소통만 가능합니다.</span>
                                </div>
                            ) : (
                                <a href={`tel:${phone}`} className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all shadow-md active:scale-95">
                                    <Phone className="w-5 h-5" /> 직접 전화 걸기
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 자격증 전체화면 확대 */}
            {certZoomed && certificate_url && (
                <div
                    className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setCertZoomed(false)}
                >
                    <div className="relative max-w-2xl w-full">
                        <button
                            onClick={() => setCertZoomed(false)}
                            className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm font-bold"
                        >
                            <XCircle className="w-5 h-5" /> 닫기
                        </button>
                        <img
                            src={certificate_url}
                            alt="자격증 확대"
                            className="w-full h-auto rounded-xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
            {/* 사업자등록증 전체화면 확대 */}
            {bizZoomed && business_license_url && (
                <div
                    className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setBizZoomed(false)}
                >
                    <div className="relative max-w-2xl w-full">
                        <button
                            onClick={() => setBizZoomed(false)}
                            className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm font-bold"
                        >
                            <XCircle className="w-5 h-5" /> 닫기
                        </button>
                        <img
                            src={business_license_url}
                            alt="사업자등록증 확대"
                            className="w-full h-auto rounded-xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
