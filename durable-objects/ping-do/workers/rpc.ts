export type PingWorkerRpc = Rpc.WorkerEntrypointBranded & {
	pingServiceAck(): Promise<string>;
};
