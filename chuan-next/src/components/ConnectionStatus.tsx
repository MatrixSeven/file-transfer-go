import { useReadConnectState } from '@/hooks/connection/state/useWebConnectStateManager';
import { Role } from '@/hooks/connection/types';
import { useWebRTCStore } from '@/hooks/index';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  // 房间信息 - 只需要这个基本信息
  currentRoom?: { code: string; role: 'sender' | 'receiver' } | null;
  // 样式类名
  className?: string;
  // 紧凑模式
  compact?: boolean;
  // 内联模式 - 只返回状态文本，不包含UI结构
  inline?: boolean;
}

// 连接状态枚举
const getConnectionStatus = (
  currentRoom: { code: string; role: Role } | null,
  connection: {
    isWebSocketConnected: boolean;
    isPeerConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    currentConnectType: 'webrtc' | 'websocket';
    isJoinedRoom: boolean;
  }
) => {
  const isWebSocketConnected = connection.isWebSocketConnected;
  const isPeerConnected = connection.isPeerConnected;
  const isConnecting = connection.isConnecting;
  const error = connection.error;
  const currentConnectType = connection.currentConnectType;
  const isJoinedRoom = connection.isJoinedRoom;

  if (!currentRoom) {
    return {
      type: 'disconnected' as const,
      message: '未连接',
      detail: '尚未创建房间',
    };
  }

  if (error) {
    return {
      type: 'error' as const,
      message: '连接失败',
      detail: error,
    };
  }


  if (currentConnectType === 'websocket') {
    if (isWebSocketConnected && isJoinedRoom) {
      return {
        type: 'connected' as const,
        message: 'P2P链接失败,WS降级中',
        detail: 'WebSocket传输模式已就绪',
      };
    }
    return {
      type: 'room-ready' as const,
      message: '房间已创建',
      detail: '等待对方加入并建立WS连接...',
    };
  }



  if (isConnecting) {
    return {
      type: 'connecting' as const,
      message: '正在连接',
      detail: '建立房间连接中...',
    };
  }

  // 如果有房间信息但WebSocket未连接，且不是正在连接状态
  // 可能是状态更新的时序问题，显示连接中状态
  if (isPeerConnected) {
    return {
      type: 'connected' as const,
      message: 'P2P连接成功',
      detail: '可以开始传输',
    };
  }
  if (!isWebSocketConnected) {
    return {
      type: 'connecting' as const,
      message: '连接中',
      detail: '正在建立WebSocket连接...',
    };
  }
  if (!isJoinedRoom) {
    return {
      type: 'room-ready' as const,
      message: '房间已创建',
      detail: '等待对方加入并建立P2P连接...',
    };
  }
  if (isJoinedRoom) {
    return {
      type: 'room-ready' as const,
      message: '对方已加入房间',
      detail: '正在建立P2P连接...',
    };
  }



  if (isJoinedRoom && !isPeerConnected) {
    return {
      type: 'room-ready' as const,
      message: '房间已创建',
      detail: '等待对方加入并建立P2P连接...',
    };
  }


  console.log('Unknown connection state:', connection);
  return {
    type: 'unknown' as const,
    message: '状态未知',
    detail: '',
  };
};

// 状态颜色映射
const getStatusColor = (type: string) => {
  switch (type) {
    case 'connected':
      return 'text-green-600';
    case 'connecting':
    case 'room-ready':
      return 'text-yellow-600';
    case 'websocket-ready':
      return 'text-orange-600';
    case 'error':
      return 'text-red-600';
    case 'disconnected':
    case 'unknown':
    default:
      return 'text-gray-500';
  }
};

// 状态图标
const StatusIcon = ({ type, className = 'w-3 h-3' }: { type: string; className?: string }) => {
  const iconClass = cn('inline-block', className);

  switch (type) {
    case 'connected':
      return <div className={cn(iconClass, 'bg-green-500 rounded-full')} />;
    case 'connecting':
    case 'room-ready':
      return (
        <div className={cn(iconClass, 'bg-yellow-500 rounded-full animate-pulse')} />
      );
    case 'websocket-ready':
      return <div className={cn(iconClass, 'bg-orange-500 rounded-full')} />;
    case 'error':
      return <div className={cn(iconClass, 'bg-red-500 rounded-full')} />;
    case 'disconnected':
    case 'unknown':
    default:
      return <div className={cn(iconClass, 'bg-gray-400 rounded-full')} />;
  }
};

