# 開発とデプロイ

## 開発

Node.js 22を使用。`npm install` → `npm test` → `npm run build`。

`develop` ブランチを開発環境、`main` を本番環境として運用します。GitHub Pagesには1つのサイトをデプロイし、`/develop/` に開発版を含めます。

- `develop` push: Validate develop → 成功時にmainのDeploy to GitHub Pagesが両版を公開
- `main` push: Deploy to GitHub Pagesが本番とプレビューの両方をビルド
- `develop` → `main` のPR: 検証後にマージ

GitHub設定のPagesソースは **GitHub Actions** にする必要があります。Deploy from a branch設定ではこのワークフローは動作しません。

## 外部依存

APIはクライアントから直接呼びます。API失敗時は実数を捏造せず最後の値を保持します。APIへは閲覧端末ごとにアクセスするため、アクセス数が増える場合はGitHub Actionsによるキャッシュ方式を検討します。地球テクスチャは外部CDNから取得します（失敗した場合は単色表示）。

## テスト

- APIレスポンスの妥当性チェック
- TLEから算出した低軌道高度・軌道データの点数
- TypeScript/Vite本番ビルド

実ブラウザでのWebGL描画とPagesデプロイ結果は別途確認します。
