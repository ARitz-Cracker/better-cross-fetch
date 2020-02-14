const {Transform} = require("stream");
class PassthroughProgress extends Transform{
	constructor(options){
		super(options);
		this.totalLength = 0;
		this.currentLength = 0;
		if(options && options.length){
			this.totalLength = options.length;
		}
	}
	_transform(data, encoding, callback){
		if(typeof data === "string"){
			data = Buffer.from(data, encoding);
		}
		this.push(data);
		this.currentLength += data.length;
		this.emit("progress", this.currentLength, this.totalLength);
		callback();
	}
}
module.exports = {PassthroughProgress};
