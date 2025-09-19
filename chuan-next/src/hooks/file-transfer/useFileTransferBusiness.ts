import { useCallback, useEffect, useRef, useState } from 'react';
import { type IWebConnection } from '../connection/types';


// 文件传输状态
interface FileTransferState {
  isConnecting: boolean;
  isConnected: boolean;
  isWebSocketConnected: boolean;
  connectionError: string | null;
  isTransferring: boolean;
  progress: number;
  error: string | null;
  receivedFiles: Array<{ id: string; file: File }>;
}

// 单个文件的接收进度
interface FileReceiveProgress {
  fileId: string;
  fileName: string;
  totalChunks: number;
  progress: number;
}

// 文件信息
interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'ready' | 'downloading' | 'completed';
  progress: number;
}

// 文件元数据
interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
}

// 文件块信息
interface FileChunk {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  checksum?: string; // 数据校验和
}

// 块确认信息
interface ChunkAck {
  fileId: string;
  chunkIndex: number;
  success: boolean;
  checksum?: string;
}

// 传输状态
interface TransferStatus {
  fileId: string;
  fileName: string;
  totalChunks: number;
  sentChunks: Set<number>;
  acknowledgedChunks: Set<number>;
  failedChunks: Set<number>;
  lastChunkTime: number;
  retryCount: Map<number, number>;
  averageSpeed: number; // KB/s
}

// 回调类型
type FileReceivedCallback = (fileData: { id: string; file: File }) => void;
type FileRequestedCallback = (fileId: string, fileName: string) => void;
type FileProgressCallback = (progressInfo: { fileId: string; fileName: string; progress: number }) => void;
type FileListReceivedCallback = (fileList: FileInfo[]) => void;

const CHANNEL_NAME = 'file-transfer';
const WEBRTC_CHUNK_SIZE = 256 * 1024; // 256KB for WebRTC
const WEBSOCKET_CHUNK_SIZE = 3 * 1024 * 1024; // 3MB for WebSocket
const MAX_RETRIES = 5; // 最大重试次数
const RETRY_DELAY = 1000; // 重试延迟（毫秒）
const ACK_TIMEOUT = 5000; // 确认超时（毫秒）

/**
 * 根据连接类型获取块大小
 */
function getChunkSize(connectType: string): number {
  return connectType === 'websocket' ? WEBSOCKET_CHUNK_SIZE : WEBRTC_CHUNK_SIZE;
}


/**
 * 计算数据的CRC32校验和
 */
function calculateChecksum(data: ArrayBuffer): string {
  const buffer = new Uint8Array(data);
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xFFFFFFFF).toString(16).padStart(8, '0');
}


/**
 * 文件传输业务层
 * 必须传入共享的 WebRTC 连接
 */
