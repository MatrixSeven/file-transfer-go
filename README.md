# 文件快传 - P2P文件传输工具


**安全、快速、简单的点对点文件传输解决方案 - 无需注册，即传即用**

## [在线体验](https://transfer.52python.cn) • [GitHub](https://github.com/MatrixSeven/file-transfer-go) • [X 关注我](https://x.com/_MatrixSeven)

![项目演示](img.png)



## ✨ 核心功能 [端到端数据传输完全基于 WebRTC 的 P2P 直连]
<div align="center">

![React](https://img.shields.io/badge/React-18-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![Go](https://img.shields.io/badge/Go-1.22-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-green.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-blue.svg)

</div>

- 📁 **文件传输** - 支持多文件同时传输
- 📝 **文字传输** - 快速分享文本内容
- 🖥️ **桌面共享** - 实时屏幕共享
- 🔗 **连接状态同步** - 实时连接状态 UI 同步
- 🔒 **端到端加密** - 数据传输安全，服务器不存储文件
- 📱 **响应式设计** - 完美适配手机、平板、电脑
- 🖥️ **多平台支持** - 支持 Linux / macOS / Windows 单文件部署

## 🔄 最近更新日志

### 2025-09--1
- ✅ **移动端桌面全屏** - 优化移动端下 UI，并解决全屏问题

### 2025-08-28
- ✅ **完善 Docker 部署支持** - 优化 Docker 配置，支持一键部署和多环境配置
- ✅ **优化 README 文档** - 更新项目说明，完善部署指南和技术栈信息
- ✅ **改进 UI 用户体验** - 优化界面细节，完善错误提示和加载状态
- ✅ **重构 Hooks 架构** - 拆分复杂 hooks，提高代码复用性和可维护性

### 2025-08-24
- ✅ **文件传输 ACK 确认支持** - 实现了可靠的数据传输机制，每个数据块都需要接收方确认
- ✅ **修复组件渲染后重复注册/解绑 BUG** - 解决了 React 组件重复渲染导致的处理器反复注册问题
- ✅ **修复进度显示 Infinity% 问题** - 解决了除零错误和进度闪烁问题

### 2025-08-14
- ✅ **分离 UI 组件，统一 UI 状态** - 重构 UI 架构，提高代码复用性和可维护性
- ✅ **共享底层链接** - 优化 WebRTC 连接管理，支持多个业务模块共享连接
- ✅ **远程桌面支持** - 新增实时屏幕共享功能
- ✅ **修复 WebRTC 连接状态异常** - 增强了连接状态错误处理和恢复能力

## 🚀 技术栈

### 前端技术栈
- **Next.js 15** - React 全栈框架，支持 SSR/SSG
- **React 18** - 现代化 UI 组件库
- **TypeScript 5** - 类型安全的 JavaScript 超集
- **Tailwind CSS 3.4** - 实用优先的 CSS 框架
- **Radix UI** - 无障碍访问的组件库
- **Zustand** - 轻量级状态管理
- **Lucide React** - 现代化图标库

### 后端技术栈
- **Go 1.22** - 高性能编程语言
- **WebSocket** - 实时双向通信
- **内存存储** - 轻量级数据存储
- **标准库** - 原生 HTTP 服务器

### 传输协议
- **WebRTC DataChannel** - 端到端数据传输
- **P2P 直连** - 点对点连接，无需中转
- **ICE 框架** - 网络连接协商
- **STUN/TURN** - NAT 穿透支持


### 架构特点
- **微服务架构** - 前后端分离
- **实时通信** - WebSocket + WebRTC
- **响应式设计** - 移动端适配
- **容器化** - Docker 部署支持

## 📦 快速部署

### 方式一：Docker 一键部署（推荐）

```bash
# 使用 Docker Compose（最简单）
git clone https://github.com/MatrixSeven/file-transfer-go.git
cd file-transfer-go
docker-compose up -d

# 或者直接使用 Docker 镜像
docker run -d -p 8080:8080 --name file-transfer-go matrixseven/file-transfer-go:latest
```

### 方式二：本地构建部署

```bash
git clone https://github.com/MatrixSeven/file-transfer-go.git
cd file-transfer-go
./build-fullstack.sh 
./dist/file-transfer-go
```

访问 `http://localhost:8080` 开始使用

### 方式三：开发环境部署

```bash
# 后端服务
make dev

# 前端服务（新终端）
cd chuan-next && yarn && yarn dev
```

### 部署配置说明

#### 环境变量配置
- `NODE_ENV`: 运行环境（development/production）
- `PORT`: 服务端口（默认 8080）
- `GO_BACKEND_URL`: 后端服务地址

#### Docker 配置选项
```yaml
# docker-compose.yml 可配置项
environment:
  - NODE_ENV=production
  - PORT=8080
ports:
  - "8080:8080"
restart: unless-stopped
```

#### 多架构支持
项目支持多架构 Docker 镜像：
- `linux/amd64` - x86_64 架构
- `linux/arm64` - ARM 64位架构

#### 镜像版本
- `latest` - 最新稳定版本
- `v1.0.x` - 特定版本号
- `dev` - 开发版本

## 🎯 使用方法

### 发送文件
1. 选择文件 → 生成取件码 → 分享 6 位码

### 文字传输
1. 输入文字内容 → 生成取件码 → 分享给对方

### 桌面共享
1. 点击共享桌面 → 生成取件码 → 对方输入码观看

## 📊 项目架构

```
发送方 ←─── WebSocket 信令 ───→ 服务器 ←─── WebSocket 信令 ───→ 接收方
   │                                                            │
   └────────────── WebRTC P2P 直连传输 ──────────────────────────┘
```

## 🛠️ 本地开发

```bash
# 后端
make dev

# 前端
cd chuan-next && yarn && yarn dev
```

## 📄 许可证

MIT License

---

<div align="center">

⭐ 如果觉得这个项目对你有帮助，请给个星标！

[![Star History Chart](https://api.star-history.com/svg?repos=MatrixSeven/file-transfer-go&type=timeline)]

</div>
