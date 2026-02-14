// src/pages/TermsPage.jsx
// 利用規約ページ(パネル)
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import PanelHeader from "../components/ui/PanelHeader";

export default function TermsPage({ onClose }) {
  // SliderPage と同じ：Terms表示中だけスクロールロック
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevOverscroll = document.documentElement.style.overscrollBehaviorY;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overscrollBehaviorY = prevOverscroll;
    };
  }, []);

//  return (
//    <div
//      style={{
//        position: "fixed",
//        inset: 0,
//        background: "#fff",
//        zIndex: 3000, // 既存Drawer群より上
//        display: "flex",
//        flexDirection: "column",
//      }}
//      role="dialog"
//      aria-modal="true"
//    >
//      <PanelHeader title="利用規約" icon="doc.svg" onClose={onClose} />
//
//      <div
//        style={{
//          flex: 1,
//          overflowY: "auto",
//          padding: 16,
//          lineHeight: 1.65,
//          WebkitOverflowScrolling: "touch",
//        }}
//      >
  const node = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 5000, // Drawerより確実に上
        display: "flex",
        flexDirection: "column",
      }}
      role="dialog"
      aria-modal="true"
    >
      <PanelHeader title="利用規約" icon="app-guide.svg" onClose={onClose} />
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          lineHeight: 1.65,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* ここに利用規約本文 */}
        <h3 style={{ margin: "8px 0" }}>TasteMap 利用規約</h3>
        <p style={{ margin: "8px 0" }}>
          制定日：2026年2月1日<br></br>株式会社TasteDatabank（以下「当社」といいます。）
        </p>
        <h3 style={{ margin: "8px 0" }}>第1条（適用）</h3>
        <p style={{ margin: "8px 0" }}>
          1、本規約は、当社が提供するアプリケーション「TasteMap」（以下「本サービス」といいます。）の利用条件を定めるものです。<br></br>
          2、利用者は、本規約および別途定めるプライバシーポリシーに同意の上、本サービスを利用するものとします。
        </p>
        <h3 style={{ margin: "8px 0" }}>第2条（サービス内容）</h3>
        <p style={{ margin: "8px 0" }}>
          本サービスは、以下の機能を提供します。<br></br>
          1、ワインの味覚マップ表示<br></br>
          2、商品検索および閲覧<br></br>
          3、ワイン評価・記録機能<br></br>
          4、店舗選択機能<br></br>
          5、EC購入連携機能<br></br>
          6、マイル付与制度
        </p>
        <h3 style={{ margin: "8px 0" }}>第3条（アカウント）</h3>
        <p style={{ margin: "8px 0" }}>
          1、利用者は正確な情報を登録するものとします。<br></br>
          2、ログインID（メールアドレス）は、EC購入時のメールアドレスと同一である必要があります。<br></br>
          3、アカウント管理は利用者の責任で行うものとします。
        </p>
        <h3 style={{ margin: "8px 0" }}>第4条（位置情報）</h3>
        <p style={{ margin: "8px 0" }}>
          1、本サービスは、店舗表示および評価記録の目的で位置情報を取得する場合があります。<br></br>
          2、位置情報は利用者の同意がある場合に限り取得されます。
        </p>
        <h3 style={{ margin: "8px 0" }}>第5条（評価データおよび研究利用）</h3>
        <p style={{ margin: "8px 0" }}>
          1、利用者が入力した評価データは、サービス改善および統計分析に利用されます。<br></br>
          2、当該データは、個人を特定できない形式に加工したうえで、学術研究、論文、発表等に利用される場合があります。
        </p>
        <h3 style={{ margin: "8px 0" }}>第6条（EC購入）</h3>
        <p style={{ margin: "8px 0" }}>
          1、本サービスにおけるEC購入は、Shopifyプラットフォームを利用して行われます。<br></br>
          2、売買契約は、当社または提携販売事業者と利用者との間で成立します。<br></br>
          3、決済・配送・返品等は、各販売条件に従います。<br></br>
          4、未成年者による酒類購入は禁止します。
        </p>
        <h3 style={{ margin: "8px 0" }}>第7条（マイル制度）</h3>
        <p style={{ margin: "8px 0" }}>
          1、付与 <br></br>
          マイルは、当社が定めるEC購入金額に応じて付与されます。<br></br>
          2、有効期限<br></br>
            2-1 マイルの有効期限は、各マイルの付与日から12か月間とします。<br></br>
            2-2 有効期限を経過したマイルは自動的に失効します。<br></br>
            2-3 失効はアプリ内表示その他当社が定める方法により通知します。<br></br>
          3、換金・譲渡<br></br>
            3-1 マイルは金銭的価値を有するものではなく、現金への交換はできません。<br></br>
            3-2 マイルの第三者への譲渡は禁止します。<br></br>
          4. 制度変更<br></br>
          当社は、合理的な告知期間をもって、マイル制度を変更または終了することがあります。 
        </p>
        <h3 style={{ margin: "8px 0" }}>第8条（禁止事項）</h3>
        <p style={{ margin: "8px 0" }}>
          利用者は、以下の行為を行ってはなりません。<br></br>
          1、不正アクセス<br></br>
          2、データ改ざん<br></br>
          3、他者へのなりすまし<br></br>
          4、本サービスのスクレイピング<br></br>
          5、味覚マップ座標データの無断利用<br></br>
          6、法令違反行為
        </p>
        <h3 style={{ margin: "8px 0" }}>第9条（知的財産権）</h3>
        <p style={{ margin: "8px 0" }}>
          TasteMapのアルゴリズム、味覚マップ構造、表示デザイン等は当社の知的財産です。
        </p>
        <h3 style={{ margin: "8px 0" }}>第10条（免責）</h3>
        <p style={{ margin: "8px 0" }}>
          1、味覚マップは参考情報であり、味覚には個人差があります。<br></br>
          2、システム障害等による損害について、当社は責任を負いません。
        </p>
        <h3 style={{ margin: "8px 0" }}>第11条（規約変更）</h3>
        <p style={{ margin: "8px 0" }}>
          本規約は変更されることがあります。変更後はアプリ内表示をもって効力を生じます。
        </p>
        <h3 style={{ margin: "8px 0" }}>第12条（準拠法）</h3>
        <p style={{ margin: "8px 0" }}>
          本規約は日本法に準拠し、岡崎地方裁判所を専属的合意管轄裁判所とします。
        </p>
        <p style={{ margin: "8px 0" }}><br></br></p>
        <h3 style={{ margin: "8px 0" }}>TasteMap プライバシーポリシー</h3>
        <p style={{ margin: "8px 0" }}>
          制定日：2026年2月1日<br></br>株式会社TasteDatabank
        </p>
        <h3 style={{ margin: "8px 0" }}>1. 取得する情報</h3>
        <p style={{ margin: "8px 0" }}>
          （1）アカウント情報<br></br>
          ・ニックネーム<br></br>
          ・メールアドレス<br></br>
          ・生年月<br></br>
          ・性別<br></br>
          （2）利用情報<br></br>
          ・ワイン評価データ<br></br>
          ・「飲みたい」登録情報<br></br>
          ・店舗選択情報<br></br>
          ・マイル履歴<br></br>
          （3）位置情報<br></br>
          利用者の同意がある場合に取得します。<br></br>
          （4）EC関連情報<br></br>
          ・注文識別子（注文ID等）<br></br>
          ・購入金額、通貨、決済状態<br></br>
          ・マイル付与判定に必要な情報<br></br>
          ※配送先氏名、住所、電話番号等は原則としてShopify側で取得・管理されます。<br></br>
          ※当社は、注文処理・不正防止・障害調査の目的で、Shopifyから受領した注文関連データ（Webhook等）をログとして保存する場合があります。当該ログには配送先情報等が含まれることがあります。
        </p>
        <h3 style={{ margin: "8px 0" }}>2. 利用目的</h3>
        <p style={{ margin: "8px 0" }}>
          1、サービス提供<br></br>
          2、EC購入処理およびマイル付与<br></br>
          3、不正防止・障害対応<br></br>
          4、統計分析・サービス改善<br></br>
          5、学術研究（個人を特定できない形式に加工したもの）
        </p>
        <h3 style={{ margin: "8px 0" }}>3. 保存期間</h3>
        <p style={{ margin: "8px 0" }}>
          1、アカウント情報および利用情報は、利用目的に必要な期間保存します。<br></br>
          2、注文関連ログ（Webhook等）は、原則として90日間保存し、その後削除または匿名化します。
        </p>
        <h3 style={{ margin: "8px 0" }}>4. 第三者提供</h3>
        <p style={{ margin: "8px 0" }}>
          法令に基づく場合、または業務委託先（Shopify等）への必要範囲での提供を除き、第三者へ提供しません。
        </p>
        <h3 style={{ margin: "8px 0" }}>5. 安全管理措置</h3>
        <p style={{ margin: "8px 0" }}>
          当社は、個人情報の漏えい等を防止するため、適切な安全管理措置を講じます。
        </p>
        <h3 style={{ margin: "8px 0" }}>6. 開示等の請求</h3>
        <p style={{ margin: "8px 0" }}>
          利用者は、自己の個人情報について開示、訂正、削除等を請求できます。
        </p>
        <h3 style={{ margin: "8px 0" }}>7. 改定</h3>
        <p style={{ margin: "8px 0" }}>
          本ポリシーは変更されることがあります。
        </p>
      </div>
    </div>
  );

  // body直下に出す（Drawer/iframe/transformの影響を受けない）
  return createPortal(node, document.body);
}
