"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Monitor, Square } from 'lucide-react';
import { useToast } from '@/components/ui/toast-simple';
import { useDesktopShareBusiness } from '@/hooks/desktop-share';
import DesktopViewer from '@/components/DesktopViewer';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import VoiceChatPanel from '@/components/VoiceChatPanel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { validateRoomCode, checkRoomStatus, handleNetworkError } from '@/lib/room-utils';

interface WebRTCDesktopReceiverProps {
  className?: string;
  initialCode?: string; // 支持从URL参数传入的房间代码
  onConnectionChange?: (connection: any) => void;
}

export default function WebRTCDesktopReceiver({ className, initialCode, onConnectionChange }: WebRTCDesktopReceiverProps) {
  const [inputCode, setInputCode] = useState(initialCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false); // 添加加入房间状态
  const [showPeerLeftDialog, setShowPeerLeftDialog] = useState(false); // 发送方退出提示
  const hasTriedAutoJoin = React.useRef(false); // 添加 ref 来跟踪是否已尝试自动加入
  const { showToast } = useToast();

  // 使用桌面共享业务逻辑
  const desktopShare = useDesktopShareBusiness();

  // 通知父组件连接状态变化
  useEffect(() => {
    if (onConnectionChange && desktopShare.webRTCConnection) {
      onConnectionChange(desktopShare.webRTCConnection);
    }
  }, [onConnectionChange, desktopShare.isWebSocketConnected, desktopShare.isPeerConnected, desktopShare.isConnecting]);

  // 加入观看
  const handleJoinViewing = useCallback(async () => {
    const trimmedCode = inputCode.trim();
    
    // 检查房间代码格式
    const validationError = validateRoomCode(trimmedCode);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    // 防止重复调用 - 检查是否已经在连接或已连接
    if (desktopShare.isConnecting || desktopShare.isViewing || isJoiningRoom) {
      console.log('已在连接中或已连接，跳过重复的房间状态检查');
      return;
    }
    
    setIsJoiningRoom(true);

    try {
      console.log('[DesktopShareReceiver] 开始验证房间状态...');
      
      const result = await checkRoomStatus(trimmedCode);
      if (!result.success) {
        showToast(result.error || '房间验证失败', "error");
        return;
      }
      
      console.log('[DesktopShareReceiver] 房间状态检查通过，开始连接...');
      setIsLoading(true);
      
      await desktopShare.joinSharing(trimmedCode.toUpperCase());
      console.log('[DesktopShareReceiver] 加入观看成功');
      
      showToast('已加入桌面共享', 'success');
    } catch (error) {
      console.error('[DesktopShareReceiver] 加入观看失败:', error);
      const errorMessage = error instanceof Error ? handleNetworkError(error) : '加入观看失败';
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
      setIsJoiningRoom(false);
    }
  }, [desktopShare, inputCode, isJoiningRoom, showToast]);

  // 停止观看
  const handleStopViewing = useCallback(async () => {
    try {
      setIsLoading(true);
      await desktopShare.stopViewing();
      showToast('已退出桌面共享', 'success');
      setInputCode('');
    } catch (error) {
      console.error('[DesktopShareReceiver] 停止观看失败:', error);
      showToast('退出失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [desktopShare, showToast]);

  // 监听发送方退出：当正在观看时检测到错误为"对方已退出共享"
  useEffect(() => {
    if (desktopShare.isViewing && desktopShare.webRTCError === '对方已退出共享') {
      console.log('[DesktopShareReceiver] 检测到发送方已退出共享');
      setShowPeerLeftDialog(true);
    }
  }, [desktopShare.isViewing, desktopShare.webRTCError]);

  // 确认发送方退出后回到初始页面
  const handlePeerLeftConfirm = useCallback(async () => {
    setShowPeerLeftDialog(false);
    try {
      await desktopShare.stopViewing();
    } catch {
      // ignore
    }
    setInputCode('');
    hasTriedAutoJoin.current = false;
  }, [desktopShare]);

  // 如果有初始代码且还未加入观看，自动尝试加入
  React.useEffect(() => {
    console.log('[WebRTCDesktopReceiver] useEffect 触发, 参数:', {
      initialCode,
      isViewing: desktopShare.isViewing,
      isConnecting: desktopShare.isConnecting,
      isJoiningRoom,
      hasTriedAutoJoin: hasTriedAutoJoin.current
    });
    
    const autoJoin = async () => {
      if (initialCode && !desktopShare.isViewing && !desktopShare.isConnecting && !isJoiningRoom && !hasTriedAutoJoin.current) {
        hasTriedAutoJoin.current = true;
        const trimmedCode = initialCode.trim();
        
        // 检查房间代码格式
        const validationError = validateRoomCode(trimmedCode);
        if (validationError) {
          showToast(validationError, "error");
          return;
        }
        
        setIsJoiningRoom(true);
        console.log('[WebRTCDesktopReceiver] 检测到初始代码，开始验证并自动加入:', trimmedCode);
        
        try {
          console.log('[WebRTCDesktopReceiver] 验证房间状态...');
          const result = await checkRoomStatus(trimmedCode);
          
          if (!result.success) {
            showToast(result.error || '房间验证失败', "error");
            return;
          }
          
          console.log('[WebRTCDesktopReceiver] 房间验证通过，开始自动连接...');
          setIsLoading(true);
          
          await desktopShare.joinSharing(trimmedCode.toUpperCase());
          console.log('[WebRTCDesktopReceiver] 自动加入观看成功');
          showToast('已加入桌面共享', 'success');
        } catch (error) {
          console.error('[WebRTCDesktopReceiver] 自动加入观看失败:', error);
          const errorMessage = error instanceof Error ? handleNetworkError(error) : '自动加入观看失败';
          showToast(errorMessage, 'error');
        } finally {
          setIsLoading(false);
          setIsJoiningRoom(false);
        }
      } else {
        console.log('[WebRTCDesktopReceiver] 不满足自动加入条件:', {
          hasInitialCode: !!initialCode,
          notViewing: !desktopShare.isViewing,
          notConnecting: !desktopShare.isConnecting,
          notJoiningRoom: !isJoiningRoom,
          notTriedBefore: !hasTriedAutoJoin.current
        });
      }
    };
    
    autoJoin();
  }, [initialCode, desktopShare.isViewing, desktopShare.isConnecting, isJoiningRoom]); // 添加isJoiningRoom依赖

  
  return (
    <div className={`space-y-4 sm:space-y-6 ${className || ''}`}>
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 shadow-lg border border-white/20 animate-fade-in-up">
        <div className="space-y-6">
          {!desktopShare.isViewing ? (
            // 输入房间代码界面 - 与文本消息风格一致
            <div>
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">输入房间代码</h2>
                    <p className="text-sm text-slate-600">请输入6位房间代码来观看桌面共享</p>
                  </div>
                </div>
                
                <ConnectionStatus 
                  currentRoom={desktopShare.connectionCode ? { code: desktopShare.connectionCode, role: 'receiver' } : null}
                />
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleJoinViewing(); }} className="space-y-4 sm:space-y-6">
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.replace(/[^123456789ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz]/g, '').toUpperCase())}
                      placeholder="请输入房间代码"
                      className="text-center text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono h-12 sm:h-16 border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:ring-purple-500 bg-white/80 backdrop-blur-sm pb-2 sm:pb-4"
                      maxLength={6}
                      disabled={isLoading || isJoiningRoom}
                    />
                  </div>
                  <p className="text-center text-xs sm:text-sm text-slate-500">
                    {inputCode.length}/6 位
                  </p>
                </div>

                <div className="flex justify-center">
                  <Button
                    type="submit"
                    disabled={inputCode.length !== 6 || isLoading || isJoiningRoom}
                    className="w-full h-10 sm:h-12 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white text-base sm:text-lg font-medium rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100"
                  >
                    {isJoiningRoom ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>验证中...</span>
                      </div>
                    ) : isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>连接中...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Monitor className="w-5 h-5" />
                        <span>加入观看</span>
                      </div>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            // 已连接，显示桌面观看界面
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">桌面观看</h3>
                    <p className="text-sm text-slate-600">房间代码: {inputCode}</p>
                  </div>
                </div>

                {/* 连接状态 */}
                <ConnectionStatus 
                  currentRoom={{ code: inputCode, role: 'receiver' }}
                />
              </div>

              {/* 观看中的控制面板 */}
              <div className="flex justify-center mb-4">
                <div className="bg-white rounded-lg p-3 shadow-lg border flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-green-600">
                    <Monitor className="w-4 h-4" />
                    <span className="font-semibold">观看中</span>
                  </div>
                  <Button
                    onClick={handleStopViewing}
                    disabled={isLoading}
                    variant="destructive"
                    size="sm"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    {isLoading ? '退出中...' : '退出观看'}
                  </Button>
                </div>
              </div>

              {/* 语音通话面板 */}
              {desktopShare.webRTCConnection && (
                <VoiceChatPanel
                  connection={desktopShare.webRTCConnection}
                  isPeerConnected={desktopShare.isPeerConnected}
                />
              )}

              {/* 桌面显示区域 */}
              {desktopShare.remoteStream ? (
                <DesktopViewer
                  stream={desktopShare.remoteStream}
                  isConnected={desktopShare.isViewing}
                  connectionCode={inputCode}
                  onDisconnect={handleStopViewing}
                />
              ) : desktopShare.webRTCConnection?.transportMode === 'relay' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
                  <div className="text-center">
                    <Monitor className="w-16 h-16 mx-auto text-amber-400 mb-4" />
                    <p className="text-amber-700 font-medium mb-2">⚠️ 当前为中继模式</p>
                    <p className="text-sm text-amber-600">中继模式（WS 转发）不支持桌面视频流传输，桌面共享需要 P2P 直连。</p>
                    <p className="text-sm text-amber-600 mt-1">请检查网络环境或尝试重新连接。</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-8 border border-slate-200">
                  <div className="text-center">
                    <Monitor className="w-16 h-16 mx-auto text-slate-400 mb-4" />
                    <p className="text-slate-600 mb-2">等待接收桌面画面...</p>
                    <p className="text-sm text-slate-500">发送方开始共享后，桌面画面将在这里显示</p>
                    
                    <div className="flex items-center justify-center space-x-2 mt-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                      <span className="text-sm text-purple-600">等待桌面流...</span>
                    </div>                                     
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 发送方退出提示对话框 */}
      <ConfirmDialog
        isOpen={showPeerLeftDialog}
        onClose={handlePeerLeftConfirm}
        onConfirm={handlePeerLeftConfirm}
        title="共享已结束"
        message="对方已停止桌面共享，点击确认返回。"
        confirmText="确认"
        cancelText="确认"
        type="info"
      />
    </div>
  );
}
