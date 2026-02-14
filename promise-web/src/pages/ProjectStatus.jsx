
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    ShieldCheck,
    Briefcase,
    UserCheck,
    CreditCard,
    ArrowRight
} from 'lucide-react';

const StatusCard = ({ title, role, percent, desc, icon: Icon, path, color }) => {
    const navigate = useNavigate();

    return (
        <div
            onClick={() => navigate(path)}
            className="bg-white rounded-xl shadow-lg border-l-4 border-gray-200 p-6 w-80 relative group cursor-pointer hover:shadow-xl transition-all hover:scale-105"
            style={{ borderLeftColor: color }}
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                    <Icon className="w-6 h-6" style={{ color: color }} />
                </div>
                <div className="text-right">
                    <span className="text-2xl font-bold text-gray-800">{percent}%</span>
                    <p className="text-xs text-gray-500">완성률</p>
                </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-500 mb-4 h-10">{desc}</p>

            {/* Progress Bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                <div
                    className="h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${percent}%`, backgroundColor: color }}
                ></div>
            </div>

            <div className="flex justify-between items-center text-sm font-medium" style={{ color: color }}>
                <span>이동하기</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    );
};

const ProjectStatus = () => {
    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            <header className="mb-10 text-center">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">🚀 프로젝트 진행 현황판</h1>
                <p className="text-gray-600">각 파트별 개발 진행률과 바로가기를 제공합니다.</p>
            </header>

            <div className="max-w-7xl mx-auto space-y-12">

                {/* Level 1: Core System */}
                <div className="relative">
                    <div className="absolute left-10 -top-8 text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">LEVEL 1. 접속 및 인증</div>
                    <div className="flex flex-wrap gap-8 justify-center">
                        <StatusCard
                            title="로그인 / 메인"
                            percent={90}
                            desc="사용자 인증, 역할별 리다이렉트, 기본 레이아웃 완료"
                            icon={ShieldCheck}
                            path="/login"
                            color="#4F46E5" // Indigo
                        />
                    </div>
                </div>

                {/* Connector */}
                <div className="flex justify-center -my-6">
                    <div className="h-12 w-0.5 bg-gray-300"></div>
                </div>

                {/* Level 2: Management */}
                <div className="relative">
                    <div className="absolute left-10 -top-8 text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">LEVEL 2. 관리 및 운영</div>
                    <div className="flex flex-wrap gap-8 justify-center">
                        <StatusCard
                            title="관리자 (Admin)"
                            percent={60}
                            desc="전체 현황 모니터링, 파트너 승인/관리 기능 구조화"
                            icon={LayoutDashboard}
                            path="/admin"
                            color="#DC2626" // Red
                        />
                        <StatusCard
                            title="부관리자 (Master)"
                            percent={60}
                            desc="하위 팀장/딜러 관리, 실적 집계 대시보드"
                            icon={Briefcase}
                            path="/master"
                            color="#EA580C" // Orange
                        />
                    </div>
                </div>

                {/* Connector */}
                <div className="flex justify-center -my-6">
                    <div className="h-12 w-0.5 bg-gray-300"></div>
                </div>

                {/* Level 3: Field Operations */}
                <div className="relative">
                    <div className="absolute left-10 -top-8 text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">LEVEL 3. 영업 및 현장</div>

                    {/* Level 3-1: Dealer Section */}
                    <div className="mb-6 flex flex-col items-center">
                        <h4 className="text-sm font-semibold text-gray-500 mb-4 bg-gray-100 px-4 py-1 rounded-md">2-1. Dealer (설계사)</h4>
                        <div className="flex flex-wrap gap-8 justify-center">
                            <StatusCard
                                title="마스터 딜러 (Master Dealer)"
                                percent={80}
                                desc="일반 딜러 투입 및 관리, 영업 지원"
                                icon={UserCheck}
                                path="/dealer?role=master"
                                color="#2563EB" // Blue
                            />
                            <StatusCard
                                title="딜러 (Dealer)"
                                percent={70}
                                desc="장례 접수, 쿠폰 사용, 실적 확인"
                                icon={UserCheck}
                                path="/dealer?role=general"
                                color="#3B82F6" // Light Blue
                            />
                        </div>
                    </div>

                    {/* Level 3-2: Team Leader Section */}
                    <div className="flex flex-col items-center pt-6 border-t border-gray-200 border-dashed w-3/4 mx-auto">
                        <h4 className="text-sm font-semibold text-gray-500 mb-4 bg-gray-100 px-4 py-1 rounded-md">2-2. Team Leader (팀장)</h4>
                        <div className="flex flex-wrap gap-8 justify-center">
                            <StatusCard
                                title="마스터 팀장"
                                percent={50}
                                desc="일반 팀장 등록/투입 및 전체 실적 관리"
                                icon={Users}
                                path="/leader?role=master"
                                color="#059669" // Emerald
                            />
                            <StatusCard
                                title="팀장"
                                percent={40}
                                desc="팀원 관리 및 현장 운영 지원"
                                icon={Users}
                                path="/leader?role=general"
                                color="#10B981" // Light Emerald
                            />
                        </div>
                    </div>
                </div>

                {/* Connector */}
                <div className="flex justify-center -my-6">
                    <div className="h-12 w-0.5 bg-gray-300"></div>
                </div>

                {/* Level 4: End User */}
                <div className="relative">
                    <div className="absolute left-10 -top-8 text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">LEVEL 4. 고객 서비스</div>
                    <div className="flex flex-wrap gap-8 justify-center">
                        <StatusCard
                            title="Customer (고객)"
                            percent={40}
                            desc="장례 진행 현황 조회, 내 정보 관리"
                            icon={CreditCard}
                            path="/mypage"
                            color="#DB2777" // Pink
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ProjectStatus;
