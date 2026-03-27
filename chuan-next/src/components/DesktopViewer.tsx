"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor, Maximize, Minimize, Volume2, VolumeX, Settings, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {WebRTCManager} from "@/hooks";

interface DesktopViewerProps {
  stream: MediaStream | null;
  isConnected: boolean;
  connectionCode?: string;
  onDisconnect: () => void;
}

export default function DesktopViewer({ 
  stream, 
  isConnected, 
  connectionCode, 
  onDisconnect 
}: DesktopViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const hasAttemptedAutoplayRef = useRef(false);
  const [videoStats, setVideoStats] = useState<{
    resolution: string;
    fps: number;
  }>({ resolution: '0x0', fps: 0 });

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 设置视频流
  useEffect(() => {
    if (videoRef.current && stream) {
      console.log('[DesktopViewer] 🎬 设置视频流，轨道数量:', stream.getTracks().length);
      stream.getTracks().forEach(track => {
        console.log('[DesktopViewer] 轨道详情:', track.kind, track.id, '启用:', track.enabled, '状态:', track.readyState);
        // 确保轨道已启用
        if (!track.enabled) {
          console.log('[DesktopViewer] 🔓 启用轨道:', track.id);
          track.enabled = true;
        }
      });
      
      videoRef.current.srcObject = stream;
      console.log('[DesktopViewer] ✅ 视频元素已设置流');
      
      // 重置状态
      hasAttemptedAutoplayRef.current = false;
      setNeedsUserInteraction(false);
      setIsPlaying(false);
      
      // 添加事件监听器来调试视频加载
      const video = videoRef.current;
      const handleLoadStart = () => console.log('[DesktopViewer] 📹 视频开始加载');
      const handleLoadedMetadata = () => {
        console.log('[DesktopViewer] 📹 视频元数据已加载');
        console.log('[DesktopViewer] 📹 视频尺寸:', video.videoWidth, 'x', video.videoHeight);
      };
      const handleCanPlay = () => {
        console.log('[DesktopViewer] 📹 视频可以开始播放');
        // 只在还未尝试过自动播放时才尝试
        if (!hasAttemptedAutoplayRef.current) {
          hasAttemptedAutoplayRef.current = true;
          video.play()
            .then(() => {
              console.log('[DesktopViewer] ✅ 视频自动播放成功');
              setIsPlaying(true);
              setNeedsUserInteraction(false);
            })
            .catch(e => {
              console.log('[DesktopViewer] 📹 自动播放被阻止，需要用户交互:', e.message);
              setIsPlaying(false);
              setNeedsUserInteraction(true);
            });
        }
      };
      const handlePlay = () => {
        console.log('[DesktopViewer] 📹 视频开始播放');
        setIsPlaying(true);
        setNeedsUserInteraction(false);
      };
      const handlePause = () => {
        console.log('[DesktopViewer] 📹 视频暂停');
        setIsPlaying(false);
      };
      const handleError = (e: Event) => {
        console.error('[DesktopViewer] 📹 视频播放错误:', e);
        // 尝试重新加载流
        console.log('[DesktopViewer] 🔄 尝试重新加载视频流');
        setTimeout(() => {
          if (videoRef.current && stream) {
            videoRef.current.srcObject = null;
            videoRef.current.srcObject = stream;
            if (!hasAttemptedAutoplayRef.current) {
              hasAttemptedAutoplayRef.current = true;
              videoRef.current.play()
                .then(() => {
                  console.log('[DesktopViewer] ✅ 重新加载后视频播放成功');
                  setIsPlaying(true);
                  setNeedsUserInteraction(false);
                })
                .catch(err => {
                  console.log('[DesktopViewer] 📹 重新加载后自动播放仍被阻止:', err.message);
                  setIsPlaying(false);
                  setNeedsUserInteraction(true);
                });
            }
          }
        }, 1000);
      };
      
      video.addEventListener('loadstart', handleLoadStart);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('error', handleError);
      
      return () => {
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('error', handleError);
      };
    } else if (videoRef.current && !stream) {
      console.log('[DesktopViewer] ❌ 清除视频流');
      videoRef.current.srcObject = null;
      setIsPlaying(false);
      setNeedsUserInteraction(false);
      hasAttemptedAutoplayRef.current = false;
    }
  }, [stream]);

  // 监控视频统计信息
  useEffect(() => {
    const peerConnectionManager = managerRef.current?.getPeerConnection();
    if (!peerConnectionManager) return;

    const updateStatsFromPeer = async () => {
      const report: RTCStatsReport = await peerConnectionManager.getStats();
      let resolution = '0x0';
      let fps = 0;

      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          if (typeof stat.frameWidth === 'number' && typeof stat.frameHeight === 'number') {
            resolution = `${stat.frameWidth}x${stat.frameHeight}`;
          }
          if (typeof stat.framesPerSecond === 'number') {
            fps = stat.framesPerSecond;
          }
        }
      });
      setVideoStats({ resolution, fps });
    };

    const interval = setInterval(updateStatsFromPeer, 1000);
    return () => clearInterval(interval);
  }, []);

  // 全屏相关处理
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      
      if (isCurrentlyFullscreen) {
        // 全屏时自动隐藏控制栏，鼠标移动时显示
        setShowControls(false);
      } else {
        // 退出全屏时显示控制栏
        setShowControls(true);
        
        // 延迟检查视频状态，确保全屏切换完成
        setTimeout(() => {
          if (videoRef.current && stream) {
            console.log('[DesktopViewer] 🔄 退出全屏，检查视频状态');
            
            // 确保视频流正确设置
            const currentSrcObject = videoRef.current.srcObject;
            if (!currentSrcObject || currentSrcObject !== stream) {
              videoRef.current.srcObject = stream;
            }
            
            // 检查视频是否暂停
            if (videoRef.current.paused) {
              console.log('[DesktopViewer] ⏸️ 退出全屏后视频已暂停，显示播放按钮');
              setIsPlaying(false);
              setNeedsUserInteraction(true);
              hasAttemptedAutoplayRef.current = true; // 标记已尝试过自动播放
            } else {
              console.log('[DesktopViewer] ▶️ 退出全屏后视频仍在播放');
              setIsPlaying(true);
              setNeedsUserInteraction(false);
            }
          }
        }, 200); // 延迟200ms确保全屏切换完成
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [stream]);

  // 鼠标移动处理（全屏时）
  const handleMouseMove = useCallback(() => {
    if (isFullscreen) {
      setShowControls(true);
      
      // 清除之前的定时器
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      
      // 3秒后自动隐藏控制栏
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isFullscreen]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          if (isFullscreen) {
            exitFullscreen();
          }
          break;
        case 'f':
        case 'F':
          if (event.ctrlKey) {
            event.preventDefault();
            toggleFullscreen();
          }
          break;
        case 'm':
        case 'M':
          if (event.ctrlKey) {
            event.preventDefault();
            toggleMute();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // 切换全屏
  const toggleFullscreen = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isFullscreen) {
        // 退出全屏
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        // 退出iOS全屏模式
        if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        // 退出视频全屏模式
        if ((videoRef.current as any).webkitExitFullscreen) {
          await (videoRef.current as any).webkitExitFullscreen();
        }
        // 退出Android全屏模式
        if ((videoRef.current as any).exitFullscreen) {
          await (videoRef.current as any).exitFullscreen();
        }
      } else {
        // 进入标准全屏
        if (videoRef.current.requestFullscreen) {
          await videoRef.current.requestFullscreen();
        }
        // 进入iOS全屏模式
        else if ((videoRef.current as any).webkitRequestFullscreen) {
          await (videoRef.current as any).webkitRequestFullscreen();
        }
        // 进入iOS视频全屏模式
        else if ((videoRef.current as any).webkitEnterFullscreen) {
          await (videoRef.current as any).webkitEnterFullscreen();
        }
        // 进入Android全屏模式
        else if ((videoRef.current as any).requestFullscreen) {
          await (videoRef.current as any).requestFullscreen();
        }
      }
    } catch (error) {
      console.error('[DesktopViewer] 全屏切换失败:', error);
    }
  }, [isFullscreen]);

  // 退出全屏
  const exitFullscreen = useCallback(async () => {
    try {
      // 退出标准全屏
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      // 退出iOS全屏模式
      if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
      // 退出视频全屏模式
      if (videoRef.current && (videoRef.current as any).webkitExitFullscreen) {
        await (videoRef.current as any).webkitExitFullscreen();
      }
      // 退出Android全屏模式
      if (videoRef.current && (videoRef.current as any).exitFullscreen) {
        await (videoRef.current as any).exitFullscreen();
      }
    } catch (error) {
      console.error('[DesktopViewer] 退出全屏失败:', error);
    }
  }, []);

  // 切换静音
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  }, []);

  // 手动播放视频
  const handleManualPlay = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => {
          console.log('[DesktopViewer] ✅ 手动播放成功');
          setIsPlaying(true);
          setNeedsUserInteraction(false);
        })
        .catch(e => {
          console.error('[DesktopViewer] ❌ 手动播放失败:', e);
        });
    }
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  if (!stream) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-slate-900 rounded-xl text-white">
        <Monitor className="w-16 h-16 opacity-50 mb-4" />
        <p className="text-lg opacity-75">
          {isConnected ? '等待桌面共享流...' : '等待桌面共享连接...'}
        </p>
        {connectionCode && (
          <p className="text-sm opacity-50 mt-2">连接码: {connectionCode}</p>
        )}
        <div className="mt-4 flex items-center space-x-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`}></div>
          <span>{isConnected ? '已连接，等待视频流' : '正在建立连接'}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-xl overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : 'w-full'}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => isFullscreen && setShowControls(true)}
    >
      {/* 主视频显示 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className={`w-full h-full object-contain ${isFullscreen ? 'cursor-none' : ''}`}
        style={{ 
          aspectRatio: isFullscreen ? 'unset' : '16/9',
          minHeight: isFullscreen ? '100vh' : '400px'
        }}
      />

      {/* 需要用户交互的播放覆盖层 - 在视频暂停时显示 */}
      {((needsUserInteraction && !isPlaying) || (isConnected && !isPlaying && !needsUserInteraction && videoRef.current?.paused)) && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white z-10">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer" onClick={handleManualPlay}>
              <Play className="w-10 h-10 text-white ml-1" />
            </div>
            <h3 className="text-lg font-semibold mb-2">点击播放桌面共享</h3>
            <p className="text-sm opacity-75">视频已暂停，点击继续播放</p>
          </div>
        </div>
      )}

      {/* 连接状态覆盖层 */}
      {!isConnected && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-lg">正在连接桌面共享...</p>
          {connectionCode && (
            <p className="text-sm opacity-75 mt-2">连接码: {connectionCode}</p>
          )}
        </div>
      )}

      {/* 控制栏 */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 transition-all duration-300 ${
          showControls || !isFullscreen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* 左侧信息 */}
          <div className="flex items-center space-x-4 text-white text-sm">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
              <span className="text-xs sm:text-sm">{isPlaying ? '桌面共享中' : needsUserInteraction ? '等待播放' : isConnected ? '已暂停' : '连接中'}</span>
            </div>
            {videoStats.resolution !== '0x0' && (
              <>
                <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
                <span className="text-xs sm:text-sm hidden sm:block">{videoStats.resolution}</span>
              </>
            )}
            {connectionCode && (
              <>
                <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
                <span className="font-mono text-xs sm:text-sm hidden sm:block">{connectionCode}</span>
              </>
            )}
          </div>

          {/* 右侧控制按钮 */}
          <div className="flex items-center space-x-2">
            {/* 音频控制 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="text-white hover:bg-white/20"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>

            {/* 设置 */}
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 hidden sm:flex"
            >
              <Settings className="w-4 h-4" />
            </Button>

            {/* 全屏切换 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/20"
              title={isFullscreen ? "退出全屏 (Esc)" : "全屏 (Ctrl+F)"}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </Button>

            {/* 断开连接 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="text-white hover:bg-red-500/30"
              title="断开连接"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 快捷键提示（仅全屏时显示） */}
        {isFullscreen && showControls && (
          <div className="mt-2 text-xs text-white/60 text-center">
            <p>快捷键: Esc 退出全屏 | Ctrl+F 切换全屏 | Ctrl+M 切换静音</p>
          </div>
        )}
      </div>

      {/* 移动端浮动全屏按钮 - 在控制栏隐藏时显示 */}
      {!isFullscreen && (
        <Button
          variant="ghost"
          size="lg"
          onClick={toggleFullscreen}
          className="fixed bottom-20 right-4 z-40 md:hidden bg-black/60 text-white hover:bg-black/80 rounded-full p-3 shadow-lg"
          title="全屏"
        >
          <Maximize className="w-5 h-5" />
        </Button>
      )}

      {/* 加载状态 */}
      {stream && !isConnected && (
        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>建立连接中...</span>
        </div>
      )}

      {/* 网络状态指示器 */}
      <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-xs">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
          }`}></div>
          <span>{isConnected ? '已连接' : '连接中'}</span>
        </div>
      </div>
    </div>
  );
}
