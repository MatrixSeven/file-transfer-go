"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Hero from '@/components/Hero';
import FileTransfer from '@/components/FileTransfer';
import TextTransfer from '@/components/TextTransfer';
import DesktopShare from '@/components/DesktopShare';
import { useWebSocket } from '@/hooks/useWebSocket';
import { FileInfo, TransferProgress, WebSocketMessage, RoomStatus } from '@/types';
import { Upload, MessageSquare, Monitor } from 'lucide-react';
import { useToast } from '@/components/ui/toast-simple';
import { apiPost, apiGet, debugApiConfig } from '@/lib/api-utils';

interface FileTransferData {
  fileId: string;
  chunks: Array<{ offset: number; data: Uint8Array }>;
  totalSize: number;
  receivedSize: number;
  fileName: string;
  mimeType: string;
  startTime: number;
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { websocket, isConnected, connect, disconnect, sendMessage } = useWebSocket();
  const { showToast } = useToast();
  
  // URL参数管理
  const [activeTab, setActiveTab] = useState<'file' | 'text' | 'desktop'>('file');
  
  // 确认对话框状态
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<string>('');
  
  // 从URL参数中获取初始状态
  useEffect(() => {
    const type = searchParams.get('type') as 'file' | 'text' | 'desktop';
    const mode = searchParams.get('mode') as 'send' | 'receive';
    
    if (type && ['file', 'text', 'desktop'].includes(type)) {
      setActiveTab(type);
    }
  }, [searchParams]);

