// src/pages/IntroPage.jsx
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setGuest, setUserId } from '../utils/auth';

// ===== Color Palette (from spec) =====
const PALETTE = {
  bg: 'rgb(250,250,250)', // R250 G250 B250
  ink: 'rgb(81,81,81)', // R81  G81  B81
  line: 'rgb(206,206,206)', // R206 G206 B206
};

// ✅ スタイル定義
const styles = {
  label: {
    fontWeight: 'bold',
    marginTop: '10px',
    display: 'block',
    color: PALETTE.ink,
  },
  input: {
    padding: '10px',
    fontSize: '16px',
    width: '100%',
    border: `1px solid ${PALETTE.line}`,
    borderRadius: '10px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundColor: '#fff',
    backgroundImage: 'none',
    boxSizing: 'border-box',
    marginBottom: '10px',
    color: PALETTE.ink,
    WebkitTextFillColor: PALETTE.ink,
  },
  eyeIcon: {
    position: 'absolute',
    right: '10px',
    top: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    userSelect: 'none',
    color: PALETTE.ink,
  },
};

const buttonStyle = {
  padding: '12px',
  fontSize: '16px',
  backgroundColor: '#e5e3db',
  color: '#000',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  marginTop: '20px',
  width: '100%',
};

const secondaryButtonStyle = {
  padding: '12px',
  fontSize: '14px',
  backgroundColor: '#bbb',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  marginTop: '10px',
  width: '100%',
  opacity: 0.9,
};

// メール簡易バリデータ
const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || '').trim());

