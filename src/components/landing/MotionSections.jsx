import React, { useEffect, useRef, useState } from 'react';
import './landing-motion.css';

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 꽃잎 캔버스 (아주 느리게)
function Petals({ count = 22, color = '#fff' }) {
    const ref = useRef(null);
    useEffect(() => {
        const c = ref.current;
        if (!c || reduced()) return undefined;
        const x = c.getContext('2d');
        let W = 0, H = 0, raf = 0;
        const resize = () => { W = c.width = c.offsetWidth; H = c.height = c.offsetHeight; };
        resize();
        window.addEventListener('resize', resize);
        const P = Array.from({ length: count }, () => ({
            x: Math.random() * W, y: Math.random() * H, r: 3 + Math.random() * 5,
            s: 0.25 + Math.random() * 0.5, d: Math.random() * 6, a: 0.25 + Math.random() * 0.35,
        }));
        const frame = () => {
            x.clearRect(0, 0, W, H);
            P.forEach(p => {
                p.y += p.s; p.d += 0.01; p.x += Math.sin(p.d) * 0.5;
                if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
                x.save(); x.translate(p.x, p.y); x.rotate(p.d); x.globalAlpha = p.a; x.fillStyle = color;
                x.beginPath(); x.ellipse(0, 0, p.r, p.r * 1.7, 0, 0, 7); x.fill(); x.restore();
            });
            raf = requestAnimationFrame(frame);
        };
        frame();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, [count, color]);
    return <canvas ref={ref} className="lm-petals" aria-hidden="true" />;
}

// 화면에 들어오면 in 클래스를 붙인다
function useReveal(threshold = 0.25) {
    const ref = useRef(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }), { threshold });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return [ref, seen];
}

export function MotionHero({ onConsult }) {
    return (
        <section className="lm lm-hero">
            <div className="bg" />
            <Petals />
            <div className="txt">
                <div className="lm-eyebrow">국가 공인 · 장례지도사 실명제</div>
                <h1><span>마음 쓰실 일은</span> <span>단 하나,</span><br /><span>보내드리는 일입니다</span></h1>
                <p>복잡한 건 장례지도사 팀장이<br className="lm-brm" /> 곁에서 맡습니다.<br />이름과 연락처만 남겨 주세요.</p>
                <div className="lm-cta">
                    <button type="button" className="lm-btn p" onClick={onConsult}>긴급 상담 요청</button>
                    <a className="lm-btn s" href="#flow">어떻게 곁에 서는지 보기</a>
                </div>
            </div>
            <div className="lm-scroll"><i />SCROLL</div>
            <span className="lm-chip">연출 이미지</span>
        </section>
    );
}

export function MotionStatement() {
    const ref = useRef(null);
    const [p, setP] = useState(reduced() ? 1 : 0);
    useEffect(() => {
        if (reduced()) return undefined;
        const upd = () => {
            const r = ref.current.getBoundingClientRect();
            setP(Math.min(1, Math.max(0, (window.innerHeight * 0.85 - r.top) / (window.innerHeight * 0.6))));
        };
        upd();
        window.addEventListener('scroll', upd, { passive: true });
        return () => window.removeEventListener('scroll', upd);
    }, []);
    const lines = ['가장 슬픈 날, 낯선 절차까지', '혼자 감당하지 않으셔도 됩니다.', '필요한 만큼만, 천천히, 곁에서 안내합니다.'];
    const words = lines.map(l => l.split(' '));
    const total = words.flat().length;
    let k = 0;
    return (
        <section className="lm lm-state">
            <h2 ref={ref}>
                {words.map((ws, li) => (
                    <React.Fragment key={li}>
                        {ws.map(w => { const on = k++ / total < p; return <span key={k} className={`w${on ? ' on' : ''}`}>{w} </span>; })}
                        {li < words.length - 1 && <br />}
                    </React.Fragment>
                ))}
            </h2>
        </section>
    );
}

