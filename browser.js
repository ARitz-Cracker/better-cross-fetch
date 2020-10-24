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
	BLOB: 4
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

const encodeQuerystring = function(object){
	let result = "";
	for(const key in object){
		const value = object[key];
		result += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(value);
	}
	return result.substring(1);
}

const fillDefaults = function(options){
	for(let k in defaultOptions){
		if(options[k] === undefined){
			options[k] = defaultOptions[k];
		}
	}
}

const betterCrossFetch = function(url, options = {}){
	fillDefaults(options);
	const xhr = new XMLHttpRequest();
	let resolvePromise;
	const returnedPromise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		if(options.getData){
			url += "?" + encodeQuerystring(options.getData);
		}
		let method;
		if(options.method){
			method = options.method;
		}else{
			if(options.responseType === RESPONSE_TYPES.HEAD){
				method = "HEAD";
			}else if(options.postDataType === POST_TYPES.NONE){
				method = "GET";
			}else{
				method = "POST";
			}
		}
		xhr.open(method, url);
        for (const header in options.headers){
			xhr.setRequestHeader(header, options.headers[header]);
		}
		xhr.onprogress = (e) => {
			options.onDownloadProgress(e.loaded, e.total);
		}
		xhr.upload.onprogress = (e) => {
			options.onUploadProgress(e.loaded, e.total);
		}
		switch(options.responseType){
			case RESPONSE_TYPES.TEXT:
				xhr.responseType = "text";
				break;
			case RESPONSE_TYPES.JSON:
				xhr.responseType = "json";
				xhr.setRequestHeader("Accept", "application/json");
				break;
			case RESPONSE_TYPES.BUFFER:
				xhr.responseType = "arraybuffer";
				break;
			case RESPONSE_TYPES.BLOB:
				xhr.responseType = "blob";
				break;
		}
		xhr.onerror = (e) => {
			reject(new CrossFetchRequestError(0, "Unable to connect", {}, null, url));
		}
		xhr.onload = (e) => {
			const headers = {};
			xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(function (line) {
				const parts = line.split(': ');
				const header = parts.shift();
				const value = parts.join(': ');
				headers[header] = value;
			});
			if(xhr.status >= 400 && options.throwOnErrorStatus){
				reject(new CrossFetchRequestError(xhr.status, xhr.statusText, headers, xhr.response, xhr.responseURL));
				return;
			}
			resolve({
				status: xhr.status,
				statusText: xhr.statusText,
				response: xhr.response,
				headers,
				url: xhr.responseURL
			});
		}
        let body;
		switch(options.postDataType){
			case POST_TYPES.NONE:
				xhr.send();
				break;
			case POST_TYPES.URI:
				xhr.send(new URLSearchParams(encodeQuerystring(options.postData)));
				break;
			case POST_TYPES.MULTIPART:
				body = new FormData();
				for(const key in options.postData){
					const value = options.postData[key];
					if(typeof value === "string" || typeof value.byteLength === "number"){
						// String or ArrayBuffer
						body.append(key, value);
					}else if(value.size != null && value.type != null){
						if(value.name == null){
							// We assume it's a Blob
							body.append(key, value);
						}else{
							// We assume it's a file
							body.append(key, value, value.name);
						}
					}else if(value.buffer){
						// We assume a TypedArray, like Uint8Array
						body.append(key, value.buffer);
					}else{
						throw new Error("Unknown object in form data");
					}
				}
				xhr.send(body);
				break;
			case POST_TYPES.JSON:
				xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
				xhr.send((new TextEncoder()).encode(JSON.stringify(options.postData)));
				break;
			default:
				throw new Error("Unknown postDataType " + options.postDataType);
		}
	});
	returnedPromise.abort = () => {
		xhr.abort();
		resolvePromise(null);
	}
	return returnedPromise;
}

module.exports = {betterCrossFetch, CrossFetchRequestError, POST_TYPES, RESPONSE_TYPES}
