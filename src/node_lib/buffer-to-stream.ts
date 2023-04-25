
import {Writable, Readable} from "stream";

export class StreamToBuffer extends Writable {
	private _buffer: Buffer;
	finished: boolean = false;
	constructor(){
		super();
		this._buffer = Buffer.alloc(0);
	}
	_write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void){
		this._buffer = Buffer.concat([ this._buffer, chunk ], this._buffer.length + chunk.length);
		callback();
	}
	_final(callback: (error?: Error | null) => void){
		this.finished = true;
		this.emit("result", this._buffer);
		callback();
	}
	result(): Promise<Buffer> {
		if(this.finished){
			return Promise.resolve(this._buffer);
		}
		return new Promise((resolve, reject) => {
			this.once("result", resolve);
			this.once("error", reject);
		});
	}
}
export class BufferToStream extends Readable {
	private _buffer: any;
	constructor(buffer: Buffer){
		super();
		this._buffer = buffer;
	}
	_read(size: number){
		if(size >= this._buffer.length){
			this.push(this._buffer);
			this.push(null);
		}else{
			this.push(this._buffer.slice(0, size));
			this._buffer = this._buffer.slice(size);
		}
	}
}
