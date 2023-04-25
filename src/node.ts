import zlib from "zlib";
import https from "https";
import http from "http";
// import { randomBytes } from "crypto";
import { BufferToStream, StreamToBuffer } from "./node_lib/buffer-to-stream";
import { PassthroughProgress } from "./node_lib/passthrough-progress";
import querystring from "querystring";
import { BetterCrossFetchOptions, BetterCrossFetchResponse, CrossFetchRequestError, ResponseType, ResponseTypeMap } from "./common";

const HTTPS_REQUEST_AGENT = new https.Agent();
const HTTP_REQUEST_AGENT = new http.Agent();

function emptyBody<T extends ResponseType>(t: ResponseType): ResponseTypeMap[T] {
	switch (t) {
		case "blob":
			// No idea why these any's are required
			return new Blob() as any;
		case "buffer":
			return Buffer.alloc(0) as any;
		case "dom":
			throw new Error("dom return type currently isn't available in node");
		case "head":
			return null as any;
		case "json":
			return {} as any;
		case "stream":
			return new BufferToStream(Buffer.alloc(0)) as any;
		case "text":
			return "" as any;
		default:
			throw new Error("Unknown type " + t);
	}
}

export function betterCrossFetch<T extends ResponseType>(
	url: string | URL,
	options: BetterCrossFetchOptions<T>,
	abortController: AbortController
): Promise<BetterCrossFetchResponse<T> | null>;
export function betterCrossFetch<T extends ResponseType>(
	url: string | URL,
	options: BetterCrossFetchOptions<T>
): Promise<BetterCrossFetchResponse<T>>;
export function betterCrossFetch<T extends ResponseType>(
	url: string | URL,
	options: BetterCrossFetchOptions<T>,
	abortController?: AbortController
): Promise<BetterCrossFetchResponse<T> | null>
{
	return new Promise((resolve, reject) => {
		try{
			const headers = options.headers || {};
			headers.Accept = headers.Accept || "*/*";
			headers["Accept-Encoding"] = "br, gzip, deflate";
			// some CDNs yell at you if you don't have a User-Agent
			headers["User-Agent"] = headers["User-Agent"] || "NodeJS/" + process.version.substring(1);
			if(options.getData){
				url += "?" + new URLSearchParams(options.getData);
				delete options.getData;
			}
			if(typeof url === "string"){
				url = new URL(url);
			}
			
			const h = url.protocol === "https:" ? https : http;
			const httpOptions: http.RequestOptions = {};
			
			httpOptions.agent = url.protocol === "https:" ? HTTPS_REQUEST_AGENT : HTTP_REQUEST_AGENT;
			httpOptions.method = options.responseType == "head" ? "HEAD" :
				(options.post == null ? "GET" : "POST");
	
			const req = h.request(url, httpOptions);
			for(const header in options.headers){
				req.setHeader(header, options.headers[header]);
			}
			if(options.responseType === "json"){
				req.setHeader("Accept", "application/json");
			}
			req.once('error', (err) => {
				reject(err);
			});
			const urlObj = url;
			req.once("response", async (response) => {
				try{
					const statusCode = response.statusCode!;

					if(statusCode >= 300 && statusCode < 400){
						if(statusCode === 304 || !response.headers.location){
							resolve({
								status: statusCode,
								statusText: http.STATUS_CODES[statusCode] + "",
								headers: response.headers as any,
								url: urlObj.href,
								response: emptyBody(options.responseType)
							});
							return;
						}
						if(response.headers.location.startsWith("https://")){
							urlObj.href = response.headers.location;
						}else if(response.headers.location.startsWith("/")){
							urlObj.pathname = response.headers.location;
						}else{
							if(urlObj.pathname.endsWith("/")){
								urlObj.pathname += response.headers.location;
							}else{
								urlObj.pathname = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf("/") + 1) + response.headers.location;
							}
						}
						if(response.statusCode === 307 || response.statusCode === 308){
							// 307 and 308 require the method do not change on ridirects
							resolve(betterCrossFetch(urlObj, options));
						}else{
							// Everyone else effectively treats 301 and 302 as a 303. So I will too
							resolve(betterCrossFetch(urlObj, {
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
					if (options.onDownloadProgress) {
						responseProgress.on("progress", options.onDownloadProgress);
					}
					response.pipe(responseProgress);
					let finalResponseData;
					if(length === 0 || response.statusCode === 204 || options.responseType === "head"){
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
					if(options.responseType === "head"){
						streamOutput.on("data", () => {});
						finalResponseData = null;
					}else if(options.responseType === "stream"){
						finalResponseData = streamOutput;
					}else{
						finalResponseData = await streamOutput.pipe(new StreamToBuffer()).result();
						if(options.responseType == "blob") {
							finalResponseData = new Blob([finalResponseData]);
						}else if(options.responseType !== "buffer"){
							finalResponseData = finalResponseData.toString();
							if(options.responseType === "json"){
								try{
									finalResponseData = JSON.parse(finalResponseData);
								}catch(ex){
									finalResponseData = null;
								}
							}
						}
					}
					if(statusCode >= 400 && options.throwOnErrorStatus){
						throw new CrossFetchRequestError(
							statusCode,
							http.STATUS_CODES[statusCode] + "",
							response.headers as any,
							finalResponseData,
							urlObj.href
						);
					}
					resolve({
						status: statusCode,
						statusText: http.STATUS_CODES[statusCode] + "",
						headers: response.headers as any,
						response: finalResponseData,
						url: urlObj.href
					});
				}catch(ex){
					reject(ex);
				}
	
			});	
		}catch(ex){
			reject(ex);
		}
	});
};