  // 更新URL参数
  const updateUrlParams = useCallback((tab: string, mode?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('type', tab);
    if (mode) {
      params.set('mode', mode);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // 发送方状态
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pickupCode, setPickupCode] = useState<string>('');
  const [pickupLink, setPickupLink] = useState<string>('');
  const [currentRole, setCurrentRole] = useState<'sender' | 'receiver'>('sender');
  
  // 接收方状态
  const [receiverFiles, setReceiverFiles] = useState<FileInfo[]>([]);
  const [transferProgresses, setTransferProgresses] = useState<TransferProgress[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // 房间状态
  const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
  
  // 文件传输状态
  const [fileTransfers, setFileTransfers] = useState<Map<string, FileTransferData>>(new Map());
  const [completedDownloads, setCompletedDownloads] = useState<Set<string>>(new Set());

  // 显示通知
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    showToast(message, type);
  }, [showToast]);

  // 处理tab切换
  const handleTabChange = useCallback((value: string) => {
    // 检查是否已经建立连接或生成取件码
    const hasActiveConnection = isConnected || pickupCode || isConnecting;
    
    if (hasActiveConnection && value !== activeTab) {
      // 如果已有活跃连接且要切换到不同的tab，显示确认对话框
      setPendingTabSwitch(value);
      setShowConfirmDialog(true);
      return;
    }
    
    // 如果没有活跃连接，正常切换
    setActiveTab(value as 'file' | 'text' | 'desktop');
    updateUrlParams(value);
  }, [updateUrlParams, isConnected, pickupCode, isConnecting, activeTab]);

  // 监听WebSocket连接状态变化，重置连接中状态
  useEffect(() => {
    if (isConnected && isConnecting) {
      setIsConnecting(false);
      console.log('WebSocket连接已建立，重置连接状态');
    }
  }, [isConnected, isConnecting]);

  // 确认切换tab
  const confirmTabSwitch = useCallback(() => {
    if (pendingTabSwitch) {
      const currentUrl = window.location.origin + window.location.pathname;
      const newUrl = `${currentUrl}?type=${pendingTabSwitch}`;
      
      // 在新标签页打开
      window.open(newUrl, '_blank');
      
      // 关闭对话框并清理状态
      setShowConfirmDialog(false);
      setPendingTabSwitch('');
    }
  }, [pendingTabSwitch]);

  // 取消切换tab
  const cancelTabSwitch = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingTabSwitch('');
  }, []);

  // 初始化文件传输
  const initFileTransfer = useCallback((fileInfo: any) => {
    console.log('初始化文件传输:', fileInfo);
    const transferKey = fileInfo.file_id;
    
    setFileTransfers(prev => {
      const newMap = new Map(prev);
      newMap.set(transferKey, {
        fileId: fileInfo.file_id,
        chunks: [],
        totalSize: fileInfo.size,
        receivedSize: 0,
        fileName: fileInfo.name,
        mimeType: fileInfo.mime_type,
        startTime: Date.now()
      });
      console.log('添加文件传输记录:', transferKey);
      return newMap;
    });
    
    setTransferProgresses(prev => {
      const updated = prev.map(p => p.fileId === fileInfo.file_id 
        ? { ...p, status: 'downloading' as const, totalSize: fileInfo.size }
        : p
      );
      console.log('更新传输进度为下载中:', updated);
      return updated;
    });
  }, []);

  // 组装并下载文件
  const assembleAndDownloadFile = useCallback((transferKey: string, transfer: FileTransferData) => {
    // 按偏移量排序数据块
    transfer.chunks.sort((a, b) => a.offset - b.offset);
    
    // 合并所有数据块
    const totalSize = transfer.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
    const mergedData = new Uint8Array(totalSize);
    let currentOffset = 0;
    
    transfer.chunks.forEach((chunk) => {
      mergedData.set(chunk.data, currentOffset);
      currentOffset += chunk.data.length;
    });
    
    // 创建Blob并触发下载
    const blob = new Blob([mergedData], { type: transfer.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = transfer.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 清理状态
    setFileTransfers(prev => {
      const newMap = new Map(prev);
      newMap.delete(transferKey);
      return newMap;
    });
    
    setTransferProgresses(prev => 
      prev.filter(p => p.fileId !== transferKey)
    );
    
    const transferTime = (Date.now() - transfer.startTime) / 1000;
    const speed = (transfer.totalSize / transferTime / 1024 / 1024).toFixed(2);
    showNotification(`文件 "${transfer.fileName}" 下载完成！传输速度: ${speed} MB/s`);
  }, [showNotification]);

  // 接收文件数据块
  const receiveFileChunk = useCallback((chunkData: any) => {
    console.log('接收文件数据块:', chunkData);
    const transferKey = chunkData.file_id;
    
    setFileTransfers(prev => {
      const newMap = new Map(prev);
      const transfer = newMap.get(transferKey);
      
      if (transfer) {
        // 检查是否已经完成，如果已经完成就不再处理新的数据块
        if (transfer.receivedSize >= transfer.totalSize) {
          console.log('文件已完成，忽略额外的数据块');
          return newMap;
        }

        const chunkArray = new Uint8Array(chunkData.data);
        transfer.chunks.push({
          offset: chunkData.offset,
          data: chunkArray
        });
        transfer.receivedSize += chunkArray.length;
        
        // 确保不超过总大小
        if (transfer.receivedSize > transfer.totalSize) {
          transfer.receivedSize = transfer.totalSize;
        }
        
        const progress = (transfer.receivedSize / transfer.totalSize) * 100;
        console.log(`文件 ${transferKey} 进度: ${progress.toFixed(2)}%`);
        
        // 更新进度
        setTransferProgresses(prev => {
          const updated = prev.map(p => p.fileId === transferKey 
            ? { 
                ...p, 
                progress, 
                receivedSize: transfer.receivedSize,
                totalSize: transfer.totalSize 
              }
            : p
          );
          console.log('更新进度状态:', updated);
          return updated;
        });
        
        // 检查是否完成
        if (chunkData.is_last || transfer.receivedSize >= transfer.totalSize) {
          console.log('文件接收完成，准备下载');
          // 标记为完成，等待 file-complete 消息统一处理下载
          setTransferProgresses(prev => 
            prev.map(p => p.fileId === transferKey 
              ? { ...p, status: 'completed' as const, progress: 100, receivedSize: transfer.totalSize }
              : p
            )
          );
        }
      } else {
        console.warn('未找到对应的文件传输:', transferKey);
      }
      
      return newMap;
    });
  }, []);

  // 完成文件下载
  const completeFileDownload = useCallback((fileId: string) => {
    console.log('文件传输完成，开始下载:', fileId);
    
    // 检查是否已经完成过下载
    if (completedDownloads.has(fileId)) {
      console.log('文件已经下载过，跳过重复下载:', fileId);
      return;
    }
    
    // 标记为已完成
    setCompletedDownloads(prev => new Set([...prev, fileId]));
    
    // 查找对应的文件传输数据
    const transfer = fileTransfers.get(fileId);
    if (transfer) {
      assembleAndDownloadFile(fileId, transfer);
      
      // 清理传输进度，移除已完成的文件进度显示
      setTimeout(() => {
        setTransferProgresses(prev => 
          prev.filter(p => p.fileId !== fileId)
        );
      }, 2000); // 2秒后清理，让用户看到完成状态
    } else {
      console.warn('未找到文件传输数据:', fileId);
    }
  }, [fileTransfers, assembleAndDownloadFile, completedDownloads]);

  // 处理文件请求（发送方）
  const handleFileRequest = useCallback(async (payload: any) => {
    const fileId = payload.file_id;
    const requestId = payload.request_id;
    
    const fileIndex = parseInt(fileId.replace('file_', ''));
    const file = selectedFiles[fileIndex];
    
    if (!file) {
      console.error('未找到请求的文件:', fileId);
      return;
    }
    
    console.log('开始发送文件:', file.name);
    showNotification(`开始发送文件: ${file.name}`);
    
    // 发送文件信息
    sendMessage({
      type: 'file-info',
      payload: {
        file_id: requestId,
        name: file.name,
        size: file.size,
        mime_type: file.type,
        last_modified: file.lastModified
      }
    });
    
    // 分块发送文件
    const chunkSize = 65536;
    let offset = 0;
    
    const sendChunk = () => {
      if (offset >= file.size) {
        sendMessage({
          type: 'file-complete',
          payload: { file_id: requestId }
        });
        showNotification(`文件发送完成: ${file.name}`);
        return;
      }
      
      const slice = file.slice(offset, offset + chunkSize);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const chunk = e.target?.result as ArrayBuffer;
        
        sendMessage({
          type: 'file-chunk',
          payload: {
            file_id: requestId,
            offset: offset,
            data: Array.from(new Uint8Array(chunk)),
            is_last: offset + chunk.byteLength >= file.size
          }
        });
        
        offset += chunk.byteLength;
        setTimeout(sendChunk, 10);
      };
      
      reader.readAsArrayBuffer(slice);
    };
    
    sendChunk();
  }, [selectedFiles, sendMessage, showNotification]);

  // WebSocket消息处理
  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent<WebSocketMessage>) => {
      const message = event.detail;
      console.log('HomePage收到WebSocket消息:', message.type, message);
      
      switch (message.type) {
        case 'file-list':
          console.log('处理file-list消息');
          if (currentRole === 'receiver') {
            setReceiverFiles((message.payload.files as FileInfo[]) || []);
            setIsConnecting(false);
          }
          break;
          
        case 'file-list-updated':
          console.log('处理file-list-updated消息');
          if (currentRole === 'receiver') {
            setReceiverFiles((message.payload.files as FileInfo[]) || []);
            showNotification('文件列表已更新，发现新文件！');
          }
          break;
          
        case 'room-status':
          console.log('处理room-status消息');
          setRoomStatus(message.payload as unknown as RoomStatus);
          break;
          
        case 'file-info':
          console.log('处理file-info消息');
          if (currentRole === 'receiver') {
            initFileTransfer(message.payload);
          }
          break;
          
        case 'file-chunk':
          console.log('处理file-chunk消息');
          if (currentRole === 'receiver') {
            receiveFileChunk(message.payload);
          }
          break;
          
        case 'file-complete':
          console.log('处理file-complete消息');
          if (currentRole === 'receiver') {
            completeFileDownload(message.payload.file_id as string);
          }
          break;
          
        case 'file-request':
          console.log('处理file-request消息');
          if (currentRole === 'sender') {
            handleFileRequest(message.payload);
          }
          break;
      }
    };

    window.addEventListener('websocket-message', handleWebSocketMessage as EventListener);
    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage as EventListener);
    };
  }, [currentRole, showNotification, initFileTransfer, receiveFileChunk, completeFileDownload, handleFileRequest]);

  // 生成取件码
  const handleGenerateCode = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    
    const fileInfos = selectedFiles.map((file, index) => ({
      id: 'file_' + index,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));
    
    try {
      const response = await apiPost('/api/create-room', { files: fileInfos });
      
      const data = await response.json();
      if (data.success) {
        const code = data.code;
        setPickupCode(code);
        setCurrentRole('sender');
        
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/?type=file&mode=receive&code=${code}`;
        setPickupLink(link);
        
        connect(code, 'sender');
        showNotification('取件码生成成功！');
      } else {
        showNotification('生成取件码失败: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('生成取件码失败:', error);
      showNotification('生成取件码失败，请重试', 'error');
    }
  }, [selectedFiles, connect, showNotification]);

  // 加入房间
  const handleJoinRoom = useCallback(async (code: string) => {
    // 防止重复连接
    if (isConnecting || (isConnected && pickupCode === code)) {
      console.log('已在连接中或已连接，跳过重复请求');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      const response = await apiGet(`/api/room-info?code=${code}`);
      const data = await response.json();
      
      if (data.success) {
        setPickupCode(code);
        setCurrentRole('receiver');
        setReceiverFiles(data.files || []);
        // 开始连接WebSocket
        connect(code, 'receiver');
        showNotification('连接成功！', 'success');
        // 注意：isConnecting状态会在WebSocket连接建立后自动重置
      } else {
        showNotification(data.message || '取件码不存在或已过期', 'error');
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('API调用失败:', error);
      showNotification('取件码不存在或已过期', 'error');
      setIsConnecting(false);
    }
  }, [connect, showNotification, isConnecting, isConnected, pickupCode]);

  // 处理URL参数中的取件码（仅在首次加载时）
  useEffect(() => {
    const code = searchParams.get('code');
    const type = searchParams.get('type');
    const mode = searchParams.get('mode');
    
    // 只有在完整的URL参数情况下才自动加入房间：
    // 1. 有效的6位取件码
    // 2. 当前未连接
    // 3. 不是已经连接的同一个房间码
    // 4. 必须是完整的链接：有type、mode=receive和code参数
    // 5. 不是文字类型（文字类型由TextTransfer组件处理）
    if (code && 
        code.length === 6 && 
        !isConnected && 
        pickupCode !== code.toUpperCase() &&
        type &&
        type !== 'text' &&
        mode === 'receive') {
      console.log('自动加入文件房间:', code.toUpperCase());
      setCurrentRole('receiver');
      handleJoinRoom(code.toUpperCase());
    }
  }, [searchParams]); // 移除依赖，只在URL变化时触发

  // 下载文件
  const handleDownloadFile = useCallback((fileId: string) => {
    console.log('开始下载文件:', fileId);
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      showNotification('连接未建立，请重试', 'error');
      return;
    }
    
    // 检查是否已有同文件的进行中传输
    const existingProgress = transferProgresses.find(p => p.originalFileId === fileId && p.status !== 'completed');
    if (existingProgress) {
      console.log('文件已在下载中，跳过重复请求:', fileId);
      showNotification('文件正在下载中...', 'info');
      return;
    }
    
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('生成请求ID:', requestId);
    
    sendMessage({
      type: 'file-request',
      payload: {
        file_id: fileId,
        request_id: requestId
      }
    });
    
    // 更新传输状态
    const newProgress = {
      fileId: requestId, // 传输的唯一标识
      originalFileId: fileId, // 原始文件ID，用于UI匹配
      fileName: receiverFiles.find(f => f.id === fileId)?.name || fileId,
      progress: 0,
      receivedSize: 0,
      totalSize: 0,
      status: 'pending' as const
    };
    
    console.log('添加传输进度:', newProgress);
    setTransferProgresses(prev => [
      ...prev.filter(p => p.originalFileId !== fileId), // 移除该文件的旧进度记录
      newProgress
    ]);
  }, [websocket, sendMessage, receiverFiles, showNotification, transferProgresses]);

  // 通过WebSocket更新文件列表
  const updateFileList = useCallback((files: File[]) => {
    if (!pickupCode || !websocket || websocket.readyState !== WebSocket.OPEN) {
      console.log('无法更新文件列表: pickupCode=', pickupCode, 'websocket状态=', websocket?.readyState);
      return;
    }
    
    const fileInfos = files.map((file, index) => ({
      id: 'file_' + index,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));
    
    console.log('通过WebSocket发送文件列表更新:', fileInfos);
    sendMessage({
      type: 'update-file-list',
      payload: {
        files: fileInfos
      }
    });
    
    showNotification('文件列表已更新');
  }, [pickupCode, websocket, sendMessage, showNotification]);

  // 处理文件删除后的同步
  const handleRemoveFile = useCallback((updatedFiles: File[]) => {
    if (pickupCode) {
      updateFileList(updatedFiles);
    }
  }, [pickupCode, updateFileList]);

  // 清空文件列表但保持房间连接
  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    setTransferProgresses([]);
    setFileTransfers(new Map());
    // 保持 pickupCode, pickupLink, roomStatus 和 websocket 连接
    if (pickupCode) {
      updateFileList([]);
      showNotification('文件列表已清空，房间保持连接', 'success');
    }
  }, [pickupCode, updateFileList, showNotification]);

  // 完全重置状态（关闭房间）
  const handleReset = useCallback(() => {
    setSelectedFiles([]);
    setPickupCode('');
    setPickupLink('');
    setReceiverFiles([]);
    setTransferProgresses([]);
    setRoomStatus(null);
    setFileTransfers(new Map());
    disconnect();
    showNotification('已断开连接', 'info');
  }, [disconnect, showNotification]);

    // 复制到剪贴板
  const copyToClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification(successMessage, 'success');
    } catch (err) {
      console.error('复制失败:', err);
      showNotification('复制失败，请手动复制', 'error');
    }
  }, [showNotification]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Hero Section */}
      <div className="relative min-h-screen">
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
          <Hero />

          <div className="max-w-4xl mx-auto">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border-0 shadow-lg h-12 sm:h-14 p-1 mb-6">
                <TabsTrigger 
                  value="file" 
                  className="flex items-center justify-center space-x-2 text-sm sm:text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300"
                >
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">传文件</span>
                  <span className="sm:hidden">文件</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="text" 
                  className="flex items-center justify-center space-x-2 text-sm sm:text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300"
                >
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">传文字</span>
                  <span className="sm:hidden">文字</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="desktop" 
                  className="flex items-center justify-center space-x-2 text-sm sm:text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300"
                >
                  <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">共享桌面</span>
                  <span className="sm:hidden">桌面</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="mt-6 animate-fade-in-up">
                <FileTransfer
                  selectedFiles={selectedFiles}
                  onFilesChange={setSelectedFiles}
                  onGenerateCode={handleGenerateCode}
                  pickupCode={pickupCode}
                  pickupLink={pickupLink}
                  onCopyCode={() => copyToClipboard(pickupCode, '取件码已复制到剪贴板！')}
                  onCopyLink={() => copyToClipboard(pickupLink, '取件链接已复制到剪贴板！')}
                  onAddMoreFiles={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = async (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files || []);
                      const newFiles = [...selectedFiles, ...files];
                      setSelectedFiles(newFiles);
                      
                      if (pickupCode && files.length > 0) {
                        updateFileList(newFiles);
                      }
                    };
                    input.click();
                  }}
                  onRemoveFile={handleRemoveFile}
                  onClearFiles={handleClearFiles}
                  onReset={handleReset}
                  onJoinRoom={handleJoinRoom}
                  receiverFiles={receiverFiles}
                  onDownloadFile={handleDownloadFile}
                  transferProgresses={transferProgresses}
                  isConnected={isConnected}
                  isConnecting={isConnecting}
                  disabled={isConnecting}
                />
                
                {roomStatus && currentRole === 'sender' && (
                  <div className="mt-6 glass-card rounded-2xl p-6 animate-fade-in-up">
                    <h3 className="text-xl font-semibold text-slate-800 mb-4 text-center">实时状态</h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                        <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                          {(roomStatus?.sender_count || 0) + (roomStatus?.receiver_count || 0)}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">在线用户</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl">
                        <div className="text-3xl font-bold text-emerald-600">
                          {roomStatus?.sender_count || 0}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">发送方</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl">
                        <div className="text-3xl font-bold text-purple-600">
                          {roomStatus?.receiver_count || 0}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">接收方</div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="text" className="mt-6 animate-fade-in-up">
                <TextTransfer
                  onSendText={async (text: string) => {
                    try {
                      const response = await fetch('/api/create-text-room', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ text }),
                      });

                      const data = await response.json();
                      
                      if (!response.ok) {
                        const errorMessage = data.error || '创建文字传输房间失败';
                        showNotification(errorMessage, 'error');
                        return ''; // 返回空字符串而不是抛出错误
                      }

                      // 注释掉这里的成功提示，让 TextTransfer 组件来处理
                      // showNotification('文字传输房间创建成功！', 'success');
                      return data.code;
                    } catch (error) {
                      console.error('创建文字传输房间失败:', error);
                      showNotification('网络错误，请重试', 'error');
                      return ''; // 返回空字符串而不是抛出错误
                    }
                  }}
                  onReceiveText={async (code: string) => {
                    // 文字内容现在通过WebSocket获取，不再需要HTTP API
                    // 这个函数保留是为了兼容性，实际内容通过WebSocket的text-content消息获取
                    console.log('onReceiveText被调用，但文字内容将通过WebSocket获取:', code);
                    return '';
                  }}
                  websocket={websocket}
                  isConnected={isConnected}
                  currentRole={currentRole}
                  onCreateWebSocket={(code: string, role: 'sender' | 'receiver') => {
                    // 如果已有连接，先关闭
                    if (websocket) {
                      disconnect();
                    }
                    
                    // 创建新的WebSocket连接
                    connect(code, role);
                  }}
                />
              </TabsContent>

              <TabsContent value="desktop" className="mt-6 animate-fade-in-up">
                <DesktopShare
                  onStartSharing={async () => {
                    // TODO: 实现桌面共享功能
                    showNotification('桌面共享功能开发中', 'info');
                    return 'DEF456'; // 模拟返回连接码
                  }}
                  onStopSharing={async () => {
                    showNotification('桌面共享已停止', 'info');
                  }}
                  onJoinSharing={async (code: string) => {
                    // TODO: 实现桌面查看功能
                    showNotification('桌面共享功能开发中', 'info');
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
          
          <div className="h-8 sm:h-16"></div>
        </div>
      </div>

      {/* 确认对话框 */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>切换传输模式</DialogTitle>
            <DialogDescription>
              {(() => {
                let currentMode = '';
                let targetMode = '';
                
                switch (activeTab) {
                  case 'file':
                    currentMode = '文件传输';
                    break;
                  case 'text':
                    currentMode = '文字传输';
                    break;
                  case 'desktop':
                    currentMode = '桌面共享';
                    break;
                }
                
                switch (pendingTabSwitch) {
                  case 'file':
                    targetMode = '文件传输';
                    break;
                  case 'text':
                    targetMode = '文字传输';
                    break;
                  case 'desktop':
                    targetMode = '桌面共享';
                    break;
                }
                
                return `当前${currentMode}会话进行中，是否要在新标签页中打开${targetMode}？`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelTabSwitch}>
              取消
            </Button>
            <Button onClick={confirmTabSwitch}>
              确认打开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
