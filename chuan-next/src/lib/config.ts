/**
 * 环境配置管理
 */

// 安全的环境变量访问
const getEnv = (key: string, defaultValue: string = '') => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || defaultValue;
    }
  } catch {
    // 在浏览器环境中忽略错误
  }
  return defaultValue;
};

// 动态获取当前域名和协议
const getCurrentBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // 客户端运行时，使用当前页面的 origin
    return window.location.origin;
  }
  // 服务器端默认值
  return 'http://localhost:8080';
};

// 动态获取 WebSocket URL - 总是在客户端运行时计算
const getCurrentWsUrl = () => {
  // return "ws://192.168.1.120:8080"
  if (typeof window !== 'undefined') {
    // 检查是否是 Next.js 开发服务器（端口 3000 或 3001）
    const isNextDevServer = window.location.hostname === 'localhost' &&
      (window.location.port === '3000' || window.location.port === '3001');

    if (isNextDevServer) {
      // 开发模式：通过 Next.js 开发服务器访问，连接到后端 WebSocket
      return 'ws://localhost:8080';
    }

    // 生产模式或通过 Go 服务器访问：使用当前域名和端口
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  // 服务器端返回空字符串，强制在客户端计算
  return '';
};

export const config = {
  // 环境判断
  isDev: getEnv('NODE_ENV') === 'development',
  isProd: getEnv('NODE_ENV') === 'production',
  isStatic: typeof window !== 'undefined', // 客户端运行时认为是静态模式

  // API配置
  api: {
    // 后端API地址 (服务器端使用)
    backendUrl: getEnv('GO_BACKEND_URL', 'http://localhost:8080'),

    // 前端API基础URL (客户端使用) - 开发模式下调用 Next.js API 路由
    baseUrl: getEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3000'),

    // 直接后端URL (客户端在静态模式下使用) - 如果环境变量为空，则使用当前域名
    directBackendUrl: getEnv('NEXT_PUBLIC_BACKEND_URL') || getCurrentBaseUrl(),

    // WebSocket地址 - 在客户端运行时动态计算，不在构建时预设
    wsUrl: '', // 将通过 getWsUrl() 函数动态获取
  },

  // 超时配置
  timeout: {
    api: 30000, // 30秒
    ws: 60000,  // 60秒
  },

  // 重试配置
  retry: {
    max: 3,
    delay: 1000,
  },
}

/**
 * 获取后端API完整URL
 * @param path API路径
 * @returns 完整的API URL
 */
export function getBackendUrl(path: string): string {
  const baseUrl = config.api.backendUrl.replace(/\/$/, '')
  const apiPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${apiPath}`
}

/**
 * 获取前端API完整URL (通过 Next.js API 路由)
 * @param path API路径
 * @returns 完整的API URL
 */
export function getApiUrl(path: string): string {
  const baseUrl = config.api.baseUrl.replace(/\/$/, '')
  const apiPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${apiPath}`
}

/**
 * 获取直接后端URL (客户端直接调用后端)
 * @param path API路径
 * @returns 完整的API URL
 */
export function getDirectBackendUrl(path: string): string {
  // 实时获取当前域名（支持动态域名）
  const baseUrl = (getEnv('NEXT_PUBLIC_BACKEND_URL') || getCurrentBaseUrl()).replace(/\/$/, '')
  const apiPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${apiPath}`
}

/**
 * 获取WebSocket URL - 总是在客户端运行时动态计算
 * @returns WebSocket连接地址
 */
export function getWsUrl(): string {
  // 优先使用环境变量
  const envWsUrl = getEnv('NEXT_PUBLIC_WS_URL');
  if (envWsUrl) {
    return envWsUrl;
  }

  // 如果是服务器端（SSG构建时），返回空字符串
  if (typeof window === 'undefined') {
    return '';
  }

  // 客户端运行时动态计算
  return getCurrentWsUrl();
}

/**
 * 环境配置调试信息
 */
export function getEnvInfo() {
  return {
    environment: getEnv('NODE_ENV'),
    backendUrl: config.api.backendUrl,
    baseUrl: config.api.baseUrl,
    directBackendUrl: getDirectBackendUrl(''), // 实时获取
    wsUrl: getWsUrl(), // 实时获取
    currentOrigin: typeof window !== 'undefined' ? window.location.origin : 'server-side',
    isDev: config.isDev,
    isProd: config.isProd,
    isStatic: config.isStatic,
  }
}
