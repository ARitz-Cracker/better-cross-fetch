import { Readable } from "stream";

export type ResponseType = "head" | "text" | "dom" | "json" | "buffer" | "blob" | "stream";
export type ResponseTypeMap = {
	[T in ResponseType]: T extends "head" ? null :
	T extends "text" ? string :
	T extends "dom" ? Document :
	T extends "json" ? any :
	T extends "buffer" ? Buffer :
	T extends "blob" ? Blob :
	T extends "stream" ? Readable :
	never;
};

export type NodeFile = {
	size: number,
	filename?: string,
	type?: string,
	value: Buffer | Readable
}

export type PostDataType = "uri" | "json" | "multipart";
export type PostDataText = {
	type: "uri",
	data: URLSearchParams | {[name: string]: string;} | Record<string, string> | [string, string][],
}
export type PostDataJson = {
	type: "json",
	data: any
}
export type PostDataMultipart = {
	type: "multipart",
	data: {[key: string]: string | Uint8Array | Blob | File | NodeFile;}
}

export type progressCallback = (measurable: boolean, current: number, total: number) => void;

export interface BetterCrossFetchOptions<T extends ResponseType> {
	headers?: {[name: string]: string;},
	responseType: T,
	throwOnErrorStatus?: boolean,
	// Why limit people?
	getData?: URLSearchParams | {[name: string]: string;} | Record<string, string> | [string, string][],
	post?: PostDataText | PostDataJson | PostDataMultipart,
	onUploadProgress?: progressCallback,
	onDownloadProgress?: progressCallback
}

export interface BetterCrossFetchResponse<T extends ResponseType> {
	status: number,
	statusText: string,
	headers: {[name: string]: string;}
	response: ResponseTypeMap[T],
	url: string
}

export class CrossFetchRequestError<T extends ResponseType> extends Error{
	name!: "CrossFetchRequestError";
	status: number;
	statusText: string;
	headers: {[name: string]: string;}
	response: ResponseTypeMap[T];
	url: string;
	constructor(status: number, statusText: string, headers: {[name: string]: string;} = {}, response: ResponseTypeMap[T], url: string){
		super(status + " " + statusText);
		this.status = status;
		this.statusText = statusText;
		this.response = response;
		this.headers = headers;
		this.url = url;
	}
}
CrossFetchRequestError.prototype.name = "CrossFetchRequestError";
