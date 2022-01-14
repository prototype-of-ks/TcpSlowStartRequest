export enum RequestStatus {
  CalculatingHash = 'CalculatingHash',
  Uploading = 'Uploading',
  RequestFinished = 'RequestFinished',
  RequestFailed = 'RequestFailed'
}

export interface RequestInstance {
  offset: number;
  progress: number;
  status: RequestStatus;
  container?: {
    file: File,
    hash: String
  };
}

export interface RequestOption {
  concurrence: number;
  async?: boolean;
}

export interface HashForm {
  hash: string;
  chunk: Blob;
  id: number;
  name: string;
}

export interface AnalyticalResponse {
  patchId: number;                // 上传批次
  concurrence: number;            // 并发数
  queue: number;                  // 上传通道大小
  requestId: number | string;     // 请求id
  async: boolean;                 // 是否异步
  uploadedChunkSize: number;      // 已上传大小
  chunk: Blob,                    // 此次应上传的 chunk
  spireTime: number;              // 耗时
  rate: number;                   // 耗时与 ssthresh 比例
}

export interface ErrorResponse {
  error: string;
  errorIndex: number;
}

export type IResponse = {
  success: boolean;
  data: any;
  message: string;
  patchId?: number;
} & Partial<Response> & Partial<AnalyticalResponse> & Partial<ErrorResponse>;



export type CustomRequest<T> = (request: (form: T) => Promise<IResponse>) => Promise<IResponse[]>;