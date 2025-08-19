import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const mockStores = [
  {
    name: "スーパーマーケットA",
    branch: "●●●店",
    lat: 34.928,
    lng: 137.05,
    prefecture: "北海道",
    products: ["4935919319140", "4935919080316"],
  },
  {
    name: "スーパーマーケットB",
    branch: "●●●店",
    lat: 34.93,
    lng: 137.04,
    prefecture: "北海道",
    products: ["4935919058186"],
  },
  {
    name: "スーパーマーケットA",
    branch: "●●●店",
    lat: 34.92,
    lng: 137.06,
    prefecture: "青森県",
    products: ["850832004260"],
  },
  {
    name: "スーパーマーケットC",
    branch: "●●●店",
    lat: 34.925,
    lng: 137.045,
    prefecture: "岩手県",
    products: ["4935919071604"],
  },
  {
    name: "スーパーマーケットD",
    branch: "●●●店",
    lat: 34.927,
    lng: 137.042,
    prefecture: "宮城県",
    products: ["4935919193559", "4935919197175"],
  },
  {
    name: "スーパーマーケットA",
    branch: "●●●店",
    lat: 34.93,
    lng: 137.055,
    prefecture: "宮城県",
    products: ["4935919052504"],
  },
];

const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function StorePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("nearby");
  const [expanded, setExpanded] = useState(null);
  const [sortedStores, setSortedStores] = useState(mockStores);

  useEffect(() => {
    const askForLocation = async () => {
      const allow = window.confirm("近くの購入した店舗を探します。位置情報を取得しても良いですか？");
      if (allow) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const updated = mockStores.map((store) => {
              const distance = haversineDistance(latitude, longitude, store.lat, store.lng);
              return { ...store, distance: distance.toFixed(1) };
            });
            setSortedStores(updated.sort((a, b) => a.distance - b.distance));
            setTab("nearby");
          },
          (error) => {
            console.error("位置取得エラー:", error);
            alert("位置情報の取得に失敗しました。店舗一覧を表示します。");
            setTab("list");
          }
        );
      } else {
        setTab("list");
      }
    };
    askForLocation();
  }, []);

  const handleStoreSelect = (store) => {
    navigate("/map", { state: { selectedStore: store, autoOpenSlider: true } });
  };

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", overflow: "hidden" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          width: "100%",
          maxWidth: "500px",
          backgroundColor: "#fff",
          zIndex: 100,
          borderBottom: "1px solid #ccc",
        }}
      >
        <div style={{ padding: "16px", textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>購入した店舗を選んでください。</h2>
        </div>

        <div style={{ display: "flex" }}>
          <div
            onClick={() => setTab("nearby")}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "12px 0",
              backgroundColor: tab === "nearby" ? "#000" : "#ccc",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            近い店舗
          </div>
          <div
            onClick={() => setTab("list")}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "12px 0",
              backgroundColor: tab === "list" ? "#000" : "#ccc",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            店舗一覧
          </div>
        </div>
      </div>

      <div
        style={{
          paddingTop: "120px",
          overflowY: "auto",
          height: "100vh",
          maxWidth: "500px",
          margin: "0 auto",
          backgroundColor: "#fff",
        }}
      >
        {tab === "nearby" &&
          sortedStores.map((store, idx) => (
            <div
              key={idx}
              onClick={() => handleStoreSelect(store)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
              }}
            >
              <div style={{ textDecoration: "underline", color: "#007bff" }}>
                {store.name} {store.branch}
              </div>
              <div>{store.distance}km</div>
            </div>
          ))}

        {tab === "list" &&
          prefectures.map((pref, idx) => {
            const storesInPref = mockStores.filter((s) => s.prefecture === pref);
            const isOpen = expanded === pref;

            return (
              <React.Fragment key={idx}>
                <div
                  onClick={() => setExpanded(isOpen ? null : pref)}
                  style={{
                    padding: "12px",
                    fontWeight: "bold",
                    backgroundColor: "#f0f0f0",
                    borderBottom: "1px solid #ccc",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <span>{pref}</span>
                  <span>{isOpen ? "▲" : "▼"}</span>
                </div>

                {isOpen &&
                  storesInPref.map((store, i) => (
                    <div
                      key={i}
                      onClick={() => handleStoreSelect(store)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        cursor: "pointer",
                        backgroundColor: "#fff",
                      }}
                    >
                      <div style={{ textDecoration: "underline", color: "#007bff" }}>
                        {store.name} {store.branch}
                      </div>
                      <div>{tab === "nearby" ? `${store.distance}km` : null}</div>
                    </div>
                  ))}
              </React.Fragment>
            );
          })}
      </div>
    </div>
  );
}
