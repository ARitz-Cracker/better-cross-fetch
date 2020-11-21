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
	constructor(status, statusText, headers = {}, response = null, url){
		super(status + " " + statusText);
		this.status = status;
		this.statusText = statusText;
		this.response = response;
		this.headers = headers;
		this.url = url;
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
	if(options.method){
		httpOptions.method = options.method;
	}else{
		if(options.responseType === RESPONSE_TYPES.HEAD){
			httpOptions.method = "HEAD";
		}else if(options.postDataType === POST_TYPES.NONE){
			httpOptions.method = "GET";
		}else{
			httpOptions.method = "POST";
		}
	}

	const req = h.request(url, httpOptions);
	for(const header in options.headers){
		req.setHeader(header, options.headers[header]);
	}
	if(options.responseType === RESPONSE_TYPES.JSON){
		req.setHeader("Accept", "application/json");
	}
	const returnablePromise = new Promise((resolve, reject) => {
		req.once('error', (err) => {
			reject(err);
		});
		req.once("response", async (response) => {
			try{
				if(response.statusCode >= 300 && response.statusCode < 400){
					if(response.statusCode === 304){
						resolve({
							status: response.statusCode,
							statusText: http.STATUS_CODES[response.statusCode],
							headers: response.headers,
							url: url.href
						});
						return;
					}

					if(response.headers.location.startsWith("https://")){
						url.href = response.headers.location;
					}else if(response.headers.location.startsWith("/")){
						url.pathname = response.headers.location;
					}else{
						if(url.pathname.endsWith("/")){
							url.pathname += response.headers.location;
						}else{
							url.pathname = url.pathname.substring(0, url.pathname.lastIndexOf("/") + 1) + response.headers.location;
						}
					}
					if(response.statusCode === 307 || response.statusCode === 308){
						// 307 and 308 require the method do not change on ridirects
						resolve(betterCrossFetch(url, options));
					}else{
						// Everyone else effectively treats 301 and 302 as a 303. So I will too
						resolve(betterCrossFetch(url, {
							headers: options.headers,
							responseType: options.responseType,
							throwOnErrorStatus: options.throwOnErrorStatus,
							onUploadProgress: options.onUploadProgress,
							onDownloadProgress: options.onDownloadProgress
						}));
					}
					
					return;
				}
				const length = Number(response.headers["content-length"]);
				let streamOutput;
				let responseProgress = new PassthroughProgress({length});
				responseProgress.on("progress", options.onDownloadProgress);
				response.pipe(responseProgress);
				let finalResponseData;
				if(length === 0 || response.statusCode === 204 || options.responseType === RESPONSE_TYPES.HEAD){
					streamOutput = responseProgress;
				}else{
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
				}
				if(options.responseType === RESPONSE_TYPES.HEAD){
					streamOutput.on("data", Function.prototype);
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
								finalResponseData = null;
							}
						}
					}
				}
				if(response.statusCode >= 400 && options.throwOnErrorStatus){
					throw new CrossFetchRequestError(
						response.statusCode,
						http.STATUS_CODES[response.statusCode],
						response.headers,
						finalResponseData,
						url.href
					);
				}
				resolve({
					status: response.statusCode,
					statusText: http.STATUS_CODES[response.statusCode],
					headers: response.headers,
					response: finalResponseData,
					url: url.href
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
			const postDataStreams = {};
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
					postDataStreams[name] = new BufferToStream(value);
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
						postDataStreams[name] = new BufferToStream(value.value);
					}else{
						postDataStreams[name] = value.value; // assume stream
					}
					totalLength += (value.size || value.value.length) + 2;
				}
				totalLength += postDataHeaders[name].length;
			}
			
			totalLength += endOfMessage.length;
			req.setHeader("Content-Length", totalLength);
			uploadStream.totalLength = totalLength;
			for(const name in postDataStreams){
				uploadStream.write(postDataHeaders[name]);
				postDataStreams[name].pipe(uploadStream, {end: false});
				await new Promise((resolve) => {
					postDataStreams[name].once("end", resolve);
				})
				uploadStream.write("\r\n");
			}
			uploadStream.write(endOfMessage);
			uploadStream.end();
			break;
		}
		case POST_TYPES.JSON:{
			req.setHeader("Content-Type", "application/json; charset=UTF-8");
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
