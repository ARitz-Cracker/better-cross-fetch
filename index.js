const zlib = require("zlib");
const https = require("https");
const http = require("http");
const {URL} = require("url");
const {randomBytes} = require("crypto");
const {BufferToStream, StreamToBuffer} = require("./lib_node/buffer-to-stream");
const {PassthroughProgress} = require("./lib_node/passthrough-progress");
const querystring = require("querystring");

const POST_TYPES = {
	NONE: 0,
	URI: 1,
	MULTIPART: 2,
	JSON: 3
}
const RESPONSE_TYPES = {
	HEAD: 0,
	TEXT: 1,
	JSON: 2,
	BUFFER: 3,
	STREAM: 4
}
const defaultOptions = {
	headers: {},
	responseType: RESPONSE_TYPES.TEXT,
	throwOnErrorStatus: true,
	postDataType: POST_TYPES.NONE,
	postData: null,
	onUploadProgress: Function.prototype,
	onDownloadProgress: Function.prototype
}

class CrossFetchRequestError extends Error{
	constructor(status, statusText, headers = {}, response = null){
		super(status + " " + statusText);
		this.status = status;
		this.statusText = statusText;
		this.response = response;
		this.headers = headers;
	}
}
CrossFetchRequestError.prototype.name = "CrossFetchRequestError";
const HTTPS_REQUEST_AGENT = new https.Agent();
const HTTP_REQUEST_AGENT = new http.Agent();

const fillDefaults = function(options){
	for(let k in defaultOptions){
		if(options[k] === undefined){
			options[k] = defaultOptions[k];
		}
	}
}

