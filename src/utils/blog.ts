import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export function getPostSlug(post: BlogPost): string {
	return post.data.slug ?? post.id;
}

export function getPostUrl(post: BlogPost): string {
	return `/blog/${getPostSlug(post)}/`;
}
