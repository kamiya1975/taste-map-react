// src/pages/IntroPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setGuest, setUserId } from '../utils/auth';

// ✅ スタイル定義（必要最小限）
const styles = {
  label: {
    fontWeight: 'bold',
    marginTop: '10px',
    display: 'block',
  },
  input: {
    padding: '10px',
    fontSize: '16px',
    width: '100%',
    border: '1px solid #ccc',
    borderRadius: '10px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundColor: '#fff',
    backgroundImage: 'none',
    boxSizing: 'border-box',
    marginBottom: '10px',
  },
  eyeIcon: {
    position: 'absolute',
    right: '10px',
    top: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    userSelect: 'none',
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

// メールの超軽量バリデータ
const isEmail = (s) => /^\S+@\S+\.\S+$/.test(String(s || '').trim());

// ==============================
// スライド生成（関数に切り出し）
// ==============================
function slides(formData, setFormData, handleChange, handleSubmit, handleStartAsGuest) {
  const togglePassword = () =>
    setFormData((prev) => ({ ...prev, showPassword: !prev.showPassword }));

  return [
    {
      id: 1,
      color: 'white',
      content: (
        <>
          <img
            src="/img/slide1.png"
            alt="基準のワイン"
            style={{
              maxWidth: '60%',
              margin: '80px auto 30px auto',
            }}
          />
          <p style={{ lineHeight: '1.8em' }}>
            ワインの真ん中の味である<br />
            基準のワインを飲み<br />
            その味を基準に<br />
            自分の好みを知ることができます。
          </p>
          <p style={{ marginTop: '10px' }}>その基準があなたのコンパスです。</p>
        </>
      ),
    },
    {
      id: 2,
      color: 'white',
      content: (
        <>
          <img
            src="/img/slide2.png"
            alt="TasteMap"
            style={{
              maxWidth: '60%',
              margin: '80px auto 30px auto',
            }}
          />
          <p style={{ lineHeight: '1.8em' }}>
            コンパスである基準のワインから発見した<br />
            あなたの好みに近いワインを飲んで評価し、<br />
            あなただけの地図を作りましょう。
          </p>
        </>
      ),
    },
    {
      id: 3,
      color: 'white',
      content: (
        <>
          <p
            style={{
              marginBottom: '20px',
              fontSize: '16px',
              margin: '80px auto 30px auto',
              textAlign: 'center',
            }}
          >
            あなたの地図を作り始めるには、まず登録から。
          </p>

          <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '400px' }}>
            <label style={styles.label}>ニックネーム・ID・パスワードを登録</label>

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

            {/* 横並びラッパー */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* 生まれた年 */}
              <div style={{ flex: '1 1 30%' }}>
                <label style={styles.label}>生まれた年</label>
                <select
                  value={formData.birthYear}
                  onChange={handleChange('birthYear')}
                  style={styles.input}
                >
                  {Array.from({ length: 80 }, (_, i) => (2025 - i).toString()).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {/* 生まれた月 */}
              <div style={{ flex: '1 1 30%' }}>
                <label style={styles.label}>生まれた月</label>
                <select
                  value={formData.birthMonth}
                  onChange={handleChange('birthMonth')}
                  style={styles.input}
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(
                    (month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* 性別 */}
              <div style={{ flex: '1 1 30%' }}>
                <label style={styles.label}>性別</label>
                <select value={formData.gender} onChange={handleChange('gender')} style={styles.input}>
                  <option value="男性">男性</option>
                  <option value="女性">女性</option>
                  <option value="その他">その他</option>
                </select>
              </div>
            </div>

            <div style={{ textAlign: 'center', margin: '20px 0' }}>
              <input
                type="checkbox"
                id="agree"
                checked={formData.agreed}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, agreed: e.target.checked }))
                }
                style={{ marginRight: '8px' }}
              />
              <label htmlFor="agree" style={{ fontSize: '14px', color: '#333' }}>
                <a
                  href="/terms"
                  style={{ color: '#007bff' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  利用規約
                </a>
                に同意します
              </label>
            </div>

            <button
              type="submit"
              style={{ ...buttonStyle, opacity: formData.agreed ? 1 : 0.5 }}
              disabled={!formData.agreed}
            >
              登録してはじめる
            </button>

            <button
              type="button"
                 style={{
                   ...secondaryButtonStyle,
                   opacity: formData.agreed ? 0.9 : 0.4,
                   cursor: formData.agreed ? 'pointer' : 'not-allowed',
                 }}
                 disabled={!formData.agreed}
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
  const handleStartAsGuest = () => {
    if (!formData.agreed) {
      alert('利用規約に同意してください');
      return;
    }
    setGuest();          // ゲストフラグON（tm_guest=1）
    navigate('/store');  // Map（または既定のトップ）へ
  };

  const [formData, setFormData] = useState({
    nickname: '',
    email: '',         // ← 追加：ID（メール）
    password: '',
    showPassword: false,
    birthYear: '',
    birthMonth: '',
    gender: '',
    agreed: false,
  });

  // 既存保存値があれば初期表示に反映
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

  const handleScroll = (e) => {
    const index = Math.round(e.target.scrollLeft / window.innerWidth);
    setCurrentIndex(index);
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { nickname, email, password, birthYear, birthMonth, gender, agreed } = formData;

    if (!nickname || !email || !password || !birthYear || !birthMonth || !gender) {
      alert('すべての項目を入力してください');
      return;
    }
    if (!agreed) {
      alert('利用規約に同意してください');
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

    // 保存（MyPagePanel と同じキー）
    try {
      localStorage.setItem('user.nickname', nickname);
      localStorage.setItem('user.id', email);
      localStorage.setItem('user.birthYear', birthYear);
      localStorage.setItem('user.birthMonth', birthMonth);
      localStorage.setItem('user.gender', gender);
      localStorage.setItem('user.pass', password);
    } catch {}

    // ★ ここで登録済みに昇格（以後、評価機能が使える）
    setUserId(email);      // 発番ロジックが別なら、そのID文字列を渡す
    navigate('/store');    // 既存の遷移先に合わせています（Mapが'/'なら'/'に）
  };

  const allSlides = slides(formData, setFormData, handleChange, handleSubmit, handleStartAsGuest);

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
          <div key={index} className={`dot ${index === currentIndex ? 'active' : ''}`} />
        ))}
      </div>
    </div>
  );
}

