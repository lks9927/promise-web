import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AdminDashboard from './pages/AdminDashboard'
import TeamLeaderDashboard from './pages/TeamLeaderDashboard'
import DealerDashboard from './pages/DealerDashboard'
import PartnerApply from './pages/PartnerApply'
import CustomerStatus from './pages/CustomerStatus'
import VendorDashboard from './pages/VendorDashboard'
import DriverDelivery from './pages/DriverDelivery'
import CouponLanding from './pages/CouponLanding'

// Placeholder Pages
import Login from './pages/Login'
import ProjectStatus from './pages/ProjectStatus'
const Dashboard = () => <div className="p-10 text-xl text-center">대시보드 (딜러/팀장)</div>
import MobileBriefing from './pages/MobileBriefing'

// Security
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const roleRequestByUserId = new Map();

const getRoleForUser = (userId) => {
  if (!roleRequestByUserId.has(userId)) {
    roleRequestByUserId.set(
      userId,
      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
        .then(({ data, error }) => {
          if (error || !data?.role) throw error || new Error('Profile role not found');
          return data.role;
        })
        .catch((err) => {
          // 실패 결과는 캐시하지 않아 다음 확인 때 다시 시도하게 한다
          roleRequestByUserId.delete(userId);
          throw err;
        })
    );
  }

  return roleRequestByUserId.get(userId);
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [authState, setAuthState] = useState({ status: 'checking', role: null });

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        localStorage.removeItem('user');
        if (active) setAuthState({ status: 'unauthorized', role: null });
        return;
      }

      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        if (active) setAuthState({ status: 'unauthorized', role: null });
        return;
      }

      try {
        JSON.parse(storedUser);
      } catch {
        localStorage.removeItem('user');
        if (active) setAuthState({ status: 'unauthorized', role: null });
        return;
      }

      try {
        const role = await getRoleForUser(session.user.id);
        if (active) setAuthState({ status: 'authorized', role });
      } catch {
        if (active) setAuthState({ status: 'unauthorized', role: null });
      }
    };

    checkAccess().catch(() => {
      if (active) setAuthState({ status: 'unauthorized', role: null });
    });

    return () => {
      active = false;
    };
  }, []);

  if (authState.status === 'checking') return null;
  if (authState.status === 'unauthorized') return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(authState.role)) {
    // 권한이 없으면 자신의 대시보드나 홈으로 튕겨냄
    switch(authState.role) {
      case 'admin': return <Navigate to="/admin" replace />;
      case 'master': return <Navigate to="/dealer" replace />;
      case 'leader': return <Navigate to="/leader" replace />;
      case 'dealer': return <Navigate to="/dealer" replace />;
      default: return <Navigate to="/" replace />;
    }
  }

  return children;
};

import { NotificationProvider, useNotification } from './contexts/NotificationContext'
import Toast from './components/common/Toast'
import ChatbotWidget from './components/common/ChatbotWidget'

function AppContent() {
  const { toast, showToast } = useNotification();
  return (
    <>
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => showToast(null)}
        />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/leader" element={
          <ProtectedRoute allowedRoles={['admin', 'master', 'leader']}>
            <TeamLeaderDashboard />
          </ProtectedRoute>
        } />
        <Route path="/dealer" element={
          <ProtectedRoute allowedRoles={['admin', 'master', 'leader', 'dealer']}>
            <DealerDashboard />
          </ProtectedRoute>
        } />
        <Route path="/apply" element={<PartnerApply />} />
        <Route path="/mypage" element={<CustomerStatus />} />
        <Route path="/login" element={<Login />} />
        <Route path="/status" element={<ProjectStatus />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/briefing" element={<MobileBriefing />} />
        <Route path="/vendor" element={
          <ProtectedRoute allowedRoles={['admin', 'vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/delivery/:orderId" element={<DriverDelivery />} />
        <Route path="/coupon/:code" element={<CouponLanding />} />
        <Route path="*" element={<div className="flex items-center justify-center h-screen bg-gray-100 text-xl font-bold text-gray-600">404 - 페이지를 찾을 수 없습니다</div>} />
      </Routes>
      <ChatbotWidget />
    </>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </div>
  )
}

export default App
