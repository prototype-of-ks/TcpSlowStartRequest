import { ConcurrentRequest } from './concurrentRequest';
import { 
  CustomRequest,
  HashForm,
  IResponse,
  RequestInstance, 
  RequestOption, 
  RequestStatus 
} from './types';
import * as SparkMD5 from 'spark-md5';

export class TcpSlowStartRequest extends ConcurrentRequest implements RequestInstance {
  concurrent: number = 4;
  offset: number = 1024 * 1024 * 2; // 2Mb
  progress: number = 0;
  status: RequestStatus;

  constructor() {
    super();
  }

  private createChunks(file: File): Blob[] {
    const { size } = file;
    const chunks: Blob[] = [];
    const offset = this.offset;
    let cur = 0;

    while (cur < size) {
      chunks.push(file.slice(cur, cur += offset));
    }
    return chunks;
  }

  private async createHashForms(file: File): Promise<HashForm[]> {
    const { name } = file;
    const chunks = this.createChunks(file);
    const hash = await TcpSlowStartRequest.calculateIdleHash(chunks);
    return chunks.map((chunk, id) => ({
      chunk,
      id,
      hash,
      name
    }));
  }

  static calculateIdleHash(chunks: Blob[]): Promise<string> {
    let count = 0;
    const reader = new FileReader();
    const spark = new SparkMD5.ArrayBuffer();

    return new Promise((resolve, reject) => {

      const appendChunkToSpark = (chunk: Blob) => {
        return new Promise((resolve) => {
          reader.readAsArrayBuffer(chunk);
          reader.onload = e => {
            spark.append(e.target!.result as ArrayBuffer);
            resolve(spark.end());
          };
        });
      };

      const workLoop = async (deadline: IdleDeadline) => {
        while (count < chunks.length && deadline.timeRemaining() > 1) {
          await appendChunkToSpark(chunks[count++]);

          if (count >= chunks.length) {
            resolve(spark.end());
          }
        }

        requestIdleCallback(workLoop);
      };

      requestIdleCallback(workLoop);
    });
  }

  static calculateShadowCloneHash(file: File, offset: number): Promise<string> {
    const reader = new FileReader();
    const spark = new SparkMD5.ArrayBuffer();
    const { size } = file;
    let chunks = [file.slice(0, offset)];
    let cur = offset;

    return new Promise((resolve) => {
      while (cur < size) {
        if (cur + offset > size) {
          chunks.push(file.slice(cur, cur + offset));
        } else {
          const end = offset + cur;
          const mid = end / 2;
          chunks.push(file.slice(cur, cur + 2));
          chunks.push(file.slice(mid, mid + 2));
          chunks.push(file.slice(end - 2, end));
        }
        cur += offset;
      }

      reader.readAsArrayBuffer(new Blob(chunks));
      reader.onload = e => {
        spark.append(e.target!.result as ArrayBuffer);
        resolve(spark.end());
      };

    });
  }

  sendRequest(file: File, option: RequestOption): CustomRequest<HashForm> {
    const { async, concurrence } = option;
    const responseList: IResponse[] = [];

    return async (request) => {
      try {
        this.status = RequestStatus.CalculatingHash;
        const hashForms = await this.createHashForms(file);

        if (async) {
          let asyncCount = 0;
          let cur = 0;
          let patchId = 0;

          const requestList = hashForms.map((form) => request(form));
          const { length } = requestList;

          this.status = RequestStatus.Uploading;

          while (cur < length) {
            const curRequestList = requestList.slice(cur, cur += concurrence);
            const response = await Promise.all(curRequestList);
            ++patchId;
            responseList.push(
              ...response.map(_ => {
                asyncCount++;
                return { 
                  ..._, 
                  patchId, 
                  requestId: asyncCount, 
                  async: true 
                };
              })
            );
          }
        }
      } catch (e) {
        this.status = RequestStatus.RequestFailed;
        responseList.push({
          success: false,
          concurrence,
          data: null,
          async,
          message: String(e)
        });
      }
      return responseList;
    };
  }

  tcpSsRequest(file: File): CustomRequest<FormData> {
    let cur = 0;
    let count = 0;
    let offset = this.offset;
    let uploadedChunkSize = 0;
    const { size, name } = file;
    const responseList: IResponse[] = [];

    return async (request) => { 
      try {
        this.status = RequestStatus.CalculatingHash;
        const hash = await TcpSlowStartRequest.calculateShadowCloneHash(file, offset);
        this.status = RequestStatus.Uploading;

        while (count < size) {
          const chunk = file.slice(cur, cur += offset);
          const form = new FormData();
          const hashForm: HashForm = {
            chunk,
            name,
            id: count++,
            hash
          };

          Object.keys(hashForm).forEach((key) => form.append(key, hashForm[key]));

          const start = Date.now();
          const response = await request(form);
          const now = Date.now();

          let spireTime = now - start;  
          let rate = spireTime / this.ssthresh;

          if (rate < 0.5) rate = 0.5
          if (rate > 2) rate = 2;
          
          offset = parseInt((offset / rate).toString());
          uploadedChunkSize += chunk.size;
  
          responseList.push({
            ...response,
            uploadedChunkSize,
            requestId: count,
            spireTime,
            rate,
            chunk
          });
          this.status = RequestStatus.RequestFinished;
        }
      } catch (e) {
        this.status = RequestStatus.RequestFailed;
        responseList.push({
          success: false,
          message: String(e),
          errorIndex: count,
          data: null
        });
      }
      return responseList;
    };
  }
} 