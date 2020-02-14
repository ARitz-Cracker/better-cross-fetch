# better-cross-fetch

Aritz's NIH syndrome strikes again!

## What did you re-invent this time?

A cross-platform (NodeJS and browser) fetch-like API!

## Oh god why?

Because default `fetch` didn't allow me to see upload/download progress, and I
thought that since I was making a fetch wrapper, might as well make it work on
the server-side as well for easy request making.

Oh and it also supports content compression on the NodeJS side, isn't that neat?

## But surely there's other libraries out there that do these things?

😏

## Fine, how do I use this?

Like this.

```js
const {betterCrossFetch, RESPONSE_TYPES, POST_TYPES} = require("better-cross-fetch")

const url = "https://aritzcracker.ca";
const options = {
	headers: {
		"some-header": "some-value";
	},
	responseType: RESPONSE_TYPES.TEXT,
	throwOnErrorStatus: true, 
	postDataType: POST_TYPES.NONE,
	onUploadProgress: (current, total) => {
		console.log("Uploaded", current, "out of", total, "bytes!")
	},
	onDownloadProgress: (current, total) => {
		console.log("Downloaded", current, "out of", total, "bytes!")
	},
}

await betterCrossFetch(url, options);
```

That will return something like this:

```js
{
	status: 200,
	statusText: "OK",
	response: "<!DOCTYPE html>...",
	headers: {
		server: "nginx/xxx"
	}
}
```

## What's the responseType property?

It chooses how to interpret the server response. Here are the possible values and their effects

* `RESPONSE_TYPES.HEAD` HEAD request, only gets the headers.
* `RESPONSE_TYPES.TEXT` the result's `response` property will be a string.
* `RESPONSE_TYPES.JSON` the response will be parsed as JSON, the result's `response` property will be the resulting object.
* `RESPONSE_TYPES.BUFFER` the result's `response` property will be an `ArrayBuffer` on the browser, or a `Buffer` in node.
* `RESPONSE_TYPES.BLOB` (Only available on browsers) the result's `response` property will be a `Blob`.
* `RESPONSE_TYPES.STREAM` (Only available on browsers) the result's `response` property will be a `ReadableStream`.

## Can I add querystring data to the URL without doing it myself?

Yep! Just set `getData` in your `options` to an object with key-value pairs! `{a: "b", c: "d"}` becomes `?a=b&c=d`

## How can I send POST data?

First you must set the `postDataType` property in your `options`. It can be one of the following:

* `POST_TYPES.URI` Normal, non-binary form data. (Use this if you're not uploading files)
* `POST_TYPES.JSON` Yeah! This is a thing! Some APIs (other than my own) actually use this!
* `POST_TYPES.MULTIPART` Use this if you're uploading files or other binary data

Then set the `postData` property to an object with key-value pairs.

On the browser, the values can be `string`'s, `ArrayBuffer`'s, `Uint8Array`'s, `Blob`'s, or `File`'s.

On NodeJS, the values can be `string`'s, `Buffer`'s, `Uint8Array`'s or an object formatted like the following:
```js
{
	filename: "file.txt",
	size: 216, // THIS IS REQUIRED
	type: "text/plain",
	value: someReadableStream || someBuffer // THIS IS REQUIRED
}
```