const SCENES = [
    { img: '/landing/scene_tea.webp', alt: '햇살 드는 라운지에서 가족에게 따뜻한 차를 건네는 장례지도사 (연출 이미지)', step: 'STEP 1 · 첫 연락', title: ['연락을 남기시는 순간부터', '팀장이 곁에 섭니다'], text: '남겨 주신 연락처로 전담 팀장이 직접 연락드리고, 장례식장으로 이동합니다.' },
    { img: '/landing/scene_walk.webp', alt: '장례식장을 나와 햇살 속을 함께 걷는 가족 (연출 이미지)', step: 'STEP 2 · 3일 동안', title: ['입관부터 발인까지', '가족의 시간을 지킵니다'], text: '필요한 구성은 가족이 직접 선택하시고, 결정을 서두르게 하지 않습니다.' },
    { img: '/landing/scene_sky.webp', alt: '맑은 하늘을 함께 올려다보는 가족과 장례지도사 (연출 이미지)', step: 'STEP 3 · 배웅', title: ['끝까지 함께하고', '투명하게 정산합니다'], text: '모든 절차 종료 후 항목별 정산 내역을 확인해 드립니다.' },
];

export function MotionScenes() {
    const box = useRef(null);
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        const upd = () => {
            const r = box.current.getBoundingClientRect();
            const t = -r.top / (r.height - window.innerHeight);
            setIdx(Math.min(SCENES.length - 1, Math.max(0, Math.floor(t * SCENES.length))));
        };
        upd();
        window.addEventListener('scroll', upd, { passive: true });
        return () => window.removeEventListener('scroll', upd);
    }, []);
    return (
        <section id="flow" ref={box} className="lm lm-scenes">
            <div className="lm-sticky">
                {SCENES.map((s, i) => (
                    <div key={s.img} className={`lm-sc${i === idx ? ' on' : ''}`}>
                        <img src={s.img} alt={s.alt} loading="lazy" />
                        <div className="lm-cap">
                            <small>{s.step}</small>
                            <h3>{s.title[0]}<br />{s.title[1]}</h3>
                            <p>{s.text}</p>
                        </div>
                    </div>
                ))}
                <div className="lm-prog">{SCENES.map((s, i) => <i key={s.img} className={i === idx ? 'on' : ''} />)}</div>
                <span className="lm-chip" style={{ top: 84, bottom: 'auto' }}>연출 이미지</span>
            </div>
        </section>
    );
}

function CountUp({ to, label }) {
    const [ref, seen] = useReveal();
    const [n, setN] = useState(0);
    useEffect(() => {
        if (!seen) return undefined;
        if (reduced() || to === 0) { setN(to); return undefined; }
        let v = 0;
        const t = setInterval(() => { v += 1; setN(Math.min(v, to)); if (v >= to) clearInterval(t); }, 50);
        return () => clearInterval(t);
    }, [seen, to]);
    return (
        <div ref={ref} className={`lm-rv${seen ? ' in' : ''}`}>
            <b>{n}</b><span>{label}</span>
        </div>
    );
}

export function MotionNums() {
    return (
        <section className="lm lm-nums">
            <CountUp to={0} label="원 · 가입비 / 월 납입금" />
            <CountUp to={24} label="시간 · 서울·경기·인천 접수" />
            <CountUp to={1} label="명의 전담 팀장 · 실명제" />
        </section>
    );
}

export function MotionAbout() {
    const [ref, seen] = useReveal(0.12);
    return (
        <section id="about" ref={ref} className="lm lm-flower">
            <div className={`lm-fimg${seen ? ' in' : ''}`}>
                <img src="/flowers/ibgwan_flowers.webp" alt="입관식에 올리는 흰 꽃과 계절 꽃 장식" loading="lazy" width="1376" height="768" />
            </div>
            <div className={`lm-rv${seen ? ' in' : ''}`}>
                <small style={{ letterSpacing: '.3em', color: 'var(--lm-gold)', fontSize: 16 }}>ABOUT</small>
                <h2>곁에서 지켜본 사람이<br />연결합니다</h2>
                <p>입관식에 쓰이는 꽃을 다년간 납품하며 장례지도사 팀장님들과 현장에서 함께 일해 왔습니다.</p>
                <p>가격보다는 진심을 더했습니다. 중간 과정을 줄인 만큼, 부담도 줄었습니다.</p>
            </div>
        </section>
    );
}

const STEPS = [
    ['긴급 장례 접수', '이름과 연락처를 남겨 주세요.'],
    ['팀장 연결', '전담 팀장이 직접 전화드리고 장례식장으로 이동합니다.'],
    ['장례 진행', '입관부터 발인까지 3일간 정성을 다해 모십니다.'],
    ['투명한 정산', '모든 절차 종료 후 꼼꼼하게 정산 내역을 확인합니다.'],
];