// 获取连接状态文字描述
const getConnectionStatusText = (connection: { isWebSocketConnected?: boolean; isPeerConnected?: boolean; isConnecting?: boolean; error?: string | null; currentConnectType?: 'webrtc' | 'websocket' }) => {
  const isWebSocketConnected = connection?.isWebSocketConnected || false;
  const isPeerConnected = connection?.isPeerConnected || false;
  const isConnecting = connection?.isConnecting || false;
  const error = connection?.error || null;
  const currentConnectType = connection?.currentConnectType || 'webrtc';

  const wsStatus = isWebSocketConnected ? 'WS已连接' : 'WS未连接';
  const rtcStatus = isPeerConnected ? 'RTC已连接' :
    isWebSocketConnected ? 'RTC等待连接' : 'RTC未连接';

  if (error) {
    return `${wsStatus} ${rtcStatus} - 连接失败`;
  }

  if (isConnecting) {
    return `${wsStatus} ${rtcStatus} - 连接中`;
  }

  if (isPeerConnected) {
    return `${wsStatus} ${rtcStatus} - P2P连接成功`;
  }

  // 如果WebSocket已连接但P2P未连接，且当前连接类型是websocket
  if (isWebSocketConnected && !isPeerConnected && currentConnectType === 'websocket') {
    return `${wsStatus} ${rtcStatus} - P2P链接失败,将使用WS进行传输`;
  }

  return `${wsStatus} ${rtcStatus}`;
};

export function ConnectionStatus(props: ConnectionStatusProps) {
  const { currentRoom, className, compact = false, inline = false } = props;

  // 使用全局WebRTC状态
  const webrtcState = useWebRTCStore();

  // 获取连接状态
  const { getConnectState } = useReadConnectState();
  const connectionState = getConnectState();

  // 创建connection对象以兼容现有代码
  const connection = {
    isWebSocketConnected: webrtcState.isWebSocketConnected,
    isPeerConnected: webrtcState.isPeerConnected,
    isConnecting: webrtcState.isConnecting,
    error: webrtcState.error,
    currentConnectType: webrtcState.currentConnectType,
    isJoinedRoom: connectionState?.isJoinedRoom || false,
  };

  const isConnected = webrtcState.isWebSocketConnected && webrtcState.isPeerConnected;

  // 如果是内联模式，只返回状态文字
  if (inline) {
    return <span className={cn('text-sm text-slate-600', className)}>{getConnectionStatusText(connection)}</span>;
  }

  const status = getConnectionStatus(currentRoom ?? null, connection);

  if (compact) {
    return (
      <div className={cn('flex items-center', className)}>
        {/* 竖线分割 */}
        <div className="w-px h-12 bg-slate-200 mx-4"></div>

        {/* 连接状态指示器 */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <StatusIcon
              type={connection.isWebSocketConnected ? 'connected' : 'disconnected'}
              className="w-2.5 h-2.5"
            />
            <span className="text-sm text-slate-600 font-medium">WS</span>
          </div>
          <span className="text-slate-300 font-medium">|</span>
          <div className="flex items-center gap-1.5">
            <StatusIcon
              type={connection.isPeerConnected ? 'connected' : 'disconnected'}
              className="w-2.5 h-2.5"
            />
            <span className="text-sm text-slate-600 font-medium">RTC</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <div className="space-y-2">
        {/* 主要状态 */}
        <div className={cn('font-medium text-sm', getStatusColor(status.type))}>
          {status.message}
        </div>
        <div className="text-xs text-muted-foreground">
          {status.detail}
        </div>

        {/* 详细连接状态 */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">WS</span>
            <StatusIcon
              type={connection.isWebSocketConnected ? 'connected' : 'disconnected'}
              className="w-2.5 h-2.5"
            />
            <span className={cn(
              connection.isWebSocketConnected ? 'text-green-600' : 'text-slate-500'
            )}>
              {connection.isWebSocketConnected ? '已连接' : '未连接'}
            </span>
          </div>

          <span className="text-slate-300">|</span>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">RTC</span>
            <StatusIcon
              type={connection.isPeerConnected ? 'connected' : 'disconnected'}
              className="w-2.5 h-2.5"
            />
            <span className={cn(
              connection.isPeerConnected ? 'text-green-600' : 'text-slate-500'
            )}>
              {connection.isPeerConnected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

