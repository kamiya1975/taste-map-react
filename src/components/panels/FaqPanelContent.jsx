import React from "react";

export default function FaqPanelContent() {
  const P = (props) => (
    <p style={{ margin: "8px 0", lineHeight: 1.9, fontSize: 15, color: "#222" }} {...props} />
  );
  const H = ({ children }) => (
    <h3 style={{ margin: "18px 0 10px", fontSize: 16, fontWeight: 700, color: "#111" }}>
      {children}
    </h3>
  );
  const Q = ({ children }) => (
    <div style={{ fontWeight: 700, marginTop: 12, color: "#111" }}>Q. {children}</div>
  );
  const A = ({ children }) => <div style={{ marginTop: 4, color: "#222" }}>A. {children}</div>;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "16px 16px 28px",
          background: "#f6f3ee",
          minHeight: "100%",
        }}
      >
        <H>よくある質問</H>

        <Q>位置情報を許可しないと使えない？</Q>
        <A>許可しなくても使えます。東京駅を基準に進めます。</A>

        <Q>店舗が出てこない／固定店舗が変わらない</Q>
        <A>
          <span>stores.mock.json の配置と、マイページの「モック読み込み」を確認してください。</span>
        </A>

        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <H>データの扱い</H>
        <P>
          現在は DB 未接続のため、プロフィール・店舗・お気に入りはブラウザの
          <code style={{ padding: "0 4px", background: "rgba(0,0,0,.06)", borderRadius: 4 }}>
            localStorage
          </code>
          に保存します。
        </P>
        <P>
          店舗一覧は <code>/api/stores</code> 失敗時に{" "}
          <code>/stores.mock.json</code>（ダミーデータ）へフォールバックします。
        </P>
        <P>本番は、杉浦さんの管理ページAPI（FastAPI 想定）に差し替え予定です。</P>
      </div>
    </div>
  );
}
