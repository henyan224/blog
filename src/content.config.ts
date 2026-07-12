import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			category: z.enum(['tech', 'life']),
			tags: z.array(z.string()).default([]),
			slug: z.string().optional(),
			series: z.string().optional(),
			seriesOrder: z.number().optional(),
			draft: z.boolean().default(false),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			articleStyle: z.enum(['narrative', 'technical']).optional(),
			lang: z.enum(['zh', 'en']).default('zh'),
		}),
});

export const collections = { blog };
