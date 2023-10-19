# better-cross-fetch

Adding yet another more request making library to the pile. Works on NodeJS and browsers.

It's "better" because I made it.

## ...why? There are so many...

While I would love to use the native `fetch` API on browsers and use one of the many pre-existing polyfills for NodeJS,
my issue is that sometimes I want to show progress bars for larger file uploads, and so building on top of good ol'
`XMLHttpRequest` was the answer. And if I was going to make a web-request library anyway, might as well make it
cross-platform. 

Oh and it also supports content compression on the NodeJS side, isn't that neat?

## Fine, how do I use this?

Like this.

```js
const {betterCrossFetch} = require("better-cross-fetch")

const url = "https://aritzcracker.ca";
const options = {
	headers: {
		"some-header": "some-value";
	},
	responseType: "text",
	throwOnErrorStatus: true,
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
	},
	url: "https://www.aritzcracker.ca/" // The final URL after any redirects
}
```

## What's the responseType property?

It chooses how to interpret the server response. Here are the possible values and their effects

* `"head"` HEAD request, only gets the headers.
* `"text"` The result's `response` property will be a string.
* `"json"` The response will be parsed as JSON, the result's `response` property will be the resulting object. This
also sets the `accept` request header to `application/json`.
* `"buffer"` The result's `response` will be a `Buffer`.
  * If this option is used on browsers, a global `Buffer` class is expected. Consider setting your bundler to use
  [buffer-lite](https://www.npmjs.com/package/buffer-lite)!
* `"blob"` The result's `response` property will be a `Blob`.
* `"dom"` The result's `response` property will be a `Document` (Browser only).
* `"stream"` The result's `response` property will be a `Readable` (readable stream) (NodeJS only).

## Can I easily attach querystring data to the URL?

Yep! In fact, there's multiple ways. You can either use the `URL` object as your URL, or use the `getData` property of
the `options`, which can be an object representing a `string` -> `string` map, an array of string pairs, or a
`URLSearchParams` object. Note that using `options.getData` will over-write any pre-existing query data in the `url`
argument.

## How can I send POST data?

Take a look at the `post` property in your `options` and let your intellisense guide you. Use `{type: "uri", data: {...}}` for simple key-value pairs, or `{type: "multipart", data: {...}}` if you want to include binary data or files. There's also `{type: "json", data: {...}}` for API's that like that sorda thing. You're also free to put a `FormData` there if that's more convenient for you.

## Any pitfalls?

There are 2 http statuses, 307 and 308, that require forms to be re-submitted at the redirect. POSTing NodeJS streams will break things when those redirects occur, because the stream has already been consumed on the first request, and this library doesn't provide a way to restart streams when this happens.
