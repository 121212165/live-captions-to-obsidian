# 贡献指南 / Contributing Guide

## 开发环境

- Windows 11（必需，依赖 Live Captions 功能）
- Node.js 18+
- PowerShell 5.1+

## 本地开发

```bash
git clone <your-fork>
cd live-captions-to-obsidian
npm install
npm run lint
npm test
npx tsx src/index.ts
```

## 提交规范

使用约定式提交格式：

- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 重构
- `docs:` 文档
- `test:` 测试
- `chore:` 杂项
- `ci:` CI 配置

## PR 流程

1. 从 main 分支创建功能分支
2. 提交变更
3. 推送并创建 PR
4. 确保 CI 全部通过
5. 等待 Code Review
