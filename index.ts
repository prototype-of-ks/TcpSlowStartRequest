import { TcpSlowStartRequest } from './src/core';
import { RequestOption } from './src/types';

export function withRequest(file: File, option: RequestOption) {
  return new TcpSlowStartRequest().sendRequest(file, option);  
}
