import TurndownService from 'turndown'

const service = new TurndownService({
  bulletListMarker: '-',
  listIndent: '   ', // 3 spaces
  blankReplacement: (content, node) => {
    if (node.isBlock) {
      return '\n\n'
    }

    // This fixes an issue with turndown where an element with a space
    // inside can be removed causing a jarring HTML coversion.
    const hasWhitespace = /\s/.test(node.textContent)
    const hasFlanking = node.flankingWhitespace.trailing || node.flankingWhitespace.leading

    return hasWhitespace && !hasFlanking ? ' ' : ''
  }
})

// define all the elements we want stripped from output
const elementsToRemove = [
  'title',
  'script',
  'noscript',
  'style',
  'video',
  'audio',
  'object',
  'iframe'
]

for (const element of elementsToRemove) {
  service.remove(element)
}

// As a user may have pasted markdown we rather crudley
// stop all escaping
service.escape = (string) => string

// turndown keeps title attribute attributes of links by default which isn't
// what is expected in govspeak
service.addRule('link', {
  filter: (node) => {
    return node.nodeName.toLowerCase() === 'a' && node.getAttribute('href')
  },
  replacement: (content, node) => {
    if (content.trim() === '') {
      return ''
    } else {
      return `[${content}](${node.getAttribute('href')})`
    }
  }
})

service.addRule('abbr', {
  filter: (node) => {
    return node.nodeName.toLowerCase() === 'abbr' && node.getAttribute('title')
  },
  replacement: function (content, node) {
    this.references[content] = node.getAttribute('title')
    return content
  },
  references: {},
  append: function () {
    if (Object.keys(this.references).length === 0) {
      return ''
    }

    let references = '\n\n'
    for (const abbr in this.references) {
      references += `*[${abbr}]: ${this.references[abbr]}\n`
    }
    this.references = {} // reset after appending
    return references
  }
})

// GOV.UK content authors are encouraged to only use h2 and h3 headers, this
// converts other headers to be one of these (except h6 which is converted
// to a paragraph
service.addRule('heading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    let prefix
    let number = node.nodeName.charAt(1)
    if (number === '1' || number === '2') {
      prefix = '## '
    } else if (number === '3' || number === '4' || number === '5') {
      prefix = '### '
    } else {
      prefix = ''
    }

    return `\n\n${prefix}${content}\n\n`
  }
})

// remove images
// this needs to be set as a rule rather than remove as it's part of turndown
// commonmark rules that needs overriding
service.addRule('img', {
  filter: ['img'],
  replacement: () => ''
})

// remove bold
service.addRule('bold', {
  filter: ['b', 'strong'],
  replacement: (content) => content
})

// remove italic
service.addRule('italic', {
  filter: ['i', 'em'],
  replacement: (content) => content
})

service.addRule('removeEmptyParagraphs', {
  filter: (node) => {
    return node.nodeName.toLowerCase() === 'p' && node.textContent.trim() === ''
  },
  replacement: () => ''
})

// strip paragraph elements within list items
service.addRule('stripParagraphsInListItems', {
  filter: (node) => {
    return node.nodeName.toLowerCase() === 'p' &&
      node.parentNode.nodeName.toLowerCase() === 'li'
  },
  replacement: (content) => content
})

service.addRule('cleanUpNestedLinks', {
  filter: (node) => {
    if (node.nodeName.toLowerCase() === 'a' && node.previousSibling) {
      return node.previousSibling.textContent.match(/\]\($/)
    }
  },
  replacement: (content, node) => {
    return node.getAttribute('href')
  }
})

// Google docs has a habit of producing nested lists that are not nested
// with valid HTML. Rather than embedding sub lists inside an <li> element they
// are nested in the <ul> or <ol> element.
service.addRule('invalidNestedLists', {
  filter: (node) => {
    const nodeName = node.nodeName.toLowerCase()
    if ((nodeName === 'ul' || nodeName === 'ol') && node.previousElementSibling) {
      const previousNodeName = node.previousElementSibling.nodeName.toLowerCase()
      return previousNodeName === 'li'
    }
  },
  replacement: (content, node, options) => {
    content = content
      .replace(/^\n+/, '') // remove leading newlines
      .replace(/\n+$/, '') // replace trailing newlines
      .replace(/\n/gm, `\n${options.listIndent}`) // indent all nested content in the list

    // indent this list to match sibling
    return options.listIndent + content + '\n'
  }
})

// This is ported from https://github.com/domchristie/turndown/blob/80297cebeae4b35c8d299b1741b383c74eddc7c1/src/commonmark-rules.js#L61-L80
// It is modified in the following ways:
// - Only determines ol ordering based on li elements
// - Removes handling of ol start attribute as this doesn't affect govspeak output
// - Makes spacing consistent with gov.uk markdown guidance
service.addRule('listItems', {
  filter: 'li',
  replacement: function (content, node, options) {
    content = content
      .replace(/^\n+/, '') // remove leading newlines
      .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
      .replace(/\n/gm, `\n${options.listIndent}`) // indent all nested content in the list

    let prefix = options.bulletListMarker + ' '
    const parent = node.parentNode
    if (parent.nodeName.toLowerCase() === 'ol') {
      const listItems = Array.prototype.filter.call(
        parent.children, (element) => element.nodeName.toLowerCase() === 'li'
      )
      const index = Array.prototype.indexOf.call(listItems, node)
      prefix = (index + 1).toString() + '. '
    }
    return (
      prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
    )
  }
})

function removeBrParagraphs (govspeak) {
  // This finds places where we have a br in a paragraph on it's own and
  // removes it.
  //
  // E.g. if we have HTML of <b><p>Text</p><br><p>More text</p></b> (as google
  // docs can easily produce) which produces govspeak of
  // "Text\n\n  \n\nMore Text". This regexp can strip this back to be
  // Text\n\nMore Text
  const regExp = new RegExp(`\n(${service.options.br}\n)+\n?`, 'g')
  return govspeak.replace(regExp, '\n')
}

function extractHeadingsFromLists (govspeak) {
  // This finds instances of headings within ordered lists and replaces them
  // with the headings only. This only applies to H2 and H3.
  const headingsInListsRegExp = /\d\.\s(#{2,3})/g
  return govspeak.replace(headingsInListsRegExp, '$1')
}

function postProcess (govspeak) {
  const govspeakWithExtractedHeadings = extractHeadingsFromLists(govspeak)
  const brsRemoved = removeBrParagraphs(govspeakWithExtractedHeadings)
  const whitespaceStripped = brsRemoved.trim()
  return whitespaceStripped
}

export default function htmlToGovspeak (html) {
  const govspeak = service.turndown(html)
  return postProcess(govspeak)
}
