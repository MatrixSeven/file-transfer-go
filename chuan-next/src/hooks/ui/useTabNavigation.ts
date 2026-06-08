import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useURLHandler, FeatureType } from './useURLHandler';
import { useWebRTCStore } from './webRTCStore';
import { useConfirmDialog } from './useConfirmDialog';
import { useSharedWebRTCManager } from '../connection/useSharedWebRTCManager';

// Tab类型定义（包括非WebRTC功能）
export type TabType = 'webrtc' | 'message' | 'desktop' | 'wechat' | 'settings';

// Tab显示名称
const TAB_NAMES: Record<TabType, string> = {
  webrtc: '文件传输',
  message: '文字传输',
  desktop: '桌面共享',
  wechat: '交流反馈',
  settings: '设置'
};

// WebRTC功能的映射
const WEBRTC_FEATURES: Record<string, FeatureType> = {
  webrtc: 'webrtc',
  message: 'message',
  desktop: 'desktop'
};

export const useTabNavigation = () => {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('webrtc');
  const [hasInitialized, setHasInitialized] = useState(false);
  const { showConfirmDialog, dialogState, closeDialog } = useConfirmDialog();
  
  // 获取WebRTC全局状态
  const { 
    isConnected, 
    isConnecting, 
    isPeerConnected,
    currentRoom,
  } = useWebRTCStore();

  // 获取WebRTC连接管理器
  const { disconnect: disconnectWebRTC } = useSharedWebRTCManager();

  // 创建一个通用的URL处理器（用于断开连接）
  const { hasActiveConnection } = useURLHandler({
    featureType: 'webrtc', // 默认值，实际使用时会被覆盖
    onModeChange: () => {},
  });

  // 根据URL参数设置初始标签（仅首次加载时）
  useEffect(() => {
    if (!hasInitialized) {
      const urlType = searchParams.get('type');
      
      console.log('=== HomePage URL处理 ===');
      console.log('URL type参数:', urlType);
      console.log('所有搜索参数:', Object.fromEntries(searchParams.entries()));
      
      // 将旧的text类型重定向到message
      if (urlType === 'text') {
        console.log('检测到text类型，重定向到message标签页');
        setActiveTab('message');
      } else if (urlType === 'webrtc') {
        console.log('检测到webrtc类型，切换到webrtc标签页（文件传输）');
        setActiveTab('webrtc');
      } else if (urlType && ['message', 'desktop'].includes(urlType)) {
        console.log('切换到对应标签页:', urlType);
        setActiveTab(urlType as TabType);
      } else {
        console.log('没有有效的type参数，使用默认标签页：webrtc（文件传输）');
        // 保持默认的webrtc标签
      }
      
      setHasInitialized(true);
    }
  }, [searchParams, hasInitialized]);

  // 处理tab切换
  const handleTabChange = useCallback(async (newTab: TabType) => {
    console.log('=== Tab切换 ===');
    console.log('当前tab:', activeTab, '目标tab:', newTab);
    
    // 对于任何非WebRTC功能的tab（wechat、settings），如果有活跃连接需要确认
    if ((newTab === 'wechat' || newTab === 'settings') && hasActiveConnection()) {
      const currentTabName = TAB_NAMES[activeTab];
      const targetTabName = TAB_NAMES[newTab];
      const confirmed = await showConfirmDialog({
        title: '切换功能确认',
        message: `切换到${targetTabName}需要断开当前的${currentTabName}连接，是否继续？`,
        confirmText: '确认切换',
        cancelText: '取消',
        type: 'warning'
      });
      
      if (!confirmed) {
        return false;
      }
      
      // 断开连接并清除状态
      disconnectWebRTC();
      console.log(`已清除WebRTC连接状态，切换到${targetTabName}`);
      
      setActiveTab(newTab);
      // 清除URL参数
      const newUrl = new URL(window.location.href);
      newUrl.search = '';
      window.history.pushState({}, '', newUrl.toString());
      return true;
    }

    // 如果切换到非活跃连接的wechat或settings tab，直接切换
    if (newTab === 'wechat' || newTab === 'settings') {
      setActiveTab(newTab);
      // 清除URL参数
      const newUrl = new URL(window.location.href);
      newUrl.search = '';
      window.history.pushState({}, '', newUrl.toString());
      return true;
    }

    // 如果有活跃连接且切换到不同的WebRTC功能，需要确认
    if (hasActiveConnection() && newTab !== activeTab && WEBRTC_FEATURES[newTab]) {
      const currentTabName = TAB_NAMES[activeTab];
      const targetTabName = TAB_NAMES[newTab];
      
      const confirmed = await showConfirmDialog({
        title: '切换功能确认',
        message: `切换到${targetTabName}功能需要关闭当前的${currentTabName}连接，是否继续？`,
        confirmText: '确认切换',
        cancelText: '取消',
        type: 'warning'
      });
      
      if (!confirmed) {
        return false;
      }

      // 用户确认后，重置WebRTC状态
      disconnectWebRTC();
      console.log(`已断开${currentTabName}连接，切换到${targetTabName}`);
    }

    // 执行tab切换
    setActiveTab(newTab);
    
    // 更新URL（对于WebRTC功能）
    if (WEBRTC_FEATURES[newTab]) {
      const params = new URLSearchParams();
      params.set('type', WEBRTC_FEATURES[newTab]);
      params.set('mode', 'send'); // 默认模式
      const newUrl = `?${params.toString()}`;
      window.history.pushState({}, '', newUrl);
    } else {
      // 非WebRTC功能，清除URL参数
      const newUrl = new URL(window.location.href);
      newUrl.search = '';
      window.history.pushState({}, '', newUrl.toString());
    }
    
    return true;
  }, [activeTab, hasActiveConnection, disconnectWebRTC]);

  // 获取连接状态信息
  const getConnectionInfo = useCallback(() => {
    return {
      hasConnection: hasActiveConnection(),
      currentRoom: currentRoom,
      isConnected,
      isConnecting,
      isPeerConnected
    };
  }, [hasActiveConnection, currentRoom, isConnected, isConnecting, isPeerConnected]);

  return {
    activeTab,
    handleTabChange,
    getConnectionInfo,
    hasInitialized,
    // 导出确认对话框状态
    confirmDialogState: dialogState,
    closeConfirmDialog: closeDialog
  };
};
