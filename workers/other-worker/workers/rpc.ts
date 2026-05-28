export type OtherWorkerRpc = Rpc.WorkerEntrypointBranded & {
	otherServiceAck(): Promise<string>;
};
