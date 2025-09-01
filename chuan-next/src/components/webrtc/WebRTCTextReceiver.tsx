"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSharedWebRTCManager } from '@/hooks/connection';
import { useTextTransferBusiness } from '@/hooks/text-transfer';
import { useFileTransferBusiness } from '@/hooks/file-transfer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-simple';
import { MessageSquare, Image, Download } from 'lucide-react';
import { ConnectionStatus } from '@/components/ConnectionStatus';

interface WebRTCTextReceiverProps {
  initialCode?: string;
  onPreviewImage: (imageUrl: string) => void;
  onRestart?: () => void;
  onConnectionChange?: (connection: any) => void;
}

export const WebRTCTextReceiver: React.FC<WebRTCTextReceiverProps> = ({
  initialCode = '',
  onPreviewImage,
  onRestart,
  onConnectionChange
}) => {
  const { showToast } = useToast();

  // 状态管理
  const [pickupCode, setPickupCode] = useState('');
  const [inputCode, setInputCode] = useState(initialCode);
  const [receivedText, setReceivedText] = useState(''); // 实时接收的文本内容
  const [receivedImages, setReceivedImages] = useState<Array<{ id: string, content: string, fileName?: string }>>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  // Ref用于防止重复自动连接
  const hasTriedAutoConnect = useRef(false);

  // 创建共享连接
  const connection = useSharedWebRTCManager();
  
  // 使用共享连接创建业务层
  const textTransfer = useTextTransferBusiness(connection);
  const fileTransfer = useFileTransferBusiness(connection);

  // 连接所有传输通道
  const connectAll = useCallback(async (code: string, role: 'sender' | 'receiver') => {
    console.log('=== 连接所有传输通道 ===', { code, role });
    // 只需要连接一次，因为使用的是共享连接
    await connection.connect(code, role);
  }, [connection]);

  // 是否有任何连接
  const hasAnyConnection = textTransfer.isConnected || fileTransfer.isConnected;
  
  // 是否正在连接
  const isAnyConnecting = textTransfer.isConnecting || fileTransfer.isConnecting;

  // 通知父组件连接状态变化
  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(connection);
    }
  }, [onConnectionChange, connection.isConnected, connection.isConnecting, connection.isPeerConnected]);

  // 是否有任何错误
  const hasAnyError = textTransfer.connectionError || fileTransfer.connectionError;

  // 重新开始
  const restart = () => {
    setPickupCode('');
    setInputCode('');
    setReceivedText('');
    setIsTyping(false);
    
    // 清理接收的图片URL
    receivedImages.forEach(img => {
      if (img.content.startsWith('blob:')) {
        URL.revokeObjectURL(img.content);
      }
    });
    setReceivedImages([]);
    
    // 断开连接（只需要断开一次）
    connection.disconnect();
    
    if (onRestart) {
      onRestart();
    }
  };

  // 监听实时文本同步
  useEffect(() => {
    const cleanup = textTransfer.onTextSync((text: string) => {
      setReceivedText(text);
    });

    return cleanup;
  }, [textTransfer.onTextSync]);

  // 监听打字状态
  useEffect(() => {
    const cleanup = textTransfer.onTypingStatus((typing: boolean) => {
      setIsTyping(typing);
    });

    return cleanup;
  }, [textTransfer.onTypingStatus]);

  // 监听文件（图片）接收
  useEffect(() => {
    const cleanup = fileTransfer.onFileReceived((fileData) => {
      if (fileData.file.type.startsWith('image/')) {
        const imageUrl = URL.createObjectURL(fileData.file);
        const imageId = Date.now().toString();
        
        setReceivedImages(prev => [...prev, {
          id: imageId,
          content: imageUrl,
          fileName: fileData.file.name
        }]);

        showToast(`收到图片: ${fileData.file.name}`, "success");
      }
    });

    return cleanup;
  }, [fileTransfer.onFileReceived]);

  // 验证并加入房间
  const joinRoom = useCallback(async (code: string) => {
    const normalizedCode = code.toUpperCase(); // 添加这一行

    if (!code || code.length !== 6) return;
    
    setIsValidating(true);
    
    try {
      console.log('=== 开始加入房间 ===', code);
      
      // 验证房间
      const response = await fetch(`/api/room-info?code=${code}`);
      const roomData = await response.json();
      
      if (!response.ok) {
        throw new Error(roomData.error || '房间不存在或已过期');
      }

      console.log('=== 房间验证成功 ===', roomData);
      setPickupCode(code);
      
      // 连接到房间
      await connectAll(code, 'receiver');
      
    } catch (error: any) {
      console.error('加入房间失败:', error);
      showToast(error.message || '加入房间失败', "error");
    } finally {
      setIsValidating(false);
    }
  }, [connectAll, showToast]);

  // 复制文本到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已复制到剪贴板', "success");
    } catch (error) {
      console.error('复制失败:', error);
      showToast('复制失败', "error");
    }
  };

  // 处理初始代码连接
  useEffect(() => {
    console.log(`initialCode: ${initialCode}, hasTriedAutoConnect: ${hasTriedAutoConnect.current}`);
    if (initialCode && initialCode.length === 6 && !hasTriedAutoConnect.current) {
      console.log('=== 自动连接初始代码 ===', initialCode);
      hasTriedAutoConnect.current = true
      setInputCode(initialCode);
      joinRoom(initialCode);
      return;
    }
  }, [initialCode, joinRoom]);

  return (
    <div className="space-y-6">
      {!hasAnyConnection ? (
        // 输入取件码界面
        <div>
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">输入取件码</h2>
                <p className="text-sm text-slate-600">请输入6位取件码来获取实时文字内容</p>
              </div>
            </div>
            
            <div className="text-left">
              <ConnectionStatus 
                currentRoom={pickupCode ? { code: pickupCode, role: 'receiver' } : null}
              />
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); joinRoom(inputCode); }} className="space-y-4 sm:space-y-6">
            <div className="space-y-3">
              <div className="relative">
                <Input
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/[^123456789ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz]/g, ''))}
                  placeholder="请输入取件码"
                  className="text-center text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono h-12 sm:h-16 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-emerald-500 bg-white/80 backdrop-blur-sm pb-2 sm:pb-4"
                  maxLength={6}
                  disabled={isValidating || isAnyConnecting}
                />
              </div>
              <p className="text-center text-xs sm:text-sm text-slate-500">
                {inputCode.length}/6 位
              </p>
            </div>

            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={inputCode.length !== 6 || isValidating || isAnyConnecting}
                className="w-full h-10 sm:h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-base sm:text-lg font-medium rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100"
              >
                {isValidating ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>验证中...</span>
                  </div>
                ) : isAnyConnecting ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>连接中...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Download className="w-5 h-5" />
                    <span>获取文字</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        // 已连接，显示实时文本
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">实时文字内容</h3>
                <p className="text-sm text-slate-600">取件码: {pickupCode}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ConnectionStatus 

                currentRoom={pickupCode ? { code: pickupCode, role: 'receiver' } : null}
              />
              
              <Button
                onClick={restart}
                variant="outline"
                className="text-slate-600 hover:text-slate-800 border-slate-200 hover:border-slate-300"
              >
                重新开始
              </Button>
            </div>
          </div>

          {/* 文本显示区域 */}
          <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-800 flex items-center space-x-2">
                <MessageSquare className="w-4 h-4" />
                <span>接收到的文字</span>
              </h4>
              
              {receivedText && (
                <Button
                  onClick={() => copyToClipboard(receivedText)}
                  size="sm"
                  variant="ghost"
                  className="text-slate-600 hover:text-slate-800 h-8 px-3"
                >
                  <span>复制</span>
                </Button>
              )}
            </div>

            <div className="min-h-[200px] bg-slate-50/50 rounded-xl p-4 border border-slate-100 overflow-hidden">
              {receivedText ? (
                <div className="space-y-2 h-full">
                  <div className="overflow-auto max-h-[180px]">
                    <pre className="whitespace-pre-wrap break-words text-slate-700 text-sm leading-relaxed font-sans">
                      {receivedText}
                    </pre>
                  </div>
                  {isTyping && (
                    <div className="flex items-center space-x-2 text-slate-500 text-sm">
                      <div className="flex space-x-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                      <span>对方正在输入...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
                  <MessageSquare className="w-12 h-12 text-slate-300" />
                  <p className="text-center">
                    {connection.isPeerConnected ? 
                      '等待对方发送文字内容...' : 
                      '等待连接建立...'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 图片显示区域 */}
          {receivedImages.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 space-y-4">
              <h4 className="font-medium text-slate-800 flex items-center space-x-2">
                <Image className="w-4 h-4" />
                <span>接收到的图片 ({receivedImages.length})</span>
              </h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {receivedImages.map((image) => (
                  <div 
                    key={image.id}
                    className="group relative aspect-square bg-slate-50 rounded-xl overflow-hidden border border-slate-200 hover:border-slate-300 transition-all duration-200 cursor-pointer"
                    onClick={() => onPreviewImage(image.content)}
                  >
                    <img
                      src={image.content}
                      alt={image.fileName || '接收的图片'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="bg-white/90 rounded-lg px-3 py-1">
                          <span className="text-sm text-slate-700">点击查看</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
