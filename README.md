# Tsugi

ローカルの Claude Code / Codex CLI セッションをGUIで操作・自動化するデスクトップアプリ。

## 主な機能

- **セッション管理** - 複数のプロジェクトに対して Claude Code / Codex セッションを同時起動・操作
- **プロンプトキュー** - 複数プロンプトをキューに登録し順次自動実行
- **実行制御** - 手動/自動モード切替、一時停止、スキップ、リトライ、タイムアウト
- **フロー** - プロンプトチェーンを名前付きフローとして保存・再利用（JSON/YAML）
- **条件分岐・ループ** - 出力に応じた分岐、条件ループ、バリデーション、承認ゲート
- **モニタリング** - ツール使用の可視化、トークン使用量・コスト見積もり
- **履歴** - SQLite による実行ログの永続化、検索・再実行
- **Git worktree** - フロー実行時に隔離された作業環境を自動作成
- **通知** - フロー完了・失敗・承認待ちのシステム通知
- **設定** - デフォルト CLI、実行モード、タイムアウト、キーボードショートカット

## 技術スタック

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust (Tauri v2)
- **データベース**: SQLite (rusqlite)
- **パッケージマネージャ**: pnpm

## 開発

```bash
# 依存インストール
pnpm install

# 開発サーバー起動
pnpm tauri dev

# ビルド
pnpm tauri build

# テスト
pnpm test                        # フロントエンド
cd src-tauri && cargo test       # バックエンド

# Lint
pnpm lint                        # ESLint
cd src-tauri && cargo clippy     # Clippy
```

## リリース

タグを push すると GitHub Actions で macOS (Apple Silicon)・Linux・Windows 向けにビルドされ、GitHub Release に添付されます。

```bash
git tag v0.9.0
git push origin v0.9.0
```
