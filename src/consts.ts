// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'HenYan\'s Blog';
export const SITE_DESCRIPTION = 'Tech insights & life stories — a personal blog by HenYan.';
export const SITE_URL = 'https://henyan224.com';

export const CATEGORIES = {
	tech: {
		label: 'Tech',
		labelZh: '技术',
		description: 'Technical articles about AI, coding, and engineering.',
		color: '#6366f1',
	},
	life: {
		label: 'Life',
		labelZh: '生活',
		description: 'Life stories, thoughts, and personal reflections.',
		color: '#f59e0b',
	},
} as const;

export type Category = keyof typeof CATEGORIES;