// ==============================
// スライド生成
// ==============================
function slides(
  formData,
  setFormData,
  handleChange,
  handleSubmit,
  handleStartAsGuest,
  agreeRef,
  agreeError,
  setAgreeError
) {
  const togglePassword = () =>
    setFormData((prev) => ({ ...prev, showPassword: !prev.showPassword }));

  return [
    {
      id: 1,
      color: PALETTE.bg,
      content: (
        <>
          {/* 画像ラッパ：ここで高さを統一 */}
          <div
            style={{
              height: 'clamp(160px, 24vh, 220px)',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '80px auto 30px auto',
            }}
          >
            <img
              src="/img/slide1.png"
              alt="基準のワイン"
              style={{
                maxWidth: '60%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* テキスト */}
          <div style={{ marginTop: '30px' }}>
            <p
              style={{
                lineHeight: '1.9em',
                color: PALETTE.ink,
                fontSize: '11pt',
                textAlign: 'center',
              }}
            >
              ワインの真ん中の味である<br />
              基準のワインを飲み<br />
              その味を基準に<br />
              自分の好みを知ることができます。
            </p>
            <p
              style={{
                marginTop: '20px',
                color: PALETTE.ink,
                textAlign: 'center',
              }}
            >
              その基準があなたの<span style={{ fontWeight: 600 }}>コンパス</span>です。
            </p>
          </div>
        </>
      ),
    },
    {
      id: 2,
      color: PALETTE.bg,
      content: (
        <>
          {/* 画像ラッパ：1ページ目と同じ設定 */}
          <div
            style={{
              height: 'clamp(160px, 24vh, 220px)',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '80px auto 30px auto',
            }}
          >
            <img
              src="/img/slide2.png"
              alt="TasteMap"
              style={{
                maxWidth: '60%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* テキスト */}
          <div style={{ marginTop: '20px' }}>
            <p
              style={{
                lineHeight: '1.9em',
                color: PALETTE.ink,
                fontSize: '11pt',
                textAlign: 'center',
              }}
            >
              コンパスである基準のワインから<br />
              発見したあなたの好みに近いワインを<br />
              飲んで評価し、<br />
              <br />
            </p>
            <p
              style={{
                marginTop: '10px',
                color: PALETTE.ink,
                textAlign: 'center',
              }}
            >
              あなただけの<span style={{ fontWeight: 600 }}>地図</span>を作りましょう。
            </p>
          </div>
        </>
      ),
    },
    {
      id: 3,
      color: PALETTE.bg,
      content: (
        <>
          {/* コンテナ：見出しとフォームを同じ幅に */}
          <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            <p
              style={{
                margin: '80px 0 20px 0',
                fontSize: '16px',
                color: PALETTE.ink,
                textAlign: 'left',
              }}
            >
              あなたの地図を作り始めるには、まず登録から。
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ width: '100%', maxWidth: 400 }}
            >
              <label style={styles.label}>
                ニックネーム・ID・パスワードを登録
              </label>

              {/* ニックネーム */}
              <input
                type="text"
                value={formData.nickname}
                onChange={handleChange('nickname')}
                style={styles.input}
                placeholder="ニックネーム"
              />

              {/* ID（メール） */}
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange('email')}
                style={styles.input}
                placeholder="メールアドレス（ID）"
              />

              {/* パスワード */}
              <div style={{ position: 'relative' }}>
                <input
                  type={formData.showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange('password')}
                  style={styles.input}
                  placeholder="パスワードは4文字以上20文字以内"
                  autoComplete="new-password"
                />
                <span
                  style={styles.eyeIcon}
                  onClick={togglePassword}
                  title={formData.showPassword ? '非表示' : '表示'}
                >
                  {formData.showPassword ? '●' : '◯'}
                </span>
              </div>

              {/* 横並び：生年・月・性別 */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 30%' }}>
                  <label style={styles.label}>生まれた年</label>
                  <select
                    value={formData.birthYear}
                    onChange={handleChange('birthYear')}
                    style={styles.input}
                  >
                    {Array.from(
                      { length: 80 },
                      (_, i) =>
                        (new Date().getFullYear() - 20 - i).toString()
                    ).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 30%' }}>
                  <label style={styles.label}>生まれた月</label>
                  <select
                    value={formData.birthMonth}
                    onChange={handleChange('birthMonth')}
                    style={styles.input}
                  >
                    {Array.from({ length: 12 }, (_, i) =>
                      String(i + 1).padStart(2, '0')
                    ).map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 30%' }}>
                  <label style={styles.label}>性別</label>
                  <select
                    value={formData.gender}
                    onChange={handleChange('gender')}
                    style={styles.input}
                  >
                    <option value="男性">男性</option>
                    <option value="女性">女性</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>

              {/* 規約チェック */}
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <input
                  type="checkbox"
                  id="agree"
                  checked={formData.agreed}
                  ref={agreeRef}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData((prev) => ({ ...prev, agreed: checked }));
                    if (checked) setAgreeError('');
                  }}
                  style={{ marginRight: '8px' }}
                />
                <label
                  htmlFor="agree"
                  style={{ fontSize: '14px', color: '#333' }}
                >
                  <a
                    href="/terms"
                    style={{
                      color: 'rgb(81,81,81)',
                      textDecoration: 'underline',
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    利用規約
                  </a>
                  に同意します
                </label>

                {/* 注意文（常に高さ確保で画面が動かない） */}
                <div
                  aria-live="polite"
                  style={{ height: 18, marginTop: 8, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: 'crimson',
                      lineHeight: '18px',
                      opacity: agreeError ? 1 : 0,
                      transition: 'opacity 160ms',
                      pointerEvents: 'none',
                    }}
                  >
                    {agreeError || '\u00A0'}
                  </div>
                </div>
              </div>

              {/* 登録ボタン */}
              <button
                type="submit"
                style={{ ...buttonStyle, opacity: formData.agreed ? 1 : 0.5 }}
                disabled={!formData.agreed}
              >
                登録してはじめる
              </button>

              {/* ゲストボタン */}
              <button
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  opacity: 1,
                  cursor: 'pointer',
                }}
                onClick={handleStartAsGuest}
              >
                ゲストとして試す（記録は保存されません）
              </button>
            </form>

            <p
              style={{
                fontSize: '12px',
                marginTop: '16px',
                color: '#666',
                textAlign: 'center',
              }}
            >
              登録後は、設定画面からいつでも<br />
              ニックネーム変更や利用店舗の追加ができます。
            </p>
          </div>
        </>
      ),
    },
  ];
}

// =========================
// メインコンポーネント
// =========================
export default function IntroPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
  const agreeRef = useRef(null);
  const [agreeError, setAgreeError] = useState('');

  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    password: '',
    showPassword: false,
    birthYear: '',
    birthMonth: '',
    gender: '',
    agreed: false,
  });

  // 初期保存値を復元
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      nickname: localStorage.getItem('user.nickname') || '',
      email: localStorage.getItem('user.id') || '',
      birthYear: localStorage.getItem('user.birthYear') || '1990',
      birthMonth: localStorage.getItem('user.birthMonth') || '01',
      gender: localStorage.getItem('user.gender') || '男性',
    }));
  }, []);

  // ページ遷移後スクロール保持対策
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // 利用規約チェックが無い場合のスクロール補助
  const scrollAgreeIntoViewIfNeeded = () => {
    const el = agreeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const inView = r.top >= 0 && r.bottom <= vh;
    if (!inView) {
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  };

  const handleStartAsGuest = () => {
    if (!formData.agreed) {
      setAgreeError('利用規約をお読みのうえ、同意にチェックしてください。');
      scrollAgreeIntoViewIfNeeded();
      return;
    }
    setAgreeError('');
    setGuest();
    navigate('/store');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const {
      nickname,
      email,
      password,
      birthYear,
      birthMonth,
      gender,
      agreed,
    } = formData;

    if (!nickname || !email || !password || !birthYear || !birthMonth || !gender) {
      alert('すべての項目を入力してください');
      return;
    }
    if (!agreed) {
      setAgreeError('利用規約をお読みのうえ、同意にチェックしてください。');
      scrollAgreeIntoViewIfNeeded();
      return;
    }
    if (!isEmail(email)) {
      alert('メールアドレス（ID）の形式が正しくありません');
      return;
    }
    if (password.length < 4 || password.length > 20) {
      alert('パスワードは4文字以上20文字以内で入力してください');
      return;
    }

    try {
      localStorage.setItem('user.nickname', nickname);
      localStorage.setItem('user.id', email);
      localStorage.setItem('user.birthYear', birthYear);
      localStorage.setItem('user.birthMonth', birthMonth);
      localStorage.setItem('user.gender', gender);
      localStorage.setItem('user.pass', password);
    } catch {}

    setUserId(email);
    navigate('/store');
  };

  const allSlides = slides(
    formData,
    setFormData,
    handleChange,
    handleSubmit,
    handleStartAsGuest,
    agreeRef,
    agreeError,
    setAgreeError
  );

  return (
    <div className="intro-wrapper">
      <div className="slides-container" onScroll={handleScroll}>
        {allSlides.map((slide) => (
          <div
            key={slide.id}
            className="slide"
            style={{
              backgroundColor: slide.color,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'center',
              width: '100vw',
              height: '100vh',
              padding: '20px',
              boxSizing: 'border-box',
              scrollSnapAlign: 'start',
              flexShrink: 0,
              overflowY: 'auto',
            }}
          >
            {slide.content}
          </div>
        ))}
      </div>

      <div className="indicator">
        {allSlides.map((_, index) => (
          <div
            key={index}
            className={`dot ${index === currentIndex ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
