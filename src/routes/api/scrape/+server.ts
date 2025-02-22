import { type RequestHandler, json } from '@sveltejs/kit'
import * as cheerio from 'cheerio'

export const POST: RequestHandler = async ({ request }) => {
	const { url } = await request.json()

	const response = await fetch(url)
	const html = await response.text()
	const $ = cheerio.load(html)

	// Remove unnecessary elements
	$('script').remove()
	$('style').remove()

	// Convert headings to Markdown
	$('h1, h2, h3, h4, h5, h6').each((_, el) => {
		const level = Number.parseInt(el.tagName.substring(1))
		const text = $(el).text().trim()
		$(el).replaceWith(`${'#'.repeat(level)} ${text}\n\n`)
	})

	// Convert links to Markdown format
	$('a').each((_, el) => {
		const text = $(el).text().trim()
		const href = $(el).attr('href')
		$(el).replaceWith(`[${text}](${href})`)
	})

	// Convert lists to Markdown
	$('ul, ol').each((_, el) => {
		$(el)
			.find('li')
			.each((i, li) => {
				const text = $(li).text().trim()
				$(li).replaceWith(
					el.tagName.toLowerCase() === 'ul'
						? `- ${text}\n`
						: `${i + 1}. ${text}\n`
				)
			})
	})

	// Convert paragraphs with newlines
	$('p').each((_, el) => {
		const text = $(el).text().trim()
		$(el).replaceWith(`${text}\n\n`)
	})

	// Clean the final markdown text by removing extra whitespaces
	const content = $('body')
		.text()
		.trim()
		.replace(/\n\s+\n/g, '\n\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/ +\n/g, '\n')

	return json({ content })
}
