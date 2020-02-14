
const{Writable, Readable} = require("stream");
class StreamToBuffer extends Writable {
	constructor(){
		super();
		this._buffer = Buffer.alloc(0);
	}
	_write(chunk, encoding, callback){
		this._buffer = Buffer.concat([ this._buffer, chunk ], this._buffer.length + chunk.length);
		callback();
	}
	_final(callback){
		this.finished = true;
		this.emit("result", this._buffer);
		callback();
	}
	result(){
		if(this.finished){
			return Promise.resolve(this._buffer);
		}
		return new Promise((resolve, reject) => {
			this.once("result", resolve);
			this.once("error", reject);
		});
	}
}
class BufferToStream extends Readable {
	constructor(buffer){
		super();
		this._buffer = buffer;
	}
	_read(size){
		if(size >= this._buffer.length){
			this.push(this._buffer);
			this.push(null);
		}else{
			this.push(this._buffer.slice(0, size));
			this._buffer = this._buffer.slice(size);
		}
	}
}

module.exports = {
	BufferToStream,
	StreamToBuffer
};
