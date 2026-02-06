// src/components/panels/FaqPanelContent.jsx
// よくある質問パネル
import React from "react";

export default function FaqPanelContent() {
  const Q = ({ children }) => (
    <div style={{ fontWeight: 700, marginTop: 12, color: "#111" }}>Q. {children}</div>
  );
  const A = ({ children }) => <div style={{ marginTop: 6, color: "#222" }}>A. {children}</div>;

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
        <Q>位置情報を許可しないと使えない？</Q>
        <A>許可しなくても使えます。許可しない場合は東京駅を基準に進めます。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>検索パネルの商品は何の一覧？</Q>
        <A>マップに打点されている商品の一覧です。初めに選択した店舗と、お気に入り店舗登録で選択した店舗の取扱商品が表示されます。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>マップの打点が少ないけど増やせるの？</Q>
        <A>はい、できます。お気に入り店舗登録パネルで店舗を選択すると、その店舗の取扱商品が打点され、マップの表示商品が増えていきます。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>選択したお気に入り店舗って変えられる？</Q>
        <A>初めに選択した店舗は固定となり取扱解除することはできませんが、それ以外の店舗については、お気に入り店舗登録パネルの星形をタップすることで登録/解除ができます。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>獲得マイルってなに？</Q>
        <A>EC購入の金額に応じて獲得できるアプリ内で使用できるマイルです。マイルを使ってアプリ内の特典サービスを受けることができます。（特典サービスについては準備中です）</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>商品詳細にある「飲みたい」の星形を押すとどうなるの？</Q>
        <A>評価・飲みたい一覧パネルに追加され、あとから探しやすくなります。評価すると飲みたいフラグが外れて評価アイコンへと変わります。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>打点が小さくて見たい詳細が見れないけどどうすればいい？</Q>
        <A>スマホ画面をピンチアウト（2本の指で広げる動作）するとマップが拡大されます。また、検索パネルの商品一覧をタップすると詳細が開き、打点が画面中心に表示されます。どの位置なのか確認することができるので、よろしければご利用ください。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>検索するとこにバーコードボタンがあるけど何ができるの？</Q>
        <A>カメラスキャンによるバーコード検索ができます。マップに表示されていなくても商品登録があるものは詳細が表示されます。</A>
        <div style={{ height: 1, background: "rgba(0,0,0,.08)", margin: "18px 0 8px" }} />

        <Q>IDやパスワードを忘れたらどうすればいい？</Q>
        <A>新たにアカウントを作成してください。獲得したマイルを引継ぐことはできませんので、できるだけログインしたままの状態でご利用ください。</A>

      </div>
    </div>
  );
}
