import { Transform, TransformCallback, TransformOptions } from "stream";
export class PassthroughProgress extends Transform{
	totalLength: number;
	currentLength: number;
	constructor(options?: TransformOptions & {length?: number}){
		super(options);
		this.totalLength = 0;
		this.currentLength = 0;
		if(options && options.length){
			this.totalLength = options.length;
		}
	}
	_transform(data: any, encoding: BufferEncoding, callback: TransformCallback){
		if(typeof data === "string"){
			data = Buffer.from(data, encoding);
		}
		this.push(data);
		this.currentLength += data.length;
		this.emit("progress", this.currentLength, this.totalLength);
		callback();
	}
}
