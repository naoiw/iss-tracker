# ISS TRACKER

ISS（国際宇宙ステーション）の現在位置と前後約90分の予測軌道を、操作可能な3D地球儀に表示するWebアプリです。world-weatherと同じダーク系UIをベースにしています。

## 機能

- 3D地球儀（Three.js）。ドラッグ・スワイプで回転、ホイール・ピンチで拡大縮小
- ISSの現在位置と直下点。過去90分の軌道は青緑、未来90分の予測軌道はオレンジ
- 現在位置はWhere the ISS at? APIから30秒ごとに取得。APIが返す緯度・経度・高度・速度・日照状況を表示
- 同じAPIのTLEを約3時間ごとに取得し、satellite.jsのSGP4でブラウザ内計算。地球儀上のマーカーは毎秒移動
- FOCUS ISSは初期状態でオン。カメラがISSを継続追従し、手動操作で解除できる。FOCUS ISSとAUTO ROTATEは排他切り替え、軌道表示も切り替え可能
- 太陽位置に基づいた昼夜表現、星空、モバイル対応
- APIエラーと最終取得時刻の明示。ダミーデータへの置き換えはしない

**注意:** 軌道とマーカーの秒単位の位置はTLEからの予測値です。APIから取得する位置情報は30秒ごとに更新されます。軌道修正などにより予測と実測/最新推定に差が出る場合があります。

## 公開

| 環境 | ブランチ | URL |
| --- | --- | --- |
| 本番 | `main` | https://naoiw.github.io/iss-tracker/ |
| 開発プレビュー | `develop` | https://naoiw.github.io/iss-tracker/develop/ |

初期実装は`develop`に配置し、確認後にPull Requestで`main`へ反映します。

## ローカル実行

```bash
git clone https://github.com/naoiw/iss-tracker.git
cd iss-tracker
git switch develop
npm install
npm run dev
npm test
npm run build
```

## 構成

- `src/App.tsx`：画面、ISS情報、操作UI
- `src/components/EarthGlobe.tsx`：地球儀、ISSマーカー、過去/未来の軌道
- `src/hooks/useIss.ts`：API取得、更新、エラー処理
- `src/lib/iss.ts`：APIレスポンス検証、TLE/SGP4、軌道算出
- `src/lib/astronomy.ts`：地球座標・太陽位置
- `src/styles.css`：デザイン・スマホ対応
- `tests/`：計算とデータ検証
- `docs/`：仕様・開発・デプロイの注意点
- `.github/workflows/`：検証・Pages

## 技術・データ出典

- React / TypeScript / Vite / Three.js / satellite.js (SGP4)
- [Where the ISS at?](https://wheretheiss.at/w/developer) (APIキー不要、約1リクエスト/秒制限。利用条件に従う)
- 地球テクスチャ： [three-globeの公開サンプル](https://github.com/vasturiano/three-globe)。画像の権利は提供元に帰属します。
- 自作コード：[MIT License](LICENSE)