const betterCrossFetch = async function(url, options = {}){
	fillDefaults(options);
	options.headers.Accept = options.headers.Accept || "*/*";
	options.headers["Accept-Encoding"] = "br, gzip, deflate";
	// some CDNs yell at you if you don't have a User-Agent
	options.headers["User-Agent"] = options.headers["User-Agent"] || "NodeJS/" + process.version.substring(1);
	if(options.getData){
		url += "?" + querystring.stringify(options.getData);
		delete options.getData;
	}

	let h;
	let httpOptions = {};
	if(typeof url === "string"){
		url = new URL(url);
	}

	if(url.protocol === "https:"){
		httpOptions.agent = options.agent || HTTPS_REQUEST_AGENT;
		h = https;
	}else if(url.protocol === "http:"){
		httpOptions.agent = options.agent || HTTP_REQUEST_AGENT;
		h = http;
	}else{
		throw new Error("Must start with \"http://\" or \"https://\"");
	}
	if(options.responseType === RESPONSE_TYPES.HEAD){
		httpOptions.method = "HEAD";
	}else if(options.postDataType === POST_TYPES.NONE){
		httpOptions.method = "GET";
	}else{
		httpOptions.method = "POST";
	}

	console.log(url);
	const req = h.request(url, httpOptions);
	for(const header in options.headers){
		req.setHeader(header, options.headers[header]);
	}

	const returnablePromise = new Promise((resolve, reject) => {
		req.once('error', (err) => {
			reject(err);
		});
		req.once("response", async (response) => {
			try{
				if(response.statusCode >= 300 && response.statusCode < 400){
					if(response.headers.location.startsWith("https://")){
						requestOptions.href = response.headers.location;
					}else if(response.headers.location.startsWith("/")){
						requestOptions.pathname = response.headers.location;
					}else{
						requestOptions.pathname += response.headers.location;
					}
					resolve(httpRequest(requestOptions, method, headers, dataOrReadableStream));
					return;
				}
				let streamOutput;
				let responseProgress = new PassthroughProgress({length: Number(response.headers["content-length"])});
				responseProgress.on("progress", options.onDownloadProgress);
				response.pipe(responseProgress);
				let finalResponseData;
				switch (response.headers["content-encoding"]) {
					case "br":
						streamOutput = zlib.createBrotliDecompress();
						responseProgress.pipe(streamOutput);
						break;
					case "gzip":
						streamOutput = zlib.createGunzip();
						responseProgress.pipe(streamOutput);
						break;
					case "deflate":
						streamOutput = zlib.createInflate();
						responseProgress.pipe(streamOutput);
						break;
					default:
						streamOutput = responseProgress;
						break;
				}
				if(options.responseType === RESPONSE_TYPES.NONE || response.statusCode === 204){
					responseProgress.on("data", Function.prototype);
				}else if(options.responseType === RESPONSE_TYPES.STREAM){
					finalResponseData = streamOutput;
				}else{
					finalResponseData = await streamOutput.pipe(new StreamToBuffer()).result();
					if(options.responseType !== RESPONSE_TYPES.BUFFER){
						finalResponseData = finalResponseData.toString();
						if(options.responseType === RESPONSE_TYPES.JSON){
							try{
								finalResponseData = JSON.parse(finalResponseData);
							}catch(ex){

							}
						}
					}
				}
				if(response.statusCode >= 400 && options.throwOnErrorStatus){
					throw new CrossFetchRequestError(
						response.statusCode,
						http.STATUS_CODES[response.statusCode],
						response.headers,
						finalResponseData
					);
				}
				resolve({
					status: response.statusCode,
					statusText: http.STATUS_CODES[response.statusCode],
					headers: response.headers,
					response: finalResponseData
				});
			}catch(ex){
				reject(ex);
			}

		});
	});
	const uploadStream = new PassthroughProgress();
	uploadStream.pipe(req);
	uploadStream.on("progress", options.onUploadProgress);
	switch(options.postDataType){
		case POST_TYPES.NONE:
			uploadStream.end();
			break;
		case POST_TYPES.URI:{
			req.setHeader("Content-Type", "application/x-www-form-urlencoded");
			const data = Buffer.from(querystring.stringify(options.postData));
			uploadStream.totalLength = data.length;
			req.setHeader("Content-Length", data.length);
			(new BufferToStream(data)).pipe(uploadStream);
			break;
		}
		case POST_TYPES.MULTIPART:{
			const boundary = "nodejs-" + crypto.randomBytes(42).toString("base64").replace(/\//g, "_").replace(/\+/g, "-") + "-nodejs";
			let totalLength = 0;
			const postDataHeaders = {};
			const endOfMessage = Buffer.from("--" + boundary + "--");
			req.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
			for(const name in options.postData){
				const value = options.postData[name];
				if(typeof value === "string"){
					value = Buffer.from(value);
				}
				if(value instanceof Uint8Array){
					postDataHeaders[name] = Buffer.from(
						"--" + boundary + "\r\n" +
						"Content-Disposition: form-data; name=\"" + querystring.escape(name) + "\"\r\n" +
						"\r\n"
					);
					options.postData[name] = new BufferToStream(value);
					totalLength += value.length + 2; // 2 extra for the CRLF after the multipart body
				}else{
					if(value.size == null && value.value.length == null){
						throw new Error("Everything must have a size");
					}
					postDataHeaders[name] = Buffer.from(
						"--" + boundary + "\r\n" +
						"Content-Disposition: form-data; name=\"" + querystring.escape(name) + "\"; filename=\"" + value.filename + "\"\r\n" +
						"Content-Type: " + (value.type || "application/octet-stream") + "\r\n" +
						"\r\n"
					);
					if(value.value instanceof Uint8Array){
						options.postData[name] = new BufferToStream(value.value);
					}else{
						options.postData[name] = value.value; // assume stream
					}
					totalLength += (value.size || value.value.length) + 2;
				}
				totalLength += postDataHeaders[name].length;
			}
			
			totalLength += endOfMessage.length;
			req.setHeader("Content-Length", totalLength);
			uploadStream.totalLength = totalLength;
			for(const name in options.postData){
				uploadStream.write(postDataHeaders[name]);
				options.postData[name].pipe(uploadStream, {end: false});
				await new Promise((resolve) => {
					options.postData[name].once("end", resolve);
				})
				uploadStream.write("\r\n");
			}
			uploadStream.write(endOfMessage);
			uploadStream.end();
			break;
		}
		case POST_TYPES.JSON:{
			req.setHeader("Content-Type", "application/json");
			const data = Buffer.from(JSON.stringify(options.postData));
			req.setHeader("Content-Length", data.length);
			uploadStream.totalLength = data.length;
			(new BufferToStream(data)).pipe(uploadStream);
			break;
		}
	}
	return returnablePromise;
}
module.exports = {betterCrossFetch, CrossFetchRequestError, POST_TYPES, RESPONSE_TYPES}
