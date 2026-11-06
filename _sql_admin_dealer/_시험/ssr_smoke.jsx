// SSR 렌더 스모크: 화면 컴포넌트를 목 데이터로 한 번 그려 보고 '정의되지 않은 변수' 같은 런타임 오류를 잡는다.
// 사용(프로젝트 루트): bash _sql_admin_dealer/_시험/ssr_smoke.sh
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NotificationProvider } from '../../src/contexts/NotificationContext.jsx';
import PartnerTab from '../../src/components/admin/tabs/PartnerTab.jsx';
import RepresentativeOverview from '../../src/components/common/RepresentativeOverview.jsx';
import PromotionRequestsPanel from '../../src/components/admin/PromotionRequestsPanel.jsx';
import CommissionSettings from '../../src/components/admin/CommissionSettings.jsx';
import { RegionalAlertSettings } from '../../src/components/admin/tabs/settings/RegionalAlertSettings.jsx';
import { FamilyBenefitSettings } from '../../src/components/admin/tabs/settings/FamilyBenefitSettings.jsx';
import { CardQrModal } from '../../src/components/dealer/CardQrModal.jsx';
import { PreRegistrationList } from '../../src/components/dealer/PreRegistrationList.jsx';
import CouponLanding from '../../src/pages/CouponLanding.jsx';
import LeaderAlertRegions from '../../src/components/common/LeaderAlertRegions.jsx';
import { RegionSelect } from '../../src/components/common/RegionSelect.jsx';
import BranchManagement from '../../src/components/dealer/BranchManagement.jsx';
import TeamManagement from '../../src/components/team/TeamManagement.jsx';
import Profile from '../../src/components/common/Profile.jsx';

const mk = (i, role, grade, master) => ({ user_id: 'u' + i, grade, master_id: master || null, status: 'approved', region: '서울', current_status: 'waiting', max_subordinates: null, profiles: { name: '홍길동' + i, phone: '01000000' + i, role, email: 'a@b.c' } });
const partners = [];
for (let i = 0; i < 9; i++) partners.push(mk(i, 'dealer', 'Master'));
partners.push(mk(10, 'dealer', 'C', 'u1'));
for (let i = 11; i < 14; i++) partners.push(mk(i, 'leader', 'Master'));
for (let i = 14; i < 18; i++) partners.push(mk(i, 'leader', 'C', 'u11'));
partners.push(mk(20, 'dealer', 'S'));
const W = (c) => <NotificationProvider>{c}</NotificationProvider>;
const user = (role, grade) => ({ id: 'me', role, grade, name: '테스트', phone: '01011112222' });
const tests = {
  PartnerTab: () => <PartnerTab partners={partners} loading={false} onRefresh={() => {}} onApproveReset={() => {}} isReadonly={false} onUpdateMaxSubordinates={() => {}} />,
  RepOverview: () => <RepresentativeOverview user={user('dealer', 'S')} title="딜러 대표마스터 조회" />,
  PromotionPanel: () => <PromotionRequestsPanel onActionCompleted={() => {}} />,
  CommissionSettings: () => <CommissionSettings />,
  RegionalAlert: () => <RegionalAlertSettings config={{ regional_alert_mode: 'off' }} onUpdate={() => {}} />,
  FamilyBenefit: () => <FamilyBenefitSettings config={{}} onUpdate={() => {}} />,
  CardQrModal: () => <CardQrModal open={true} onClose={() => {}} />,
  PreRegistrationList: () => <PreRegistrationList />,
  CouponLandingImport: () => <div>{CouponLanding ? 'loaded' : 'missing'}</div>,
  LeaderAlertRegions: () => <LeaderAlertRegions userId="me" role="leader" />,
  RegionSelect: () => <RegionSelect value="" onChange={() => {}} />,
  BranchS: () => <BranchManagement user={user('dealer', 'S')} />,
  BranchMaster: () => <BranchManagement user={user('dealer', 'Master')} />,
  TeamS: () => <TeamManagement user={user('leader', 'S')} />,
  TeamMaster: () => <TeamManagement user={user('leader', 'Master')} />,
  ProfileLeaderS: () => <Profile user={user('leader', 'S')} onUpdate={() => {}} />,
  ProfileDealer: () => <Profile user={user('dealer', 'C')} onUpdate={() => {}} />,
};
let bad = 0;
for (const [name, f] of Object.entries(tests)) {
  try { const html = renderToString(W(f())); console.log('OK  ', name, html.length, name === 'PartnerTab' ? (html.match(/\(\d+명\)/g) || []).join(' ') : ''); }
  catch (e) { bad++; console.log('FAIL', name, String((e && e.message) || e).slice(0, 200)); }
}
console.log('failures', bad);
process.exit(bad ? 1 : 0);
