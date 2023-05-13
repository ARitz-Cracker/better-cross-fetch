import { BetterCrossFetchOptions, ResponseType, BetterCrossFetchResponse, CrossFetchRequestError} from "./common";
export { BetterCrossFetchOptions, BetterCrossFetchResponse, CrossFetchRequestError, ResponseType } from "./common";

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
			const xhr = new XMLHttpRequest();
			if (options.getData) {
				if (options.getData instanceof URLSearchParams) {
					url += "&" + options.getData;
				}else{
					url += "&" + new URLSearchParams(options.getData);
				}
				
			}
			xhr.open(
				options.responseType == "head" ? "HEAD" :
					(options.post == null ? "GET" : "POST"),
				url
			);
			for (const header in options.headers) {
				xhr.setRequestHeader(header, options.headers[header]);
			};
			const onDownloadProgressCallback = options.onDownloadProgress;
			if (onDownloadProgressCallback) {
				xhr.onprogress = (e) => {
					onDownloadProgressCallback(e.lengthComputable, e.loaded, e.total);
				}
			}
			const onUploadProgressCallback = options.onUploadProgress;
			if (onUploadProgressCallback) {
				xhr.upload.onprogress = (e) => {
					onUploadProgressCallback(e.lengthComputable, e.loaded, e.total);
				}
			}
			switch(options.responseType){
				case "head":
				case "text":
					xhr.responseType = "text";
					break;
				case "dom":
					xhr.responseType = "document";
					break;
				case "json":
					xhr.responseType = "json";
					xhr.setRequestHeader("Accept", "application/json");
					break;
				case "buffer":
					xhr.responseType = "arraybuffer";
					break;
				case "blob":
					xhr.responseType = "blob";
					break;
				case "stream":
					// Maybe this will be done when the modern fetch api is used.
					throw new Error("Better cross fetch currently doesn't support \"stream\" on the browser");
			}
			xhr.onerror = (e) => {
				reject(new CrossFetchRequestError(0, "Unable to connect", {}, null, url + ""));
			}
			xhr.onload = (e) => {
				const headers: {[name: string]: string;} = {};
				xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(function (line) {
					const parts = line.split(': ');
					const header = parts.shift() + "";
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
					response: options.responseType == "buffer" ? Buffer.from(xhr.response) : xhr.response,
					headers,
					url: xhr.responseURL
				});
			}

			if (abortController) {
				abortController.signal.onabort = (_e) => {
					xhr.abort();
					resolve(null);
				}
			}
			if (options.post) {
				switch(options.post.type) {
					case "uri":
						xhr.send(new URLSearchParams(options.post.data));
						break;
					case "multipart": {
						const body = new FormData();
						for(const key in options.post.data){
							const value = options.post.data[key];
							if (value instanceof File) {
								body.append(key, value, value.name);
								continue;
							}
							if (
								typeof value == "string" ||
								value instanceof Blob
							) {
								body.append(key, value);
								continue;
							}
							if (value instanceof Uint8Array) {
								body.append(key, new Blob([value]));
								continue;
							}
							throw new Error("Better cross fetch currently doesn't support \"stream\" on the browser");
						}
						xhr.send(body);
						break;
					}
					case "json":
						xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
						xhr.send((new TextEncoder()).encode(JSON.stringify(options.post.data)));
						break;
				}
			}else{
				xhr.send();
			}
		}catch(ex){
			reject(ex);
		}
	});
}
