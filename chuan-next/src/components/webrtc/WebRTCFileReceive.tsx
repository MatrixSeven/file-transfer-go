"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, FileText, Image, Video, Music, Archive } from 'lucide-react';
import { useToast } from '@/components/ui/toast-simple';
import { ConnectionStatus } from '@/components/ConnectionStatus';

interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'ready' | 'downloading' | 'completed';
  progress: number;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <Image className="w-5 h-5 text-white" />;
  if (mimeType.startsWith('video/')) return <Video className="w-5 h-5 text-white" />;
  if (mimeType.startsWith('audio/')) return <Music className="w-5 h-5 text-white" />;
  if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive className="w-5 h-5 text-white" />;
  return <FileText className="w-5 h-5 text-white" />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface WebRTCFileReceiveProps {
  onJoinRoom: (code: string) => void;
  files: FileInfo[];
  onDownloadFile: (fileId: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  isWebSocketConnected?: boolean;
  downloadedFiles?: Map<string, File>;
  error?: string | null;
  onReset?: () => void;
  pickupCode?: string;
}

export function WebRTCFileReceive({
  onJoinRoom,
  files,
  onDownloadFile,
  isConnected,
  isConnecting,
  isWebSocketConnected = false,
  downloadedFiles,
  error = null,
  onReset,
  pickupCode: propPickupCode
}: WebRTCFileReceiveProps) {
  const [pickupCode, setPickupCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const { showToast } = useToast();

  // 使用传入的取件码或本地状态的取件码
  const displayPickupCode = propPickupCode || pickupCode;

  // 验证取件码是否存在
  const validatePickupCode = async (code: string): Promise<boolean> => {
    try {
      setIsValidating(true);
      code = code.toUpperCase();
      console.log('开始验证取件码:', code);
      const response = await fetch(`/api/room-info?code=${code}`);
      const data = await response.json();
      
      console.log('验证响应:', { status: response.status, data });
      
      if (!response.ok || !data.success) {
        const errorMessage = data.message || '取件码验证失败';
        
        // 显示toast错误提示
        showToast(errorMessage, 'error');
        
        console.log('验证失败:', errorMessage);
        return false;
      }
      
      console.log('取件码验证成功:', data.room);
      return true;
    } catch (error) {
      console.error('验证取件码时发生错误:', error);
      const errorMessage = '网络错误，请检查连接后重试';
      
      // 显示toast错误提示
      showToast(errorMessage, 'error');
      
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (pickupCode.length === 6) {
      const code = pickupCode.toUpperCase();
      
      // 先验证取件码是否存在
      const isValid = await validatePickupCode(code);
      if (isValid) {
        // 验证成功后再进行WebRTC连接
        onJoinRoom(code);
      }
    }
  }, [pickupCode, onJoinRoom]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^123456789ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz]/g, '');
    if (value.length <= 6) {
      setPickupCode(value);
    }
  }, []);

  // 当验证失败时重置输入状态
  React.useEffect(() => {
    if (error && !isConnecting && !isConnected && !isValidating) {
      // 延迟重置，确保用户能看到错误信息
      const timer = setTimeout(() => {
        console.log('重置取件码输入');
        setPickupCode('');
      }, 3000); // 3秒后重置
      
      return () => clearTimeout(timer);
    }
  }, [error, isConnecting, isConnected, isValidating]);

  // 如果已经连接但没有文件，显示等待界面
  if ((isConnected || isConnecting) && files.length === 0) {
    return (
      <div>
        {/* 功能标题和状态 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">文件接收中</h3>
                <p className="text-sm text-slate-600">取件码: {displayPickupCode}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ConnectionStatus 
                currentRoom={displayPickupCode ? { code: displayPickupCode, role: 'receiver' } : null}
              />
              
              <Button
                onClick={onReset}
                variant="outline"
                className="text-slate-600 hover:text-slate-800 border-slate-200 hover:border-slate-300"
              >
                重新开始
              </Button>
            </div>
          </div>        <div className="text-center">
          {/* 连接状态指示器 */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500 animate-spin'}`}></div>
              <span className={`text-sm font-medium ${isConnected ? 'text-emerald-600' : 'text-orange-600'}`}>
                {isConnected ? '连接已建立' : '连接中...'}
              </span>
            </div>
          </div>

          {/* 等待动画 */}
          <div className="flex justify-center space-x-1 mb-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.1}s` }}
              ></div>
            ))}
          </div>

          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <p className="text-xs sm:text-sm text-slate-600 text-center">
              💡 <span className="font-medium">提示：</span>房间已连接，发送方清空文件列表后您会看到此界面，等待对方重新选择文件
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 如果已经连接并且有文件列表，显示文件列表
  if (files.length > 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* 功能标题和状态 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">可下载文件</h3>
              <p className="text-sm text-slate-600">房间代码: {displayPickupCode}</p>
            </div>
          </div>
          
          {/* 连接状态 */}
          <ConnectionStatus 

            currentRoom={{ code: displayPickupCode, role: 'receiver' }}
          />
        </div>
        
        <div>

          <div className="space-y-3 sm:space-y-4">
            {files.map((file) => {
              const isDownloading = file.status === 'downloading';
              const isCompleted = file.status === 'completed';
              const hasDownloadedFile = downloadedFiles?.has(file.id);
              const currentProgress = file.progress;
              
              console.log('文件状态:', {
                fileName: file.name,
                status: file.status,
                progress: file.progress,
                isDownloading,
                currentProgress
              });
              
              return (
                <div key={file.id} className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                    <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate text-sm sm:text-base">{file.name}</p>
                        <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                        {hasDownloadedFile && (
                          <p className="text-xs text-emerald-600 font-medium">✅ 传输完成，点击保存</p>
                        )}
                        {isDownloading && (
                          <p className="text-xs text-blue-600 font-medium">⏳ 传输中...{currentProgress.toFixed(1)}%</p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => onDownloadFile(file.id)}
                      disabled={!isConnected || isDownloading}
                      className={`px-6 py-2 rounded-lg font-medium shadow-lg transition-all duration-200 hover:shadow-xl ${
                        hasDownloadedFile 
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white'
                          : isDownloading
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                      }`}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {isDownloading ? '传输中...' : hasDownloadedFile ? '保存文件' : '开始传输'}
                    </Button>
                  </div>
                  
                  {(isDownloading || isCompleted) && currentProgress > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>{hasDownloadedFile ? '传输完成' : '正在传输...'}</span>
                        <span className="font-medium">{currentProgress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            hasDownloadedFile
                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
                              : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                          }`}
                          style={{ width: `${currentProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 显示取件码输入界面  
  return (
    <div>
      {/* 功能标题和状态 */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">输入取件码</h2>
            <p className="text-sm text-slate-600">请输入6位取件码来获取文件</p>
          </div>
        </div>
        
        {/* 连接状态 */}
        <ConnectionStatus 
          currentRoom={null}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="space-y-3">
          <div className="relative">
            <Input
              value={pickupCode}
              onChange={handleInputChange}
              placeholder="请输入取件码"
              className="text-center text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono h-12 sm:h-16 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-emerald-500 bg-white/80 backdrop-blur-sm pb-2 sm:pb-4"
              maxLength={6}
              disabled={isValidating || isConnecting}
            />
            <div className="absolute inset-x-0 -bottom-4 sm:-bottom-6 flex justify-center space-x-1 sm:space-x-2">
              {[...Array(6)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-200 ${
                    i < pickupCode.length 
                      ? 'bg-emerald-500' 
                      : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="h-3 sm:h-4"></div>
          <p className="text-center text-xs sm:text-sm text-slate-500">
            {pickupCode.length}/6 位
          </p>
        </div>
        
        <Button 
          type="submit" 
          className="w-full h-10 sm:h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-base sm:text-lg font-medium rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100" 
          disabled={pickupCode.length !== 6 || isValidating || isConnecting}
        >
          {isValidating ? (
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>验证中...</span>
            </div>
          ) : isConnecting ? (
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>连接中...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Download className="w-5 h-5" />
              <span>开始接收</span>
            </div>
          )}
        </Button>
      </form>

      {/* 使用提示 */}
      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <p className="text-sm text-slate-600 text-center">
          💡 <span className="font-medium">提示：</span>取件码由发送方提供，有效期为24小时
        </p>
      </div>
    </div>
  );
}
