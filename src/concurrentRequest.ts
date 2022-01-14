import { CustomRequest, HashForm, RequestOption } from './types';

export abstract class ConcurrentRequest {
  public concurrent: number;
  public ssthresh: number;
  public cwnd: number;
  public abstract sendRequest(file: File, options: RequestOption): CustomRequest<HashForm>;
  public abstract tcpSsRequest(file: File): CustomRequest<FormData>;
}
