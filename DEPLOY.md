# 安全更新部署说明

## 本次更新内容

### 1. 安全修复（重要）
- **移除了前端硬编码的 Turso Token** - 之前 Token 暴露在 `src/lib/turso.ts` 中，任何人都可以直接用 AI 脚本绕过前端限制攻击数据库
- **所有数据库操作现在走后端 tRPC API** - Token 只在 Vercel 服务端环境变量中保存

### 2. 新增防护机制
- **30分钟发帖冷却** - 同一个指纹发布帖子后，30分钟内不能再次发布（即使删除原帖）
- **每人只能发一帖** - 已有帖子的用户不能重复发布
- **内容关键词过滤** - 自动拦截包含广告链接、诈骗关键词的内容
- **最小内容长度限制** - 标题至少3字符，描述至少10字符
- **输入消毒** - 自动去除零宽字符和多余空白

### 3. 前端体验改进
- 发帖页面显示冷却倒计时
- 已发帖用户会看到提示横幅
- 编辑帖子也增加内容安全检查

---

## 部署步骤

### 步骤1：在 Vercel 后台设置环境变量

进入 [Vercel Dashboard](https://vercel.com/dashboard) → 你的项目 → Settings → Environment Variables，添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `TURSO_DATABASE_URL` | `https://ec-market-xingfangfa41-png.aws-ap-northeast-1.turso.io` | Turso 数据库地址 |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOiJFZERTQSIs...` | 你的 Turso Token |

> **注意**：这个 Token 之前暴露在前端代码中。建议去 Turso 控制台重新生成一个新的 Token，然后用新的 Token。

### 步骤2：执行数据库迁移

登录 Turso CLI 或使用 Turso 的 Web UI 执行迁移：

```bash
# 使用 Turso CLI
turso db shell ec-market-xingfangfa41-png < db/migrations/001_add_last_posted_at.sql
```

或者直接在 Turso Web 控制台中运行 SQL：
```sql
ALTER TABLE publishers ADD COLUMN last_posted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_publishers_last_posted_at ON publishers(last_posted_at);
```

### 步骤3：推送代码到 GitHub

代码推送到 main 分支后，Vercel 会自动部署：

```bash
git add .
git commit -m "安全更新：移除暴露的Token，添加30分钟发帖冷却和内容过滤"
git push origin main
```

### 步骤4：验证部署

1. 打开网站测试浏览帖子列表是否正常
2. 尝试发布帖子，检查30分钟冷却是否生效
3. 检查已发帖用户是否无法重复发布

---

## 关于数据库 Token

**强烈建议更换 Turso Token**：

由于之前的 Token 已经暴露在前端代码中（可能被 GitHub 历史记录保存），建议去 Turso 控制台：
1. 删除旧 Token
2. 生成新 Token
3. 在 Vercel 环境变量中更新为新的 Token

---

## 技术架构变化

| 项目 | 之前 | 之后 |
|------|------|------|
| 前端数据库访问 | 直连 Turso（Token暴露） | 通过 tRPC 调用后端 API |
| 发帖限制 | 仅前端检查（可绕过） | 后端强制30分钟冷却 |
| 内容过滤 | 无 | 关键词黑名单过滤 |
| 每人发帖数 | 仅前端检查 | 后端+前端双重校验 |
