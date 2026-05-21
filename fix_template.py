with open('src/pages/DealerDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find("function CouponImageTemplate({ coupon }) {")
if start_idx == -1:
    print("Not found")
    exit(1)

end_idx = content.find("// --- Tabs ---", start_idx)
if end_idx == -1:
    print("End not found")
    exit(1)

replacement = '''function CouponImageTemplate({ coupon }) {
    if (!coupon) return null;
    return (
        <div id={coupon-card-} style={{ position: 'fixed', left: '-9999px', top: 0, width: 450, height: 220, background: 'linear-gradient(to right, #cfad6f, #f5deb3, #cfad6f)', padding: 4, zIndex: -10 }}>
            <div style={{ width: '100%', height: '100%', background: '#fcfbf9', position: 'relative', display: 'flex', overflow: 'hidden' }}>
                {/* 안쪽 라운드 테두리 */}
                <div style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, border: '1px solid #b89758', borderRadius: 8, pointerEvents: 'none' }}></div>
                
                {/* 좌측: 브랜드 + 코드 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 30, paddingRight: 16, position: 'relative', zIndex: 10 }}>
                    {/* 로고 + 브랜드명 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <img src="/promise_logo_transparent.png" alt="logo" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                        <span style={{ color: '#2E4A3D', fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>10년의 약속</span>
                    </div>
                    {/* 캐시백 쿠폰 타이틀 */}
                    <div style={{ color: '#333333', fontSize: 24, fontWeight: 900, letterSpacing: 4, fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif', marginBottom: 12 }}>캐시백 쿠폰</div>
                    {/* 설명 */}
                    <div style={{ color: '#888888', fontSize: 10, marginBottom: 8 }}>프리미엄 장례지원 캐시백</div>
                    {/* 코드 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: '#2E4A3D', color: '#fcfbf9', fontSize: 9, padding: '2px 8px', fontWeight: 700, letterSpacing: 2 }}>CODE</div>
                        <div style={{ color: '#2E4A3D', fontSize: 16, fontFamily: 'Consolas, monospace', fontWeight: 700, letterSpacing: 3 }}>
                            {coupon.code}
                        </div>
                    </div>
                </div>
                
                {/* 우측: 금액 + 날짜 */}
                <div style={{ width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #d4c39e', position: 'relative', zIndex: 10 }}>
                    <div style={{ color: '#8c6f37', fontSize: 10, letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>CASHBACK</div>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span style={{ color: '#333333', fontSize: 13, marginRight: 2 }}>₩</span>
                        <span style={{ color: '#333333', fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif' }}>
                            {Number(coupon.amount).toLocaleString()}
                        </span>
                    </div>
                    <div style={{ color: '#999999', fontSize: 11, marginTop: 14, fontWeight: 500 }}>
                        {new Date(coupon.created_at).toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}

'''

new_content = content[:start_idx] + replacement + content[end_idx:]

with open('src/pages/DealerDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Replaced!")