export function MotionProcess() {
    const tr = useRef(null);
    const [p, setP] = useState(reduced() ? 1 : 0);
    const [h, setH] = useState(0);
    useEffect(() => {
        const upd = () => {
            const r = tr.current.getBoundingClientRect();
            const v = Math.min(1, Math.max(0, (window.innerHeight * 0.7 - r.top) / r.height));
            setP(reduced() ? 1 : v);
            setH(Math.max(0, v * (r.height - 12)));
        };
        upd();
        window.addEventListener('scroll', upd, { passive: true });
        return () => window.removeEventListener('scroll', upd);
    }, []);
    return (
        <section id="process" className="lm lm-proc">
            <h2>복잡한 절차, 걱정하지 마세요</h2>
            <div ref={tr} className="lm-track">
                <div className="lm-fill" style={{ height: h }} />
                {STEPS.map(([t, d], i) => (
                    <div key={t} className={`lm-st${i / STEPS.length <= p + 0.02 ? ' on' : ''}`} data-n={i + 1}>
                        <h4>{t}</h4><p>{d}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function MotionClose({ onConsult }) {
    const [ref, seen] = useReveal();
    return (
        <section ref={ref} className="lm lm-close">
            <Petals count={16} color="#D9C7A3" />
            <h2 className={`lm-rv${seen ? ' in' : ''}`}>지금 곁이 필요하시다면,<br />이름과 연락처만 남겨 주세요.</h2>
            <small>남겨 주시면 장례지도사 팀장이 확인 후 직접 연락드립니다.</small>
            <button type="button" className="lm-btn p" onClick={onConsult}>긴급 상담 요청</button>
        </section>
    );
}

// 상품 아이콘 — 이모지 대신 선으로 그린 꽃 (그려지듯 나타나고 천천히 흔들림)
export function PackageIcon({ kind, featured }) {
    const c = featured ? '#E6D2AE' : '#B39A74';
    const common = { fill: 'none', stroke: c, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
    return (
        <div className={`pk-icon ${featured ? 'pk-icon-f' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 80 80" width={featured ? 84 : 68} height={featured ? 84 : 68}>
                {kind === 'lotus' && (
                    <g {...common} className="pk-sway">
                        <path className="pk-draw" pathLength="1" d="M40 58 C28 54 22 42 26 28 C34 32 39 42 40 58Z" />
                        <path className="pk-draw" pathLength="1" d="M40 58 C52 54 58 42 54 28 C46 32 41 42 40 58Z" />
                        <path className="pk-draw" pathLength="1" d="M40 58 C32 48 32 30 40 16 C48 30 48 48 40 58Z" />
                        <path className="pk-draw" pathLength="1" d="M40 58 C24 58 12 50 10 38 C22 36 34 44 40 58Z" />
                        <path className="pk-draw" pathLength="1" d="M40 58 C56 58 68 50 70 38 C58 36 46 44 40 58Z" />
                        <path className="pk-draw" pathLength="1" d="M24 66 C34 70 46 70 56 66" />
                    </g>
                )}
                {kind === 'bloom' && (
                    <g {...common} className="pk-sway">
                        {[0, 72, 144, 216, 288].map(r => (
                            <path key={r} className="pk-draw" pathLength="1" transform={`rotate(${r} 40 36)`} d="M40 36 C32 28 33 16 40 10 C47 16 48 28 40 36Z" />
                        ))}
                        <circle className="pk-draw" pathLength="1" cx="40" cy="36" r="3.5" />
                        <path className="pk-draw" pathLength="1" d="M40 52 C40 60 40 66 40 72" />
                        <path className="pk-draw" pathLength="1" d="M40 62 C46 58 52 58 56 60 C52 66 46 66 40 62Z" />
                    </g>
                )}
                {kind === 'sprout' && (
                    <g {...common} className="pk-sway">
                        <path className="pk-draw" pathLength="1" d="M40 70 C40 58 40 48 40 40" />
                        <path className="pk-draw" pathLength="1" d="M40 46 C30 46 22 40 20 30 C30 30 38 36 40 46Z" />
                        <path className="pk-draw" pathLength="1" d="M40 40 C48 38 56 32 58 22 C48 22 41 28 40 40Z" />
                        <path className="pk-draw" pathLength="1" d="M30 70 C36 72 44 72 50 70" />
                    </g>
                )}
            </svg>
        </div>
    );
}