export function useFileTransferBusiness(connection: IWebConnection) {

  const [state, setState] = useState<FileTransferState>({
    isConnecting: false,
    isConnected: false,
    isWebSocketConnected: false,
    connectionError: null,
    isTransferring: false,
    progress: 0,
    error: null,
    receivedFiles: [],
  });

  // 接收文件缓存
  const receivingFiles = useRef<Map<string, {
    metadata: FileMetadata;
    chunks: ArrayBuffer[];
    receivedChunks: number;
  }>>(new Map());

  // 当前期望的文件块
  const expectedChunk = useRef<FileChunk | null>(null);

  // 回调存储
  const fileReceivedCallbacks = useRef<Set<FileReceivedCallback>>(new Set());
  const fileRequestedCallbacks = useRef<Set<FileRequestedCallback>>(new Set());
  const fileProgressCallbacks = useRef<Set<FileProgressCallback>>(new Set());
  const fileListCallbacks = useRef<Set<FileListReceivedCallback>>(new Set());

  // 传输状态管理
  const transferStatus = useRef<Map<string, TransferStatus>>(new Map());
  const pendingChunks = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const chunkAckCallbacks = useRef<Map<string, Set<(ack: ChunkAck) => void>>>(new Map());

  // 接收文件进度跟踪
  const receiveProgress = useRef<Map<string, FileReceiveProgress>>(new Map());
  const activeReceiveFile = useRef<string | null>(null);

  const updateState = useCallback((updates: Partial<FileTransferState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 消息处理器
  const handleMessage = useCallback((message: any) => {
    if (!message.type.startsWith('file-')) return;

    console.log('文件传输收到消息:', message.type, message); switch (message.type) {
      case 'file-metadata':
        const metadata: FileMetadata = message.payload;
        console.log('开始接收文件:', metadata.name);

        receivingFiles.current.set(metadata.id, {
          metadata,
          chunks: [],
          receivedChunks: 0,
        });

        // 初始化接收进度跟踪
        const totalChunks = Math.ceil(metadata.size / getChunkSize(connection.connectType));
        receiveProgress.current.set(metadata.id, {
          fileId: metadata.id,
          fileName: metadata.name,
          totalChunks,
          progress: 0
        });

        // 设置当前活跃的接收文件
        activeReceiveFile.current = metadata.id;
        updateState({ isTransferring: true, progress: 0 });
        break;

      case 'file-chunk-info':
        expectedChunk.current = message.payload;
        console.log('准备接收文件块:', message.payload);
        break;

      case 'file-complete':
        const { fileId } = message.payload;
        const fileInfo = receivingFiles.current.get(fileId);

        if (fileInfo) {
          // 组装文件
          const blob = new Blob(fileInfo.chunks, { type: fileInfo.metadata.type });
          const file = new File([blob], fileInfo.metadata.name, {
            type: fileInfo.metadata.type
          });

          console.log('文件接收完成:', file.name);

          setState(prev => ({
            ...prev,
            receivedFiles: [...prev.receivedFiles, { id: fileId, file }],
            isTransferring: false,
            progress: 100
          }));

          fileReceivedCallbacks.current.forEach(cb => cb({ id: fileId, file }));
          receivingFiles.current.delete(fileId);
          receiveProgress.current.delete(fileId);

          // 清除活跃文件
          if (activeReceiveFile.current === fileId) {
            activeReceiveFile.current = null;
          }
        }
        break;

      case 'file-list':
        console.log('收到文件列表:', message.payload);
        fileListCallbacks.current.forEach(cb => cb(message.payload));
        break;

      case 'file-request':
        const { fileId: requestedFileId, fileName } = message.payload;
        console.log('收到文件请求:', fileName, requestedFileId);
        fileRequestedCallbacks.current.forEach(cb => cb(requestedFileId, fileName));
        break;

      case 'file-chunk-ack':
        const ack: ChunkAck = message.payload;
        console.log('收到块确认:', ack);

        // 清除超时定时器
        const chunkKey = `${ack.fileId}-${ack.chunkIndex}`;
        const timeout = pendingChunks.current.get(chunkKey);
        if (timeout) {
          clearTimeout(timeout);
          pendingChunks.current.delete(chunkKey);
        }

        // 调用确认回调
        const callbacks = chunkAckCallbacks.current.get(chunkKey);
        if (callbacks) {
          callbacks.forEach(cb => cb(ack));
          chunkAckCallbacks.current.delete(chunkKey);
        }

        // 更新传输状态
        const status = transferStatus.current.get(ack.fileId);
        if (status) {
          if (ack.success) {
            status.acknowledgedChunks.add(ack.chunkIndex);
            status.failedChunks.delete(ack.chunkIndex);
          } else {
            status.failedChunks.add(ack.chunkIndex);
          }
        }
        break;
    }
  }, [updateState]);

  // 处理文件块数据
  const handleData = useCallback((data: ArrayBuffer) => {
    if (!expectedChunk.current) {
      console.warn('收到数据但没有对应的块信息');
      return;
    }

    const { fileId, chunkIndex, totalChunks, checksum: expectedChecksum } = expectedChunk.current;
    const fileInfo = receivingFiles.current.get(fileId);

    if (fileInfo) {
      // 验证数据完整性
      const actualChecksum = calculateChecksum(data);
      const isValid = !expectedChecksum || actualChecksum === expectedChecksum;

      if (!isValid) {
        console.warn(`文件块校验失败: 期望 ${expectedChecksum}, 实际 ${actualChecksum}`);

        // 发送失败确认
        connection.sendMessage({
          type: 'file-chunk-ack',
          payload: {
            fileId,
            chunkIndex,
            success: false,
            checksum: actualChecksum
          }
        }, CHANNEL_NAME);

        expectedChunk.current = null;
        return;
      }

      // 检查是否已经接收过这个块，避免重复计数
      const alreadyReceived = fileInfo.chunks[chunkIndex] !== undefined;

      // 数据有效，保存到缓存
      fileInfo.chunks[chunkIndex] = data;

      // 只有在首次接收时才增加计数
      if (!alreadyReceived) {
        fileInfo.receivedChunks++;
      }

      // 更新接收进度跟踪 - 使用 fileInfo 的计数，避免双重计数
      const progressInfo = receiveProgress.current.get(fileId);
      if (progressInfo) {
        progressInfo.progress = progressInfo.totalChunks > 0 ?
          (fileInfo.receivedChunks / progressInfo.totalChunks) * 100 : 0;

        // 只有当这个文件是当前活跃文件时才更新全局进度
        if (activeReceiveFile.current === fileId) {
          updateState({ progress: progressInfo.progress });
        }

        // 触发进度回调
        fileProgressCallbacks.current.forEach(cb => cb({
          fileId: fileId,
          fileName: progressInfo.fileName,
          progress: progressInfo.progress
        }));

        console.log(`文件 ${progressInfo.fileName} 接收进度: ${progressInfo.progress.toFixed(1)}%`);
      }

      // 发送成功确认
      connection.sendMessage({
        type: 'file-chunk-ack',
        payload: {
          fileId,
          chunkIndex,
          success: true,
          checksum: actualChecksum
        }
      }, CHANNEL_NAME);

      expectedChunk.current = null;
    }
  }, [updateState, connection]);

  const connectionRef = useRef(connection);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    // 使用共享连接的注册方式
    const unregisterMessage = connectionRef.current.registerMessageHandler(CHANNEL_NAME, handleMessage);
    const unregisterData = connectionRef.current.registerDataHandler(CHANNEL_NAME, handleData);

    return () => {
      unregisterMessage();
      unregisterData();
    };
  }, []); // 只依赖 connection 对象，不依赖处理函数

  // 监听连接状态变化 (直接使用 connection 的状态)
  useEffect(() => {
    // 同步连接状态
    updateState({
      isConnecting: connection.getConnectState().isConnecting,
      isConnected: connection.getConnectState().isConnected,
      isWebSocketConnected: connection.getConnectState().isWebSocketConnected,
      connectionError: connection.getConnectState().error
    });
  }, [connection.getConnectState, updateState]);

  // 连接
  const connect = useCallback((roomCode: string, role: 'sender' | 'receiver') => {
    return connection.connect(roomCode, role);
  }, [connection]);

  // 安全发送单个文件块
  const sendChunkWithAck = useCallback(async (
    fileId: string,
    chunkIndex: number,
    chunkData: ArrayBuffer,
    checksum: string,
    retryCount = 0
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      // 改进数据传输前的连接状态检查
      const channelState = connection.getConnectState();
      const isChannelUsable =
        channelState.state === 'open' ||
        channelState.isDataChannelConnected ||
        channelState.isPeerConnected ||
        (channelState.isWebSocketConnected && channelState.currentConnectType === 'websocket');

      if (!isChannelUsable) {
        console.warn(`数据块发送失败，传输通道不可用 ${chunkIndex}:`, {
          state: channelState.state,
          isDataChannelConnected: channelState.isDataChannelConnected,
          isPeerConnected: channelState.isPeerConnected,
          isWebSocketConnected: channelState.isWebSocketConnected,
          currentConnectType: channelState.currentConnectType
        });
        resolve(false);
        return;
      }

      const chunkKey = `${fileId}-${chunkIndex}`;

      // 设置确认回调
      const ackCallback = (ack: ChunkAck) => {
        if (ack.success) {
          resolve(true);
        } else {
          console.warn(`文件块 ${chunkIndex} 确认失败，准备重试`);
          resolve(false);
        }
      };

      // 注册确认回调
      if (!chunkAckCallbacks.current.has(chunkKey)) {
        chunkAckCallbacks.current.set(chunkKey, new Set());
      }
      chunkAckCallbacks.current.get(chunkKey)!.add(ackCallback);

      // 设置超时定时器
      const timeout = setTimeout(() => {
        console.warn(`文件块 ${chunkIndex} 确认超时`);
        chunkAckCallbacks.current.get(chunkKey)?.delete(ackCallback);
        resolve(false);
      }, ACK_TIMEOUT);

      pendingChunks.current.set(chunkKey, timeout);

      // 发送块信息
      connection.sendMessage({
        type: 'file-chunk-info',
        payload: {
          fileId,
          chunkIndex,
          totalChunks: 0, // 这里不需要，因为已经在元数据中发送
          checksum
        }
      }, CHANNEL_NAME);

      // 发送块数据
      connection.sendData(chunkData);
    });
  }, [connection]);

  // 安全发送文件
  const sendFileSecure = useCallback(async (file: File, fileId?: string) => {
    // 改进连接状态检查 - 使用更全面的连接状态判断
    const connectState = connection.getConnectState();
    const isReadyToSend =
      connectState.state === 'open' ||                    // 数据通道已打开
      connectState.isDataChannelConnected ||              // 数据通道已连接
      connectState.isPeerConnected ||                     // P2P连接已建立
      (connectState.isWebSocketConnected && connectState.currentConnectType === 'websocket'); // WebSocket降级模式

    console.log('发送文件前连接状态检查:', {
      state: connectState.state,
      isDataChannelConnected: connectState.isDataChannelConnected,
      isPeerConnected: connectState.isPeerConnected,
      isWebSocketConnected: connectState.isWebSocketConnected,
      currentConnectType: connectState.currentConnectType,
      isReadyToSend
    });

    if (!isReadyToSend) {
      const errorMsg = `连接未就绪 - 状态: ${connectState.state}, 数据通道: ${connectState.isDataChannelConnected}, P2P: ${connectState.isPeerConnected}, WebSocket: ${connectState.isWebSocketConnected}`;
      console.error(errorMsg);
      updateState({ error: errorMsg });
      return;
    }

    const actualFileId = fileId || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chunkSize = getChunkSize(connection.connectType);
    const totalChunks = Math.ceil(file.size / chunkSize);

    console.log('开始安全发送文件:', file.name, '文件ID:', actualFileId, '总块数:', totalChunks, '块大小:', chunkSize);

    updateState({ isTransferring: true, progress: 0, error: null });

    // 初始化传输状态
    const status: TransferStatus = {
      fileId: actualFileId,
      fileName: file.name,
      totalChunks,
      sentChunks: new Set(),
      acknowledgedChunks: new Set(),
      failedChunks: new Set(),
      lastChunkTime: Date.now(),
      retryCount: new Map(),
      averageSpeed: 0
    };
    transferStatus.current.set(actualFileId, status);

    try {
      // 1. 发送文件元数据
      connection.sendMessage({
        type: 'file-metadata',
        payload: {
          id: actualFileId,
          name: file.name,
          size: file.size,
          type: file.type
        }
      }, CHANNEL_NAME);

      // 2. 分块发送文件
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        let success = false;
        let retryCount = 0;

        while (!success && retryCount <= MAX_RETRIES) {
          // 改进传输过程中的连接状态检查
          const channelState = connection.getConnectState();
          const isChannelUsable =
            channelState.state === 'open' ||
            channelState.isDataChannelConnected ||
            channelState.isPeerConnected ||
            (channelState.isWebSocketConnected && channelState.currentConnectType === 'websocket');

          if (!isChannelUsable) {
            console.warn(`数据传输通道不可用，停止文件传输:`, {
              state: channelState.state,
              isDataChannelConnected: channelState.isDataChannelConnected,
              isPeerConnected: channelState.isPeerConnected,
              isWebSocketConnected: channelState.isWebSocketConnected,
              currentConnectType: channelState.currentConnectType
            });
            throw new Error('数据传输通道不可用');
          }

          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);
          const arrayBuffer = await chunk.arrayBuffer();
          const checksum = calculateChecksum(arrayBuffer);

          console.log(`发送文件块 ${chunkIndex}/${totalChunks}, 重试次数: ${retryCount}`);

          // 发送块并等待确认
          success = await sendChunkWithAck(actualFileId, chunkIndex, arrayBuffer, checksum, retryCount);

          if (success) {
            status.sentChunks.add(chunkIndex);
            status.acknowledgedChunks.add(chunkIndex);
            status.failedChunks.delete(chunkIndex);

            // 计算传输速度
            const now = Date.now();
            const timeDiff = (now - status.lastChunkTime) / 1000; // 秒
            if (timeDiff > 0) {
              const speed = (arrayBuffer.byteLength / 1024) / timeDiff; // KB/s
              status.averageSpeed = status.averageSpeed * 0.7 + speed * 0.3; // 平滑平均
            }
            status.lastChunkTime = now;
          } else {
            retryCount++;
            status.retryCount.set(chunkIndex, retryCount);

            if (retryCount > MAX_RETRIES) {
              status.failedChunks.add(chunkIndex);
              throw new Error(`文件块 ${chunkIndex} 发送失败，超过最大重试次数`);
            }

            // 指数退避
            const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount - 1), 10000);
            console.log(`等待 ${delay}ms 后重试文件块 ${chunkIndex}`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        // 更新进度 - 基于已发送的块数，这样与接收方的进度更同步
        const progress = ((chunkIndex + 1) / totalChunks) * 100;
        updateState({ progress });

        fileProgressCallbacks.current.forEach(cb => cb({
          fileId: actualFileId,
          fileName: file.name,
          progress
        }));

        // 自适应流控：根据传输速度调整发送间隔
        if (status.averageSpeed > 0) {
          const currentChunkSize = Math.min(chunkSize, file.size - chunkIndex * chunkSize);
          const expectedTime = (currentChunkSize / 1024) / status.averageSpeed;
          const actualTime = Date.now() - status.lastChunkTime;
          const delay = Math.max(0, expectedTime - actualTime);

          if (delay > 10) {
            await new Promise(resolve => setTimeout(resolve, Math.min(delay, 100)));
          }
        }
      }

      // 3. 验证所有块都已确认
      if (status.acknowledgedChunks.size !== totalChunks) {
        throw new Error(`文件传输不完整：${status.acknowledgedChunks.size}/${totalChunks} 块已确认`);
      }

      // 4. 发送完成信号
      connection.sendMessage({
        type: 'file-complete',
        payload: { fileId: actualFileId }
      }, CHANNEL_NAME);

      updateState({ isTransferring: false, progress: 100 });
      console.log('文件安全发送完成:', file.name, `平均速度: ${status.averageSpeed.toFixed(2)} KB/s`);
      transferStatus.current.delete(actualFileId);

    } catch (error) {
      console.error('安全发送文件失败:', error);
      updateState({
        error: error instanceof Error ? error.message : '发送失败',
        isTransferring: false
      });
      transferStatus.current.delete(actualFileId);
    }
  }, [connection, updateState, sendChunkWithAck]);

  // 保持原有的 sendFile 方法用于向后兼容
  const sendFile = useCallback(async (file: File, fileId?: string) => {
    // 默认使用新的安全发送方法
    return sendFileSecure(file, fileId);
  }, [sendFileSecure]);

  // 发送文件列表
  const sendFileList = useCallback((fileList: FileInfo[]) => {
    // 改进连接状态检查逻辑
    const channelState = connection.getConnectState();
    const isReadyToSend =
      channelState.state === 'open' ||
      channelState.isDataChannelConnected ||
      channelState.isPeerConnected ||
      (channelState.isWebSocketConnected && channelState.currentConnectType === 'websocket') ||
      channelState.isConnected;

    console.log('发送文件列表检查:', {
      state: channelState.state,
      isDataChannelConnected: channelState.isDataChannelConnected,
      isPeerConnected: channelState.isPeerConnected,
      isWebSocketConnected: channelState.isWebSocketConnected,
      currentConnectType: channelState.currentConnectType,
      isConnected: channelState.isConnected,
      isReadyToSend,
      fileListLength: fileList.length
    });

    if (isReadyToSend) {
      console.log('发送文件列表:', fileList.map(f => f.name));

      const sendResult = connection.sendMessage({
        type: 'file-list',
        payload: fileList
      }, CHANNEL_NAME);

      if (!sendResult) {
        console.warn('文件列表发送失败，可能是数据通道未准备好');
        // 不立即重试，让上层逻辑处理重试
      }
    } else {
      console.log('连接未就绪，等待连接后再发送文件列表');
    }
  }, [connection]);

  // 请求文件
  const requestFile = useCallback((fileId: string, fileName: string) => {
    const channelState = connection.getConnectState();

    // 统一的连接状态检查逻辑
    const isReadyToRequest =
      channelState.state === 'open' ||
      channelState.isDataChannelConnected ||
      channelState.isPeerConnected ||
      (channelState.isWebSocketConnected && channelState.currentConnectType === 'websocket') ||
      channelState.isConnected;

    console.log('请求文件前检查连接状态:', {
      fileName,
      fileId,
      state: channelState.state,
      isDataChannelConnected: channelState.isDataChannelConnected,
      isPeerConnected: channelState.isPeerConnected,
      isWebSocketConnected: channelState.isWebSocketConnected,
      currentConnectType: channelState.currentConnectType,
      isConnected: channelState.isConnected,
      isReadyToRequest
    });

    if (!isReadyToRequest) {
      console.error('数据通道未准备就绪，无法请求文件');
      return;
    }

    console.log('发送文件请求:', fileName, fileId);

    const sendResult = connection.sendMessage({
      type: 'file-request',
      payload: { fileId, fileName }
    }, CHANNEL_NAME);

    if (!sendResult) {
      console.error('文件请求发送失败，可能是数据通道问题');
      // 不立即重试，让上层逻辑处理重试
    }
  }, [connection]);

  // 注册回调函数
  const onFileReceived = useCallback((callback: FileReceivedCallback) => {
    fileReceivedCallbacks.current.add(callback);
    return () => { fileReceivedCallbacks.current.delete(callback); };
  }, []);

  const onFileRequested = useCallback((callback: FileRequestedCallback) => {
    fileRequestedCallbacks.current.add(callback);
    return () => { fileRequestedCallbacks.current.delete(callback); };
  }, []);

  const onFileProgress = useCallback((callback: FileProgressCallback) => {
    fileProgressCallbacks.current.add(callback);
    return () => { fileProgressCallbacks.current.delete(callback); };
  }, []);

  const onFileListReceived = useCallback((callback: FileListReceivedCallback) => {
    fileListCallbacks.current.add(callback);
    return () => { fileListCallbacks.current.delete(callback); };
  }, []);

  // 清除发送方数据
  const clearSenderData = useCallback(() => {
    console.log('[FileTransferBusiness] 清除发送方数据');

    // 清除传输状态
    transferStatus.current.clear();

    // 清除待处理的块
    pendingChunks.current.forEach(timeout => clearTimeout(timeout));
    pendingChunks.current.clear();

    // 清除块确认回调
    chunkAckCallbacks.current.clear();

    // 重置状态
    updateState({
      isTransferring: false,
      progress: 0,
      error: null
    });
  }, [updateState]);

  // 设置断开连接回调
  useEffect(() => {
    connection.setOnDisconnectCallback(clearSenderData);

    return () => {
      // 清理回调
      connection.setOnDisconnectCallback(() => { });
    };
  }, [connection, clearSenderData]);

  return {
    // 文件传输状态（包括连接状态）
    ...state,

    // 操作方法
    connect,
    disconnect: connection.disconnect,
    sendFile,
    sendFileList,
    requestFile,
    clearSenderData,

    // 回调注册
    onFileReceived,
    onFileRequested,
    onFileProgress,
    onFileListReceived,
  };
}
