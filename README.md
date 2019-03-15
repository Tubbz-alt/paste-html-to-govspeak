# Paste HTML to govspeak

Converts HTML formatted rich content to [govspeak][] format (a markdown extension library for government editors) when pasted from clipboard into a form input or textarea.

## Installation

Add the compiled `/dist/paste-html-to-markdown.js` to your application assets.

An npm installation will be available at a future point.

## Usage

```js
element.addEventListener('paste', window.pasteHtmlToGovspeak)
```

## Browser support

- Chrome
- Firefox
- Safari
- Internet Explorer 11
- Microsoft Edge

## Development

```
npm install
npm test
```

To continuously build files while developing run:

```
npm run watch
```

## License

Distributed under the MIT license. See LICENSE for details.

[govspeak]: https://github.com/alphagov/govspeak
