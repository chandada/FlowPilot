# GitHub Push Skill

## 用途
快速将本地 Git 仓库推送到 GitHub，支持自动配置远程仓库和 Token 认证。

## 位置
`.skills/github-push/`

## 使用方法

### 方式 1: 直接推送当前仓库
```bash
cd /path/to/repo
./.skills/github-push/push.sh chandada/FlowPilot master "commit message"
```

### 方式 2: 使用默认配置
```bash
./.skills/github-push/push.sh
```

### 方式 3: 指定 Token
```bash
./.skills/github-push/push.sh chandada/FlowPilot master YOUR_TOKEN_HERE
```

## 配置

### Token 存储
Token 已存储在以下位置：
- `.skills/github-push/push.sh` - 脚本内默认 Token
- `~/.git-credentials` - Git Credential Store

### 修改 Token
编辑 `.skills/github-push/push.sh` 第 5 行：
```bash
TOKEN="${3:-your_new_token_here}"
```

## 安全说明
- Token 仅存储在本地
- 不要将 Token 提交到代码库
- 定期轮换 Token
- 使用 Fine-grained token 限制权限范围

## 故障排除
- 403 Permission denied: Token 权限不足，需要 `repo` scope
- Repository not found: 检查仓库名是否正确
- Authentication failed: Token 过期或无效

## 示例
```bash
# 推送当前仓库到 chandada/FlowPilot
cd /home/tree/github/FlowPilot
./.skills/github-push/push.sh chandada/FlowPilot master

# 推送带自定义 commit message
./.skills/github-push/push.sh chandada/FlowPilot master "feat: add new feature"
```
